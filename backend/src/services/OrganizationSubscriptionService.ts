import {
  OrganizationSubscription,
  IOrganizationSubscription,
  OrganizationSubscriptionSource,
  CURRENT_ORGANIZATION_SUBSCRIPTION_STATUSES,
} from '../models/OrganizationSubscription.model';
import { getCompanyPlan } from '../constants/organizationBillingPlan';
import { ApiError } from '../utils/ApiError';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function addThirtyDays(date: Date): Date {
  return new Date(date.getTime() + THIRTY_DAYS_MS);
}

/**
 * Organization (company) subscription lifecycle (PR-B2B-BILL-3). Mirrors
 * UserSubscriptionService's scheduling/cancellation conventions at the
 * organization level, but with NO auto-renew claim anywhere — no recurring
 * Razorpay charge is implemented, so `autoRenew` is always false and every
 * period is either activated by a fresh verified payment, an admin action,
 * or a contract (see OrganizationContractService).
 */
class OrganizationSubscriptionService {
  /** The organization's current (active/trial/past_due) subscription, if any — does not lazily create one. */
  async getCurrentSubscription(organizationId: string): Promise<IOrganizationSubscription | null> {
    return OrganizationSubscription.findOne({
      organizationId,
      status: { $in: CURRENT_ORGANIZATION_SUBSCRIPTION_STATUSES },
    }).sort({ createdAt: -1 });
  }

  async getHistory(organizationId: string, options: { page?: number; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const [subscriptions, total] = await Promise.all([
      OrganizationSubscription.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrganizationSubscription.countDocuments({ organizationId }),
    ]);
    return { subscriptions, page, limit, total };
  }

  /**
   * Activates (or immediately upgrades) a subscription from a verified
   * payment. Called AT MOST ONCE per verified payment — the outer
   * BillingSettlementService CAS already guarantees single-call, so no
   * separate idempotency key is needed inside this method. An existing
   * current subscription is updated IN PLACE (immediate upgrade — this is
   * an MVP with no proration); otherwise a new row is created.
   */
  async activateFromPayment(organizationId: string, planCode: string, providerPaymentId?: string): Promise<IOrganizationSubscription> {
    const plan = getCompanyPlan(planCode);
    if (!plan) {
      throw new ApiError(500, `Unknown company plan code: ${planCode}`);
    }

    const now = new Date();
    const current = await this.getCurrentSubscription(organizationId);

    if (current) {
      current.planCode = plan.code;
      current.status = 'active';
      current.currentPeriodStart = now;
      current.currentPeriodEnd = addThirtyDays(now);
      current.source = 'payment';
      current.autoRenew = false;
      current.cancelAtPeriodEnd = false;
      current.pendingNextPlanCode = undefined;
      current.externalReference = providerPaymentId;
      await current.save();
      return current;
    }

    return OrganizationSubscription.create({
      organizationId,
      planCode: plan.code,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: addThirtyDays(now),
      cancelAtPeriodEnd: false,
      autoRenew: false,
      source: 'payment',
      externalReference: providerPaymentId,
    });
  }

  /**
   * Creates/updates a subscription sourced from a contract (never a
   * payment) — used by OrganizationContractService on contract activation.
   */
  async activateFromContract(
    organizationId: string,
    planCode: string,
    period: { start: Date; end?: Date },
    externalReference?: string
  ): Promise<IOrganizationSubscription> {
    const current = await this.getCurrentSubscription(organizationId);

    if (current) {
      current.planCode = planCode;
      current.status = 'active';
      current.currentPeriodStart = period.start;
      current.currentPeriodEnd = period.end;
      current.source = 'contract';
      current.autoRenew = false;
      current.cancelAtPeriodEnd = false;
      current.pendingNextPlanCode = undefined;
      current.externalReference = externalReference;
      await current.save();
      return current;
    }

    return OrganizationSubscription.create({
      organizationId,
      planCode,
      status: 'active',
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: false,
      autoRenew: false,
      source: 'contract',
      externalReference,
    });
  }

  /**
   * Records the intent to move to a cheaper plan at the CURRENT period's
   * boundary — never immediately, so already-paid entitlement for the
   * current period is never destroyed. Mirrors
   * UserSubscriptionService.scheduleDowngrade's "don't touch current
   * status/period, just record the pending target" logic. Idempotent.
   */
  async scheduleDowngrade(organizationId: string, targetPlanCode: string): Promise<IOrganizationSubscription> {
    const current = await this.getCurrentSubscription(organizationId);
    if (!current) {
      throw new ApiError(400, 'No active subscription to downgrade');
    }

    const targetPlan = getCompanyPlan(targetPlanCode);
    if (!targetPlan || !targetPlan.active) {
      throw new ApiError(400, `Plan "${targetPlanCode}" is not available`);
    }

    const currentPlan = getCompanyPlan(current.planCode);
    if (currentPlan && currentPlan.priceInrPaise !== null && targetPlan.priceInrPaise !== null && targetPlan.priceInrPaise >= currentPlan.priceInrPaise) {
      throw new ApiError(400, 'The selected plan is not a downgrade from the current plan');
    }

    if (current.pendingNextPlanCode === targetPlan.code) {
      return current;
    }

    current.pendingNextPlanCode = targetPlan.code;
    await current.save();
    return current;
  }

  /** Cancels a previously-scheduled downgrade — the current plan simply continues as before. Idempotent. */
  async cancelScheduledDowngrade(organizationId: string): Promise<IOrganizationSubscription | null> {
    const current = await this.getCurrentSubscription(organizationId);
    if (!current || !current.pendingNextPlanCode) {
      return current;
    }
    current.pendingNextPlanCode = undefined;
    await current.save();
    return current;
  }

  /**
   * Cancels the organization's current subscription. With
   * cancelAtPeriodEnd, the current billing period stays active until it
   * ends; otherwise cancellation is immediate. Idempotent.
   */
  async cancelSubscription(organizationId: string, cancelAtPeriodEnd: boolean): Promise<IOrganizationSubscription | null> {
    const current = await this.getCurrentSubscription(organizationId);
    if (!current) {
      return null;
    }

    if (cancelAtPeriodEnd) {
      if (current.currentPeriodEnd && !current.cancelAtPeriodEnd) {
        current.cancelAtPeriodEnd = true;
        current.autoRenew = false;
        await current.save();
      }
      return current;
    }

    if (current.status !== 'cancelled') {
      current.status = 'cancelled';
      current.cancelledAt = new Date();
      current.cancelAtPeriodEnd = false;
      current.autoRenew = false;
      current.pendingNextPlanCode = undefined;
      await current.save();
    }
    return current;
  }

  /** Marks a subscription past_due — foundation for future payment-failure webhook handling. Idempotent. Never touches organization/candidate/job/report data. */
  async markPastDue(organizationId: string): Promise<IOrganizationSubscription | null> {
    const current = await this.getCurrentSubscription(organizationId);
    if (!current || current.status === 'past_due') {
      return current;
    }
    current.status = 'past_due';
    await current.save();
    return current;
  }

  /**
   * Transitions an expired subscription (currentPeriodEnd passed) to
   * 'expired' — a status flip only, never deletes/touches organization
   * data. Applies a pending downgrade at the boundary if one was scheduled,
   * mirroring UserSubscriptionService's applyScheduledPlanChange.
   */
  async expire(organizationId: string): Promise<IOrganizationSubscription | null> {
    const current = await this.getCurrentSubscription(organizationId);
    if (!current) {
      return null;
    }

    if (current.pendingNextPlanCode) {
      const targetPlan = getCompanyPlan(current.pendingNextPlanCode);
      if (targetPlan && targetPlan.active) {
        const now = new Date();
        current.planCode = targetPlan.code;
        current.status = 'active';
        current.currentPeriodStart = now;
        current.currentPeriodEnd = addThirtyDays(now);
        current.pendingNextPlanCode = undefined;
        current.cancelAtPeriodEnd = false;
        await current.save();
        return current;
      }
    }

    current.status = 'expired';
    current.autoRenew = false;
    current.pendingNextPlanCode = undefined;
    await current.save();
    return current;
  }
}

export const organizationSubscriptionService = new OrganizationSubscriptionService();
export type { OrganizationSubscriptionSource };
