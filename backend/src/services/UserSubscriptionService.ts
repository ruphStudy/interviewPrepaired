import { UserSubscription, IUserSubscription, UserSubscriptionSource } from '../models/UserSubscription.model';
import { SubscriptionPlan, ISubscriptionPlan } from '../models/SubscriptionPlan.model';
import { subscriptionPlanService } from './SubscriptionPlanService';
import { interviewCreditService } from './InterviewCreditService';
import { ApiError } from '../utils/ApiError';

const CURRENT_STATUSES = ['active', 'trial'];

function addOneCalendarMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  return result;
}

class UserSubscriptionService {
  /** The user's current (active/trial) subscription, if any — does not lazily create one. */
  async getCurrentSubscription(userId: string): Promise<IUserSubscription | null> {
    return UserSubscription.findOne({ userId, status: { $in: CURRENT_STATUSES } }).sort({ createdAt: -1 });
  }

  /** Current subscription + its plan, lazily backfilling a FREE subscription for a user who has none yet. */
  async getSubscriptionDetails(userId: string): Promise<{ plan: ISubscriptionPlan; subscription: IUserSubscription }> {
    const subscription = (await this.getCurrentSubscription(userId)) ?? (await this.ensureFreeSubscription(userId));

    const plan = await SubscriptionPlan.findById(subscription.planId);
    if (!plan) {
      throw new ApiError(500, 'Subscription plan not found for current subscription');
    }

    return { plan, subscription };
  }

  /**
   * Idempotently ensures the user has a current subscription, defaulting to
   * the FREE plan. Safe to call repeatedly — never creates a duplicate
   * current subscription.
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
   * Cancels the user's current subscription. With cancelAtPeriodEnd and a
   * paid billing period in progress, the subscription stays active until
   * that period ends; otherwise cancellation is immediate.
   */
  async cancelSubscription(userId: string, cancelAtPeriodEnd = false): Promise<IUserSubscription | null> {
    const current = await this.getCurrentSubscription(userId);
    if (!current) {
      return null;
    }

    if (cancelAtPeriodEnd && current.currentPeriodEnd) {
      current.cancelAtPeriodEnd = true;
    } else {
      current.status = 'cancelled';
      current.cancelledAt = new Date();
      current.cancelAtPeriodEnd = false;
    }

    await current.save();
    return current;
  }
}

export const userSubscriptionService = new UserSubscriptionService();
