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
 * Mirrors InterviewCreditService's concurrency-safe pattern (a
 * single-document atomic $inc balance projection — this codebase never uses
 * Mongo multi-document transactions, so this is "another atomic design
 * consistent with current DB architecture") but is entirely SEPARATE: its
 * own ledger collection, its own balance projection, keyed by
 * `organizationId` — never `userId`. Nothing here is wired into institute
 * assignment start yet (that's 15E, once pricing/plans exist) and B2C
 * personal credits (InterviewCreditService/InterviewCreditLedger/
 * InterviewCreditBalance) are completely untouched.
 *
 * Balance authority: OrganizationInterviewCreditBalance is the ONLY
 * authoritative current-balance projection — every mutation to it is a
 * single-document atomic operation. OrganizationInterviewCreditLedger is
 * immutable audit/history, written as a SEPARATE, non-atomic second write
 * after the balance mutation succeeds. These two writes are NOT atomic
 * together (no Mongo transaction is used) — a crash between them would
 * leave a balance mutation with no corresponding ledger row. The ledger is
 * therefore never treated as the source of truth for "current balance",
 * and its rows can, in principle, be gapless-but-unordered relative to
 * concurrent mutations; only OrganizationInterviewCreditBalance.balance
 * (read via getBalance()) is authoritative.
 */
class OrganizationInterviewCreditService {
  /**
   * Core mutation primitive — every credit-changing method funnels through
   * this. Performs the atomic balance mutation FIRST, then appends the
   * ledger row as a separate, non-atomic write carrying that mutation's
   * resulting balance as `balanceAfter` (a point-in-time audit snapshot,
   * not a claim that the two writes are joined). See the class-level doc
   * for why the ledger is never the balance source of truth.
   *
   * Idempotency: if idempotencyKey matches an existing ledger row, that row
   * is returned unchanged — no balance mutation, no duplicate row. If two
   * concurrent calls race past that check with the same key, the balance
   * mutation that loses the ledger insert (duplicate key) is compensated
   * (reversed) so ONLY that losing mutation's own delta is undone, and the
   * winning row is returned instead — the credit operation is never applied
   * twice.
   */
  private async applyLedgerMutation(params: ApplyMutationParams): Promise<IOrganizationInterviewCreditLedger> {
    const { organizationId, type, amount, idempotencyKey, requireSufficientBalance } = params;

    if (idempotencyKey) {
      const existing = await OrganizationInterviewCreditLedger.findOne({ idempotencyKey });
      if (existing) {
        return existing;
      }
    }

    const resultingBalance = await this.atomicallyMutateBalance(organizationId, amount, requireSufficientBalance);

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
        // Lost the race on the idempotency key — undo ONLY this mutation's
        // own delta and return the row the winning call created, so the
        // operation is never double-applied.
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
   * Single-document atomic balance mutation — the ONLY atomic operation in
   * this service (no cross-document/transaction guarantee exists).
   *
   * Debit path (requireSufficientBalance): a conditional atomic $inc with
   * `balance >= -amount` — two concurrent consumes can never both succeed
   * past a balance that only covers one of them; a missing/insufficient
   * document throws OrganizationInsufficientCreditsError.
   *
   * Credit path: MongoDB's upsert is not race-free when the target document
   * doesn't exist yet — two concurrent first-grants for the same
   * organization can both attempt to insert and one loses with an E11000
   * duplicate-key error against the unique `organizationId` index (this is
   * documented MongoDB upsert behavior, not a bug in this code). That error
   * is caught here and retried as a plain (non-upsert) update now that the
   * document exists, so neither request fails and neither is lost.
   */
  private async atomicallyMutateBalance(
    organizationId: string,
    amount: number,
    requireSufficientBalance: boolean
  ): Promise<number> {
    if (requireSufficientBalance) {
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId, balance: { $gte: -amount } },
        { $inc: { balance: amount } },
        { new: true }
      );
      if (!updated) {
        const current = await OrganizationInterviewCreditBalance.findOne({ organizationId });
        throw new OrganizationInsufficientCreditsError(current?.balance ?? 0);
      }
      return updated.balance;
    }

    try {
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId },
        { $inc: { balance: amount } },
        { new: true, upsert: true }
      );
      return updated.balance;
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      // Lost the upsert race — the winner already created the document, so
      // a plain conditional update now applies our own delta on top of it.
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId },
        { $inc: { balance: amount } },
        { new: true }
      );
      if (updated) {
        return updated.balance;
      }
      // Vanishingly unlikely second race (the doc was removed between the
      // two calls above) — one more upsert attempt is safe at this point.
      const retried = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId },
        { $inc: { balance: amount } },
        { new: true, upsert: true }
      );
      return retried.balance;
    }
  }

  /**
   * Current balance — O(1) from the atomic projection, the sole
   * authoritative source of current balance (see class-level doc). Never a
   * full-ledger scan, never a field on the Organization document itself,
   * and never assumed to equal the latest ledger row's balanceAfter under
   * concurrency (that value is a per-mutation audit snapshot, not a
   * running total guaranteed to be ordered against other concurrent writes).
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
