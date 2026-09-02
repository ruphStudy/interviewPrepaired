import { Types } from 'mongoose';
import {
  InterviewCreditLedger,
  IInterviewCreditLedger,
  CreditLedgerType,
  CreditLedgerReferenceType,
} from '../models/InterviewCreditLedger.model';
import { InterviewCreditBalance } from '../models/InterviewCreditBalance.model';
import { SubscriptionPlan } from '../models/SubscriptionPlan.model';
import { IUserSubscription } from '../models/UserSubscription.model';
import { ApiError } from '../utils/ApiError';

interface ApplyMutationParams {
  userId: string;
  type: CreditLedgerType;
  /** Signed — positive to add, negative to consume. */
  amount: number;
  subscriptionId?: string;
  interviewId?: string;
  referenceType?: CreditLedgerReferenceType;
  referenceId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  /** true for CONSUME — rejects the mutation if it would take balance below 0. */
  requireSufficientBalance: boolean;
}

interface LedgerPage {
  transactions: IInterviewCreditLedger[];
  page: number;
  limit: number;
  total: number;
}

function assertPositiveInteger(amount: number, label = 'amount'): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
}

class InterviewCreditService {
  /**
   * Core mutation primitive — every credit-changing method funnels through
   * this. Concurrency-safe via a single-document atomic $inc (with a
   * balance>=required filter for debits) on InterviewCreditBalance, which
   * works even on a non-replica-set MongoDB deployment (unlike multi-doc
   * transactions). The ledger row is appended second and carries the
   * resulting balanceAfter for audit history.
   *
   * Idempotency: if idempotencyKey matches an existing ledger row, that row
   * is returned unchanged — no balance mutation, no duplicate row. If two
   * concurrent calls race past that check with the same key, the balance
   * mutation that loses the ledger insert (duplicate key) is compensated
   * (reversed) and the winning row is returned instead.
   */
  private async applyLedgerMutation(params: ApplyMutationParams): Promise<IInterviewCreditLedger> {
    const { userId, type, amount, idempotencyKey, requireSufficientBalance } = params;

    if (idempotencyKey) {
      const existing = await InterviewCreditLedger.findOne({ idempotencyKey });
      if (existing) {
        return existing;
      }
    }

    let resultingBalance: number;
    if (requireSufficientBalance) {
      const updated = await InterviewCreditBalance.findOneAndUpdate(
        { userId, balance: { $gte: -amount } },
        { $inc: { balance: amount } },
        { new: true }
      );
      if (!updated) {
        throw new ApiError(400, 'Insufficient interview credit balance');
      }
      resultingBalance = updated.balance;
    } else {
      const updated = await InterviewCreditBalance.findOneAndUpdate(
        { userId },
        { $inc: { balance: amount } },
        { new: true, upsert: true }
      );
      resultingBalance = updated.balance;
    }

    try {
      return await InterviewCreditLedger.create({
        userId,
        subscriptionId: params.subscriptionId,
        interviewId: params.interviewId,
        type,
        amount,
        balanceAfter: resultingBalance,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        idempotencyKey,
        description: params.description,
        metadata: params.metadata,
      });
    } catch (error: any) {
      if (idempotencyKey && error?.code === 11000) {
        // Lost the race on the idempotency key — undo our balance mutation
        // and return the row the winning call created.
        await InterviewCreditBalance.updateOne({ userId }, { $inc: { balance: -amount } });
        const existing = await InterviewCreditLedger.findOne({ idempotencyKey });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /** Current balance from the atomic projection — O(1), never a full-ledger scan. */
  async getBalance(userId: string): Promise<number> {
    const doc = await InterviewCreditBalance.findOne({ userId });
    return doc?.balance ?? 0;
  }

  async getLedger(userId: string, options: { page?: number; limit?: number } = {}): Promise<LedgerPage> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const [transactions, total] = await Promise.all([
      InterviewCreditLedger.find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      InterviewCreditLedger.countDocuments({ userId }),
    ]);

    return { transactions, page, limit, total };
  }

  /** Generic credit addition — used by grants, refunds, and admin adjustments. */
  async addCredits(params: {
    userId: string;
    amount: number;
    type: Extract<CreditLedgerType, 'PLAN_GRANT' | 'PACK_GRANT' | 'REFUND' | 'ADMIN_ADJUSTMENT'>;
    subscriptionId?: string;
    interviewId?: string;
    referenceType?: CreditLedgerReferenceType;
    referenceId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IInterviewCreditLedger> {
    assertPositiveInteger(params.amount);

    return this.applyLedgerMutation({
      ...params,
      requireSufficientBalance: false,
    });
  }

  async consumeCredits(params: {
    userId: string;
    amount: number;
    interviewId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IInterviewCreditLedger> {
    assertPositiveInteger(params.amount);

    return this.applyLedgerMutation({
      userId: params.userId,
      type: 'CONSUME',
      amount: -params.amount,
      interviewId: params.interviewId,
      referenceType: params.interviewId ? 'interview' : undefined,
      referenceId: params.interviewId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      metadata: params.metadata,
      requireSufficientBalance: true,
    });
  }

  async refundCredits(params: {
    userId: string;
    amount: number;
    interviewId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IInterviewCreditLedger> {
    assertPositiveInteger(params.amount);

    return this.applyLedgerMutation({
      userId: params.userId,
      type: 'REFUND',
      amount: params.amount,
      interviewId: params.interviewId,
      referenceType: params.interviewId ? 'interview' : undefined,
      referenceId: params.interviewId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      metadata: params.metadata,
      requireSufficientBalance: false,
    });
  }

  /**
   * Grants a subscription's plan credits exactly once per billing period —
   * idempotency key is derived from subscriptionId + currentPeriodStart, so
   * retries (or re-calls from ensureFreeSubscription/changePlan) never
   * double-grant. includedInterviews is always read from SubscriptionPlan,
   * never hardcoded here.
   */
  async grantPlanCredits(userId: string, subscription: IUserSubscription): Promise<IInterviewCreditLedger | null> {
    const plan = await SubscriptionPlan.findById(subscription.planId);
    if (!plan) {
      throw new ApiError(500, 'Subscription plan not found for credit grant');
    }

    if (!plan.includedInterviews || plan.includedInterviews <= 0) {
      return null;
    }

    const subscriptionId = (subscription._id as Types.ObjectId).toString();
    const idempotencyKey = `plan-grant:${subscriptionId}:${subscription.currentPeriodStart.toISOString()}`;

    return this.addCredits({
      userId,
      amount: plan.includedInterviews,
      type: 'PLAN_GRANT',
      subscriptionId,
      referenceType: 'subscription',
      referenceId: subscriptionId,
      idempotencyKey,
      description: `${plan.includedInterviews} interview credit(s) for ${plan.name} plan`,
    });
  }

  /** Thin alias — grants the given subscription's plan credits. Safe to call whenever a subscription is (re)activated. */
  async initializeSubscriptionCredits(userId: string, subscription: IUserSubscription): Promise<void> {
    await this.grantPlanCredits(userId, subscription);
  }
}

export const interviewCreditService = new InterviewCreditService();
