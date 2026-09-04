import {
  OrganizationInterviewCreditLedger,
  IOrganizationInterviewCreditLedger,
  OrganizationCreditLedgerType,
  OrganizationCreditLedgerReferenceType,
} from '../models/OrganizationInterviewCreditLedger.model';
import { OrganizationInterviewCreditBalance } from '../models/OrganizationInterviewCreditBalance.model';
import { OrganizationInterviewCreditOperation } from '../models/OrganizationInterviewCreditOperation.model';
import { ApiError, OrganizationInsufficientCreditsError } from '../utils/ApiError';

const CLAIM_POLL_MAX_ATTEMPTS = 10;
const CLAIM_POLL_DELAY_MS = 50;
const COMPENSATE_MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 *
 * Idempotency: a same-key retry must never mutate balance twice, and
 * compensating a balance mutation AFTER the fact is not sufficient on its
 * own (an unrelated concurrent consume could spend a temporary duplicate
 * credit before compensation runs). So the idempotencyKey is CLAIMED in
 * OrganizationInterviewCreditOperation — a separate collection, unique on
 * {organizationId, idempotencyKey} — BEFORE any balance mutation is
 * attempted. Only the claim's owner may mutate balance; every other
 * concurrent caller for that exact key recovers the completed result
 * instead. See claimIdempotencyKey().
 */
class OrganizationInterviewCreditService {
  /**
   * Core mutation primitive — every credit-changing method funnels through
   * this. Without an idempotencyKey there is nothing to serialize, so the
   * mutation runs directly (compensating, unclamped-risk-free, if the
   * ledger append then fails). WITH an idempotencyKey, the key is claimed
   * BEFORE any balance mutation via `claimIdempotencyKey` — only the
   * caller that wins the claim may mutate balance; every other concurrent
   * caller for that exact {organizationId, idempotencyKey} recovers the
   * completed result and never touches balance itself. See the class-level
   * doc for why the ledger is never the balance source of truth.
   */
  private async applyLedgerMutation(params: ApplyMutationParams): Promise<IOrganizationInterviewCreditLedger> {
    const { organizationId, idempotencyKey } = params;

    if (!idempotencyKey) {
      return this.mutateAndAppendLedger(params);
    }

    const claim = await this.claimIdempotencyKey(organizationId, idempotencyKey);
    if (claim !== 'claimed') {
      // A concurrent/prior call already completed this exact key — recover
      // its result. Balance was never touched by this call.
      return claim;
    }

    // We now exclusively own this {organizationId, idempotencyKey} claim —
    // no other caller for this exact key can mutate balance concurrently.
    try {
      const transaction = await this.mutateAndAppendLedger(params);
      await OrganizationInterviewCreditOperation.updateOne(
        { organizationId, idempotencyKey, status: 'PENDING' },
        { $set: { status: 'COMPLETED', ledgerTransactionId: transaction._id } }
      );
      return transaction;
    } catch (error) {
      // Whether the failure happened before or after the balance mutation,
      // mutateAndAppendLedger has already compensated any balance change it
      // made (see below) — this claim just needs to be released so a
      // legitimate retry with the same key can revive it.
      await OrganizationInterviewCreditOperation.updateOne(
        { organizationId, idempotencyKey, status: 'PENDING' },
        { $set: { status: 'FAILED' } }
      );
      throw error;
    }
  }

  /**
   * Mutates balance then appends the ledger row. If the balance mutation
   * itself fails (e.g. insufficient credit), nothing was changed, so there
   * is nothing to compensate. If the mutation SUCCEEDS but the ledger
   * append then fails for any reason, this compensates (reverses) exactly
   * this mutation's own delta before rethrowing — never someone else's.
   */
  private async mutateAndAppendLedger(params: ApplyMutationParams): Promise<IOrganizationInterviewCreditLedger> {
    const { organizationId, type, amount, idempotencyKey, requireSufficientBalance } = params;

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
    } catch (error) {
      await this.compensateBalance(organizationId, amount);
      throw error;
    }
  }

  /**
   * Atomically claims an {organizationId, idempotencyKey} pair BEFORE any
   * balance mutation is attempted — this is what actually prevents two
   * concurrent same-key callers from both mutating balance (compensating
   * afterward is not sufficient: an unrelated concurrent consume could
   * spend a temporary duplicate credit before compensation runs).
   *
   * Returns 'claimed' when THIS call now exclusively owns a PENDING claim
   * and must proceed to mutate balance. Returns the existing ledger
   * transaction when the key was already completed — the caller must NOT
   * mutate balance in that case, only recover the transaction that resulted.
   *
   * A FAILED claim (a prior owner's mutation/ledger-append failed) is
   * revivable via an atomic compare-and-swap — only one racer wins that
   * transition back to PENDING, so ownership of a given key is always
   * held by at most one caller at a time.
   */
  private async claimIdempotencyKey(
    organizationId: string,
    idempotencyKey: string
  ): Promise<IOrganizationInterviewCreditLedger | 'claimed'> {
    for (let attempt = 0; attempt < CLAIM_POLL_MAX_ATTEMPTS; attempt++) {
      try {
        await OrganizationInterviewCreditOperation.create({ organizationId, idempotencyKey, status: 'PENDING' });
        return 'claimed';
      } catch (error: any) {
        if (error?.code !== 11000) {
          throw error;
        }
      }

      // Someone else already holds/held this exact key — never mutate
      // balance ourselves; recover or wait instead.
      const existing = await OrganizationInterviewCreditOperation.findOne({ organizationId, idempotencyKey });

      if (!existing) {
        // Claim vanished between the failed insert and this read (should
        // not normally happen) — loop around and try to claim fresh.
        continue;
      }

      if (existing.status === 'COMPLETED') {
        const transaction = existing.ledgerTransactionId
          ? await OrganizationInterviewCreditLedger.findOne({ _id: existing.ledgerTransactionId, organizationId })
          : null;
        if (transaction) {
          return transaction;
        }
        // Completed but its referenced ledger row is missing/cross-org —
        // a data inconsistency a duplicate caller must never paper over by
        // mutating balance itself.
        throw new ApiError(500, 'Credit operation record is inconsistent');
      }

      if (existing.status === 'FAILED') {
        const revived = await OrganizationInterviewCreditOperation.findOneAndUpdate(
          { organizationId, idempotencyKey, status: 'FAILED' },
          { $set: { status: 'PENDING' } },
          { new: true }
        );
        if (revived) {
          return 'claimed';
        }
        // Another racer revived it first — loop and re-read their outcome.
      }

      await sleep(CLAIM_POLL_DELAY_MS);
    }

    throw new ApiError(409, 'This credit operation is already in progress — please retry shortly');
  }

  /**
   * Best-effort reversal of exactly one mutation's own delta, floored at 0
   * so it can never drive balance negative even if an unrelated concurrent
   * operation already spent part of it — a compare-and-swap loop rather
   * than a blind `$inc`, since the target isn't known until read.
   */
  private async compensateBalance(organizationId: string, amount: number): Promise<void> {
    for (let attempt = 0; attempt < COMPENSATE_MAX_ATTEMPTS; attempt++) {
      const current = await OrganizationInterviewCreditBalance.findOne({ organizationId });
      if (!current) {
        return;
      }
      const target = Math.max(0, current.balance - amount);
      const updated = await OrganizationInterviewCreditBalance.findOneAndUpdate(
        { organizationId, balance: current.balance },
        { $set: { balance: target } },
        { new: true }
      );
      if (updated) {
        return;
      }
      // Lost the compare-and-swap race — retry with a fresh read.
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
