import { Types } from 'mongoose';
import {
  UserSubscription,
  IUserSubscription,
  UserSubscriptionSource,
  UserSubscriptionStatus,
} from '../models/UserSubscription.model';
import { UserSubscriptionHistory, UserSubscriptionHistoryAction } from '../models/UserSubscriptionHistory.model';
import { SubscriptionPlan, ISubscriptionPlan } from '../models/SubscriptionPlan.model';
import { subscriptionPlanService } from './SubscriptionPlanService';
import { interviewCreditService } from './InterviewCreditService';
import { ApiError } from '../utils/ApiError';

// 'past_due' is treated as a "current" subscription — it is a degraded but
// still-ongoing paid state, not a terminal one.
const CURRENT_STATUSES = ['active', 'trial', 'past_due'];

function addOneCalendarMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}

function isPaidPlan(plan: Pick<ISubscriptionPlan, 'priceInrPaise'> | null | undefined): boolean {
  return !!plan && plan.priceInrPaise > 0;
}

interface AppendHistoryParams {
  userId: string | Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  previousPlanCode?: string;
  nextPlanCode?: string;
  previousStatus?: UserSubscriptionStatus;
  nextStatus?: UserSubscriptionStatus;
  action: UserSubscriptionHistoryAction;
  source: UserSubscriptionSource;
  externalReference?: string;
  metadata?: Record<string, unknown>;
}

class UserSubscriptionService {
  /** The user's current (active/trial/past_due) subscription, if any — does not lazily create one. */
  async getCurrentSubscription(userId: string): Promise<IUserSubscription | null> {
    return UserSubscription.findOne({ userId, status: { $in: CURRENT_STATUSES } }).sort({ createdAt: -1 });
  }

  /**
   * Current subscription + its plan. Refreshes expiry state first (a paid
   * subscription whose currentPeriodEnd has passed transitions to
   * 'expired'), then lazily backfills a FREE subscription ONLY if there is
   * no current subscription at all (never re-grants the lifetime FREE
   * starter credit — see InterviewCreditService.grantPlanCredits).
   */
  async getSubscriptionDetails(userId: string): Promise<{ plan: ISubscriptionPlan; subscription: IUserSubscription }> {
    let subscription = await this.refreshSubscriptionStatus(userId);
    if (!subscription || subscription.status === 'expired') {
      subscription = await this.ensureFreeSubscription(userId);
    }

    const plan = await SubscriptionPlan.findById(subscription.planId);
    if (!plan) {
      throw new ApiError(500, 'Subscription plan not found for current subscription');
    }

    return { plan, subscription };
  }

  /**
   * Transitions a paid subscription whose currentPeriodEnd has passed to
   * 'expired'. Idempotent — a subscription already outside
   * active/trial/past_due is left untouched, so repeated calls never
   * duplicate history. Never touches the FREE plan, never deletes anything.
   */
  async refreshSubscriptionStatus(userId: string): Promise<IUserSubscription | null> {
    const current = await this.getCurrentSubscription(userId);
    if (!current) {
      return null;
    }

    const plan = await SubscriptionPlan.findById(current.planId);

    if (!current.currentPeriodEnd || current.currentPeriodEnd.getTime() > Date.now()) {
      // Lazy self-heal only — never a state transition, never appended to
      // history. Covers subscription documents created before `autoRenew`
      // existed, so a legacy paid subscriber isn't shown a stale "off".
      const expectedAutoRenew = isPaidPlan(plan) && !current.cancelAtPeriodEnd;
      if (current.autoRenew !== expectedAutoRenew) {
        current.autoRenew = expectedAutoRenew;
        await current.save();
      }
      return current;
    }

    if (!isPaidPlan(plan)) {
      return current;
    }

    const previousStatus = current.status;
    current.status = 'expired';
    current.autoRenew = false;
    await current.save();

    await this.appendHistory({
      userId,
      subscriptionId: current._id as Types.ObjectId,
      previousPlanCode: current.planCode,
      nextPlanCode: current.planCode,
      previousStatus,
      nextStatus: 'expired',
      action: 'expired',
      source: 'system',
    });

    return current;
  }

  /**
   * Idempotently ensures the user has a current subscription, defaulting to
   * the FREE plan. Safe to call repeatedly — never creates a duplicate
   * current subscription. The FREE starter credit is granted at most once
   * per user lifetime (see InterviewCreditService.grantPlanCredits), so
   * this is also safe to call again after a paid plan has expired.
   */
  async ensureFreeSubscription(userId: string): Promise<IUserSubscription> {
    const existing = await this.getCurrentSubscription(userId);
    if (existing) {
      return existing;
    }

    const freePlan = await subscriptionPlanService.getDefaultPlan();
    if (!freePlan) {
      throw new ApiError(500, 'Default subscription plan is not configured');
    }

    const now = new Date();

    let created: IUserSubscription;
    try {
      created = await UserSubscription.create({
        userId,
        planId: freePlan._id,
        planCode: freePlan.code,
        status: 'active',
        currentPeriodStart: now,
        startedAt: now,
        cancelAtPeriodEnd: false,
        autoRenew: false,
        source: 'system',
      });
    } catch (error) {
      // Benign race: two concurrent calls both found no existing
      // subscription. Re-check and return the winner instead of creating a
      // second current subscription or surfacing a spurious error.
      const raceWinner = await this.getCurrentSubscription(userId);
      if (raceWinner) {
        return raceWinner;
      }
      throw error;
    }

    await this.appendHistory({
      userId,
      subscriptionId: created._id as Types.ObjectId,
      nextPlanCode: created.planCode,
      nextStatus: created.status,
      action: 'created',
      source: 'system',
    });

    // Credit grant is best-effort here — a failure must not undo the
    // subscription that was just created; it's logged and left recoverable
    // via grantPlanCredits' idempotency key on any later retry.
    try {
      await interviewCreditService.grantPlanCredits(userId, created);
    } catch (error) {
      console.error('[UserSubscriptionService] Failed to grant FREE plan credits:', error);
    }

    return created;
  }

  /**
   * Assigns a new plan to the user, cleanly closing any current
   * subscription first. Internal/service-level only for now — paid plans
   * must not be reachable through a public endpoint until payment
   * verification exists.
   */
  async changePlan(
    userId: string,
    planCode: string,
    source: UserSubscriptionSource = 'system'
  ): Promise<IUserSubscription> {
    const plan = await subscriptionPlanService.getPlanByCode(planCode);
    if (!plan || !plan.isActive) {
      throw new ApiError(400, `Plan "${planCode}" is not available`);
    }

    const current = await this.getCurrentSubscription(userId);
    if (current) {
      current.status = 'cancelled';
      current.cancelledAt = new Date();
      current.cancelAtPeriodEnd = false;
      current.autoRenew = false;
      await current.save();
    }

    const now = new Date();
    const currentPeriodEnd = plan.billingInterval === 'month' ? addOneCalendarMonth(now) : undefined;

    const created = await UserSubscription.create({
      userId,
      planId: plan._id,
      planCode: plan.code,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd,
      startedAt: now,
      cancelAtPeriodEnd: false,
      autoRenew: isPaidPlan(plan),
      source,
    });

    await this.appendHistory({
      userId,
      subscriptionId: created._id as Types.ObjectId,
      previousPlanCode: current?.planCode,
      nextPlanCode: created.planCode,
      previousStatus: current?.status,
      nextStatus: created.status,
      action: current ? 'plan_changed' : 'created',
      source,
    });

    // Grant the new plan's full included interviews — no proration, no
    // wiping the existing balance. Best-effort/logged like ensureFreeSubscription.
    try {
      await interviewCreditService.grantPlanCredits(userId, created);
    } catch (error) {
      console.error('[UserSubscriptionService] Failed to grant plan credits on changePlan:', error);
    }

    return created;
  }

  /**
   * Cancels the user's current subscription. The FREE plan cannot be
   * cancelled. With cancelAtPeriodEnd, a paid billing period in progress
   * stays active (autoRenew turned off) until it ends; otherwise
   * cancellation is immediate. Idempotent — re-cancelling an
   * already-scheduled or already-cancelled subscription is a no-op with no
   * duplicate history.
   */
  async cancelSubscription(
    userId: string,
    cancelAtPeriodEnd = false,
    source: UserSubscriptionSource = 'system'
  ): Promise<IUserSubscription | null> {
    const current = await this.getCurrentSubscription(userId);
    if (!current) {
      return null;
    }

    const plan = await SubscriptionPlan.findById(current.planId);
    if (!isPaidPlan(plan)) {
      throw new ApiError(400, 'The Free plan cannot be cancelled');
    }

    if (cancelAtPeriodEnd) {
      if (current.currentPeriodEnd && !current.cancelAtPeriodEnd) {
        const previousStatus = current.status;
        current.cancelAtPeriodEnd = true;
        current.autoRenew = false;
        await current.save();
        await this.appendHistory({
          userId,
          subscriptionId: current._id as Types.ObjectId,
          previousPlanCode: current.planCode,
          nextPlanCode: current.planCode,
          previousStatus,
          nextStatus: current.status,
          action: 'cancel_scheduled',
          source,
        });
      }
      return current;
    }

    if (current.status !== 'cancelled') {
      const previousStatus = current.status;
      current.status = 'cancelled';
      current.cancelledAt = new Date();
      current.cancelAtPeriodEnd = false;
      current.autoRenew = false;
      await current.save();
      await this.appendHistory({
        userId,
        subscriptionId: current._id as Types.ObjectId,
        previousPlanCode: current.planCode,
        nextPlanCode: current.planCode,
        previousStatus,
        nextStatus: 'cancelled',
        action: 'cancelled',
        source,
      });
    }
    return current;
  }

  /**
   * Resumes renewal on a paid subscription that was scheduled to cancel at
   * period end — only allowed while that period hasn't ended yet. No
   * payment provider call here; this only flips the stored intent.
   * Idempotent — a no-op (no duplicate history) if nothing is scheduled.
   */
  async resumeRenewal(userId: string): Promise<IUserSubscription> {
    const current = await this.getCurrentSubscription(userId);
    if (!current) {
      throw new ApiError(400, 'No active subscription to resume');
    }

    const plan = await SubscriptionPlan.findById(current.planId);
    if (!isPaidPlan(plan)) {
      throw new ApiError(400, 'The Free plan does not support renewal');
    }

    if (!current.currentPeriodEnd || current.currentPeriodEnd.getTime() <= Date.now()) {
      throw new ApiError(400, 'This subscription has already ended and cannot be resumed');
    }

    if (current.cancelAtPeriodEnd) {
      const previousStatus = current.status;
      current.cancelAtPeriodEnd = false;
      current.autoRenew = true;
      await current.save();
      await this.appendHistory({
        userId,
        subscriptionId: current._id as Types.ObjectId,
        previousPlanCode: current.planCode,
        nextPlanCode: current.planCode,
        previousStatus,
        nextStatus: current.status,
        action: 'cancellation_resumed',
        source: 'system',
      });
    }

    return current;
  }

  /**
   * Marks a paid subscription past_due — foundation for future payment
   * webhook handling. No public client endpoint calls this. Credits are
   * never immediately touched. Idempotent.
   */
  async markPastDue(userId: string, externalReference?: string): Promise<IUserSubscription | null> {
    const current = await this.getCurrentSubscription(userId);
    if (!current) {
      return null;
    }

    const plan = await SubscriptionPlan.findById(current.planId);
    if (!isPaidPlan(plan)) {
      return current;
    }

    if (current.status === 'past_due') {
      return current;
    }

    const previousStatus = current.status;
    current.status = 'past_due';
    await current.save();

    await this.appendHistory({
      userId,
      subscriptionId: current._id as Types.ObjectId,
      previousPlanCode: current.planCode,
      nextPlanCode: current.planCode,
      previousStatus,
      nextStatus: 'past_due',
      action: 'past_due',
      source: 'payment',
      externalReference,
    });

    return current;
  }

  /**
   * Server-controlled renewal — foundation for future payment webhook
   * handling. No public client endpoint calls this. Extends the billing
   * period, reactivates the subscription, and grants that new period's plan
   * credits exactly once (via InterviewCreditService's existing
   * subscriptionId+currentPeriodStart idempotency key).
   */
  async renewSubscription(params: {
    userId: string;
    externalReference?: string;
    newPeriodStart?: Date;
    newPeriodEnd?: Date;
  }): Promise<IUserSubscription> {
    const { userId, externalReference, newPeriodStart, newPeriodEnd } = params;

    let current = await this.getCurrentSubscription(userId);
    if (!current) {
      // Allow renewing a subscription that already lapsed into 'expired'
      // (e.g. a payment confirmation arriving after the grace period) —
      // never renews one the user explicitly cancelled.
      current = await UserSubscription.findOne({ userId, status: 'expired' }).sort({ createdAt: -1 });
    }
    if (!current) {
      throw new ApiError(400, 'No subscription to renew');
    }

    const plan = await SubscriptionPlan.findById(current.planId);
    if (!isPaidPlan(plan)) {
      throw new ApiError(400, 'Only a paid subscription can be renewed');
    }

    const periodStart = newPeriodStart ?? current.currentPeriodEnd ?? new Date();
    const periodEnd = newPeriodEnd ?? (plan!.billingInterval === 'month' ? addOneCalendarMonth(periodStart) : undefined);

    const previousStatus = current.status;
    current.status = 'active';
    current.currentPeriodStart = periodStart;
    current.currentPeriodEnd = periodEnd;
    current.autoRenew = !current.cancelAtPeriodEnd;
    await current.save();

    // Grant this billing period's plan credits exactly once — idempotency
    // key is derived from subscriptionId + the new currentPeriodStart.
    try {
      await interviewCreditService.grantPlanCredits(userId, current);
    } catch (error) {
      console.error('[UserSubscriptionService] Failed to grant plan credits on renewSubscription:', error);
    }

    await this.appendHistory({
      userId,
      subscriptionId: current._id as Types.ObjectId,
      previousPlanCode: current.planCode,
      nextPlanCode: current.planCode,
      previousStatus,
      nextStatus: 'active',
      action: 'renewed',
      source: 'payment',
      externalReference,
    });

    return current;
  }

  /** Best-effort audit write — never allowed to fail the state transition it's recording. */
  private async appendHistory(params: AppendHistoryParams): Promise<void> {
    try {
      await UserSubscriptionHistory.create({
        userId: params.userId,
        subscriptionId: params.subscriptionId,
        previousPlanCode: params.previousPlanCode,
        nextPlanCode: params.nextPlanCode,
        previousStatus: params.previousStatus,
        nextStatus: params.nextStatus,
        action: params.action,
        source: params.source,
        externalReference: params.externalReference,
        changedAt: new Date(),
        metadata: params.metadata,
      });
    } catch (error) {
      console.error('[UserSubscriptionService] Failed to append subscription history:', error);
    }
  }
}

export const userSubscriptionService = new UserSubscriptionService();
