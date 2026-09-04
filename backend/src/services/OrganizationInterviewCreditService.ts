import {
  OrganizationInterviewCreditLedger,
  IOrganizationInterviewCreditLedger,
  OrganizationCreditLedgerType,
  OrganizationCreditLedgerReferenceType,
} from '../models/OrganizationInterviewCreditLedger.model';
import { OrganizationInterviewCreditBalance } from '../models/OrganizationInterviewCreditBalance.model';
import { ApiError, OrganizationInsufficientCreditsError } from '../utils/ApiError';

interface ApplyMutationParams {
  organizationId: string;
  type: OrganizationCreditLedgerType;
  /** Signed — positive to add, negative to consume. */
  amount: number;
  interviewId?: string;
  referenceType?: OrganizationCreditLedgerReferenceType;
  referenceId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  /** true for CONSUME/negative ADMIN_ADJUSTMENT — rejects the mutation if it would take balance below 0. */
  requireSufficientBalance: boolean;
}

interface LedgerPage {
  transactions: IOrganizationInterviewCreditLedger[];
  page: number;
  limit: number;
  total: number;
}

function assertPositiveInteger(amount: number, label = 'amount'): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
}

/**
 * Institute-organization interview-credit ledger/service foundation (15D).
 * Mirrors InterviewCreditService's proven concurrency-safe pattern exactly
 * (a single-document atomic $inc balance projection + an append-only
 * ledger — this codebase never uses Mongo multi-document transactions, so
 * this is "another atomic design consistent with current DB architecture")
 * but is entirely SEPARATE: its own ledger collection, its own balance
 * projection, keyed by `organizationId` — never `userId`. Nothing here is
 * wired into institute assignment start yet (that's 15E, once pricing/plans
 * exist) and B2C personal credits (InterviewCreditService/
 * InterviewCreditLedger/InterviewCreditBalance) are completely untouched.
 */
class OrganizationInterviewCreditService {
  /**
   * Core mutation primitive — every credit-changing method funnels through
   * this, exactly mirroring InterviewCreditService.applyLedgerMutation.
   *
   * Idempotency: if idempotencyKey matches an existing ledger row, that row
   * is returned unchanged — no balance mutation, no duplicate row. If two
   * concurrent calls race past that check with the same key, the balance
   * mutation that loses the ledger insert (duplicate key) is compensated
   * (reversed) and the winning row is returned instead.
   */
  private async applyLedgerMutation(params: ApplyMutationParams): Promise<IOrganizationInterviewCreditLedger> {
    const { organizationId, type, amount, idempotencyKey, requireSufficientBalance } = params;

    if (idempotencyKey) {
      const existing = await OrganizationInterviewCreditLedger.findOne({ idempotencyKey });
      if (existing) {
        return existing;
      }
    }

    let resultingBalance: number;
    if (requireSufficientBalance) {
      // Atomic single-document conditional $inc — two concurrent consumes
      // can never both succeed past a balance that only covers one of them.
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId, balance: { $gte: -amount } },
        { $inc: { balance: amount } },
        { new: true }
      );
      if (!updated) {
        const current = await OrganizationInterviewCreditBalance.findOne({ organizationId });
        throw new OrganizationInsufficientCreditsError(current?.balance ?? 0);
      }
      resultingBalance = updated.balance;
    } else {
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId },
        { $inc: { balance: amount } },
        { new: true, upsert: true }
      );
      resultingBalance = updated.balance;
    }

    try {
      return await OrganizationInterviewCreditLedger.create({
        organizationId,
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
        await OrganizationInterviewCreditBalance.updateOne({ organizationId }, { $inc: { balance: -amount } });
        const existing = await OrganizationInterviewCreditLedger.findOne({ idempotencyKey });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  /**
   * Current balance — O(1) from the atomic projection, which always mirrors
   * the latest ledger row's balanceAfter (both are updated atomically
   * together in applyLedgerMutation). Never a full-ledger scan, never a
   * field on the Organization document itself.
   */
  async getBalance(organizationId: string): Promise<number> {
    const doc = await OrganizationInterviewCreditBalance.findOne({ organizationId });
    return doc?.balance ?? 0;
  }

  async getLedger(organizationId: string, options: { page?: number; limit?: number } = {}): Promise<LedgerPage> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const [transactions, total] = await Promise.all([
      OrganizationInterviewCreditLedger.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OrganizationInterviewCreditLedger.countDocuments({ organizationId }),
    ]);

    return { transactions, page, limit, total };
  }

  /** Generic credit addition — used by future plan grants/packs (15E) and manual top-ups. */
  async grantCredits(params: {
    organizationId: string;
    amount: number;
    referenceType?: OrganizationCreditLedgerReferenceType;
    referenceId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IOrganizationInterviewCreditLedger> {
    assertPositiveInteger(params.amount);

    return this.applyLedgerMutation({
      ...params,
      type: 'GRANT',
      requireSufficientBalance: false,
    });
  }

  /**
   * Consumes exactly 1 credit. Not yet called from the institute assignment
   * start flow — that connection is explicitly deferred to 15E, once
   * pricing/plans define the actual policy.
   */
  async consumeCredit(params: {
    organizationId: string;
    interviewId?: string;
    referenceId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IOrganizationInterviewCreditLedger> {
    return this.applyLedgerMutation({
      organizationId: params.organizationId,
      type: 'CONSUME',
      amount: -1,
      interviewId: params.interviewId,
      referenceType: params.interviewId ? 'interview' : undefined,
      referenceId: params.referenceId ?? params.interviewId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      metadata: params.metadata,
      requireSufficientBalance: true,
    });
  }

  /** Refunds exactly 1 credit — the counterpart to consumeCredit. */
  async refundCredit(params: {
    organizationId: string;
    interviewId?: string;
    referenceId?: string;
    idempotencyKey?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IOrganizationInterviewCreditLedger> {
    return this.applyLedgerMutation({
      organizationId: params.organizationId,
      type: 'REFUND',
      amount: 1,
      interviewId: params.interviewId,
      referenceType: params.interviewId ? 'interview' : undefined,
      referenceId: params.referenceId ?? params.interviewId,
      idempotencyKey: params.idempotencyKey,
      description: params.description,
      metadata: params.metadata,
      requireSufficientBalance: false,
    });
  }

  /**
   * Admin-only manual credit adjustment — signed amount, positive to add or
   * negative to remove. Goes through the same atomic applyLedgerMutation
   * primitive as every other mutation, so a negative adjustment can never
   * take balance below 0.
   */
  async adjustCredits(params: {
    organizationId: string;
    amount: number;
    reason: string;
    adminUserId?: string;
    idempotencyKey?: string;
  }): Promise<IOrganizationInterviewCreditLedger> {
    if (!Number.isInteger(params.amount) || params.amount === 0) {
      throw new ApiError(400, 'amount must be a non-zero integer');
    }

    return this.applyLedgerMutation({
      organizationId: params.organizationId,
      type: 'ADMIN_ADJUSTMENT',
      amount: params.amount,
      referenceType: 'admin',
      referenceId: params.adminUserId,
      idempotencyKey: params.idempotencyKey,
      description: params.reason,
      metadata: params.adminUserId ? { adminUserId: params.adminUserId } : undefined,
      requireSufficientBalance: params.amount < 0,
    });
  }
}

export const organizationInterviewCreditService = new OrganizationInterviewCreditService();
