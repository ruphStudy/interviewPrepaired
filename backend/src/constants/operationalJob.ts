/**
 * Generic persistent job system (PR-OPS-1/2). Mirrors the exact
 * claim/backoff/attempt-tracking pattern already proven by
 * EmailRetryService/EmailDelivery (PR-COMM-6) — deliberately NOT a second
 * competing queue technology (no Redis/BullMQ). Only job types with a
 * genuine current caller are defined below.
 */
export enum OperationalJobType {
  /** Wraps BillingAdminService.reconcileOrder (already idempotent/read-only) — for future scheduled reconciliation when a webhook never arrives. */
  PAYMENT_RECONCILIATION = 'PAYMENT_RECONCILIATION',
  /** Wraps FileStorageService.deleteFile — retries an orphaned-object delete that failed on the first (best-effort) attempt. */
  STORAGE_DELETE_RETRY = 'STORAGE_DELETE_RETRY',
  /** Sweeps a single user's subscription for currentPeriodEnd expiry via UserSubscriptionService.refreshSubscriptionStatus. */
  SUBSCRIPTION_EXPIRY = 'SUBSCRIPTION_EXPIRY',
  /** Sweeps a single organization's subscription for currentPeriodEnd expiry via OrganizationSubscriptionService.expire. */
  ORGANIZATION_SUBSCRIPTION_EXPIRY = 'ORGANIZATION_SUBSCRIPTION_EXPIRY',
}

export type OperationalJobStatus = 'pending' | 'active' | 'completed' | 'dead_letter' | 'cancelled';

export const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Backoff schedule — ms to wait AFTER attempt N fails before attempt N+1 is
 * eligible. Index 0 is unused (a job's first attempt is always immediate,
 * scheduled at enqueue time via `nextAttemptAt`); index 1 is the delay
 * after the 1st failure, etc. Bounded at 5 entries to match
 * DEFAULT_MAX_ATTEMPTS.
 */
export const DEFAULT_BACKOFF_SCHEDULE_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

/**
 * Payment reconciliation is read-only against the provider and cheap to
 * retry sooner — a tighter schedule reads as more correct than storage/
 * subscription sweeps, which can comfortably wait longer between attempts.
 */
export const PAYMENT_RECONCILIATION_BACKOFF_SCHEDULE_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];

export function getBackoffScheduleMs(jobType: OperationalJobType): number[] {
  return jobType === OperationalJobType.PAYMENT_RECONCILIATION
    ? PAYMENT_RECONCILIATION_BACKOFF_SCHEDULE_MS
    : DEFAULT_BACKOFF_SCHEDULE_MS;
}

/** Bounded batch size per `runOnce()` poll tick — mirrors EmailRetryService's BATCH_SIZE. */
export const OPERATIONAL_JOB_BATCH_SIZE = 20;

/** Shared in-process poller tick interval — used by both the email retry poller and the OperationalJobService poller (server.ts/worker.ts), and by the readiness computation's "is the poller still ticking" check. */
export const JOB_POLL_INTERVAL_MS = 30 * 1000;
