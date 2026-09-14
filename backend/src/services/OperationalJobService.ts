import { OperationalJob, IOperationalJob } from '../models/OperationalJob.model';
import {
  OperationalJobType,
  OperationalJobStatus,
  DEFAULT_MAX_ATTEMPTS,
  OPERATIONAL_JOB_BATCH_SIZE,
  getBackoffScheduleMs,
} from '../constants/operationalJob';
import { TransientOperationalError } from '../utils/operationalError';
import { ApiError } from '../utils/ApiError';
import { OpsErrorCode } from '../constants/ops';
import { logError, logWarn } from '../middleware/logger';

export interface EnqueueJobParams {
  jobType: OperationalJobType;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
  /** Defaults to "now" (immediately claimable). */
  runAt?: Date;
}

export interface AdminSafeJob {
  id: string;
  jobType: OperationalJobType;
  status: OperationalJobStatus;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  firstFailedAt?: Date;
  lastFailedAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  adminReviewStatus?: string;
  manualRetryCount: number;
  lastRetriedByAdminUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A caught error's statusCode (ApiError) in this range is a client/business/permanent condition — never worth retrying. */
function isPermanentStatusCode(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

/**
 * Classifies a caught handler error for the job runner: an explicit
 * TransientOperationalError (or an ApiError outside the 4xx range, or any
 * non-ApiError error — e.g. a network/driver exception) is treated as
 * transient/retryable; a 4xx ApiError is treated as permanent (fails fast).
 */
function isTransient(error: unknown): boolean {
  if (error instanceof TransientOperationalError) return true;
  if (error instanceof ApiError) return !isPermanentStatusCode(error.statusCode);
  return true;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Generic persistent job system (PR-OPS-1/2). Mirrors EmailRetryService's
 * exact claim/backoff style — no new queue infrastructure. Handlers call
 * into ALREADY-IDEMPOTENT business services; this layer never re-implements
 * business idempotency, it only tracks attempt/retry/dead-letter state.
 */
class OperationalJobService {
  private running = false;

  /** Creates a `pending` row. On a duplicate idempotencyKey race, returns the existing row instead of erroring. */
  async enqueue(params: EnqueueJobParams): Promise<IOperationalJob> {
    try {
      return await OperationalJob.create({
        jobType: params.jobType,
        payload: params.payload,
        idempotencyKey: params.idempotencyKey,
        maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        nextAttemptAt: params.runAt ?? new Date(),
        status: 'pending',
      });
    } catch (error: any) {
      if (error?.code === 11000 && params.idempotencyKey) {
        const existing = await OperationalJob.findOne({ idempotencyKey: params.idempotencyKey });
        if (existing) return existing;
      }
      throw error;
    }
  }

  /** Call on an interval (see server.ts/worker.ts) — safe to call again while a previous run is still in flight (it just no-ops). */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < OPERATIONAL_JOB_BATCH_SIZE; i++) {
        const claimed = await this.claimNext();
        if (!claimed) break;
        await this.process(claimed);
      }
    } finally {
      this.running = false;
    }
  }

  private async claimNext(jobType?: OperationalJobType): Promise<IOperationalJob | null> {
    const now = new Date();
    return OperationalJob.findOneAndUpdate(
      {
        status: 'pending',
        nextAttemptAt: { $lte: now },
        ...(jobType ? { jobType } : {}),
      },
      { $set: { status: 'active' } },
      { new: true, sort: { nextAttemptAt: 1 } }
    );
  }

  private async process(job: IOperationalJob): Promise<void> {
    try {
      await this.dispatch(job.jobType, job.payload);
      job.status = 'completed';
      await job.save();
    } catch (error: any) {
      await this.recordFailure(job, error);
    }
  }

  private async dispatch(jobType: OperationalJobType, payload: Record<string, unknown>): Promise<void> {
    switch (jobType) {
      case OperationalJobType.PAYMENT_RECONCILIATION:
        return this.handlePaymentReconciliation(payload);
      case OperationalJobType.STORAGE_DELETE_RETRY:
        return this.handleStorageDeleteRetry(payload);
      case OperationalJobType.SUBSCRIPTION_EXPIRY:
        return this.handleSubscriptionExpiry(payload);
      case OperationalJobType.ORGANIZATION_SUBSCRIPTION_EXPIRY:
        return this.handleOrganizationSubscriptionExpiry(payload);
      case OperationalJobType.PRIVACY_EXPORT_GENERATION:
        return this.handlePrivacyExportGeneration(payload);
      case OperationalJobType.ACCOUNT_DELETION:
        return this.handleAccountDeletion(payload);
      default:
        // Unknown job type — permanent, never retried.
        throw new ApiError(400, `Unknown operational job type: ${jobType}`);
    }
  }

  private async handlePaymentReconciliation(payload: Record<string, unknown>): Promise<void> {
    const orderId = String(payload.orderId ?? '');
    if (!orderId) throw new ApiError(400, 'PAYMENT_RECONCILIATION job payload missing orderId');
    try {
      // Lazy import to avoid a hard circular dependency at module-load time.
      const { billingAdminService } = await import('./BillingAdminService');
      await billingAdminService.reconcileOrder(orderId);
    } catch (error) {
      if (error instanceof ApiError && !isPermanentStatusCode(error.statusCode)) {
        throw new TransientOperationalError(error.message);
      }
      throw error;
    }
  }

  private async handleStorageDeleteRetry(payload: Record<string, unknown>): Promise<void> {
    const objectKey = String(payload.objectKey ?? '');
    if (!objectKey) throw new ApiError(400, 'STORAGE_DELETE_RETRY job payload missing objectKey');
    try {
      const { fileStorageService } = await import('./FileStorageService');
      await fileStorageService.deleteFile(objectKey);
    } catch (error) {
      // FileStorageService.deleteFile wraps every provider error as a
      // generic 502 FILE_DELETE_FAILED — treated as transient/retryable
      // (a temporarily-unreachable object store is the common case); once
      // maxAttempts is exhausted it still lands in dead_letter for an
      // admin to investigate, rather than retrying forever.
      throw new TransientOperationalError(error instanceof Error ? error.message : 'Storage delete failed');
    }
  }

  private async handleSubscriptionExpiry(payload: Record<string, unknown>): Promise<void> {
    const userId = String(payload.userId ?? '');
    if (!userId) throw new ApiError(400, 'SUBSCRIPTION_EXPIRY job payload missing userId');
    try {
      const { userSubscriptionService } = await import('./UserSubscriptionService');
      await userSubscriptionService.refreshSubscriptionStatus(userId);
    } catch (error) {
      if (error instanceof ApiError && isPermanentStatusCode(error.statusCode)) {
        throw error;
      }
      throw new TransientOperationalError(error instanceof Error ? error.message : 'Subscription expiry refresh failed');
    }
  }

  private async handleOrganizationSubscriptionExpiry(payload: Record<string, unknown>): Promise<void> {
    const organizationId = String(payload.organizationId ?? '');
    if (!organizationId) throw new ApiError(400, 'ORGANIZATION_SUBSCRIPTION_EXPIRY job payload missing organizationId');
    try {
      const { organizationSubscriptionService } = await import('./OrganizationSubscriptionService');
      await organizationSubscriptionService.expire(organizationId);
    } catch (error) {
      if (error instanceof ApiError && isPermanentStatusCode(error.statusCode)) {
        throw error;
      }
      throw new TransientOperationalError(error instanceof Error ? error.message : 'Organization subscription expiry failed');
    }
  }

  private async handlePrivacyExportGeneration(payload: Record<string, unknown>): Promise<void> {
    const exportRequestId = String(payload.exportRequestId ?? '');
    if (!exportRequestId) throw new ApiError(400, 'PRIVACY_EXPORT_GENERATION job payload missing exportRequestId');
    const { privacyExportService } = await import('./PrivacyExportService');
    // privacyExportService.generateExport already throws TransientOperationalError
    // for a plausibly-transient (storage upload) failure and a plain
    // ApiError/Error for anything permanent — no reclassification needed here.
    await privacyExportService.generateExport(exportRequestId);
  }

  private async handleAccountDeletion(payload: Record<string, unknown>): Promise<void> {
    const userId = String(payload.userId ?? '');
    if (!userId) throw new ApiError(400, 'ACCOUNT_DELETION job payload missing userId');
    const originalEmail = typeof payload.originalEmail === 'string' ? payload.originalEmail : undefined;
    const { accountDeletionService } = await import('./AccountDeletionService');
    // accountDeletionService.processAccountDeletion already throws
    // TransientOperationalError for plausibly-transient steps — no
    // reclassification needed here.
    await accountDeletionService.processAccountDeletion(userId, originalEmail);
  }

  private async recordFailure(job: IOperationalJob, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof ApiError && error.code ? error.code : error instanceof Error ? error.name : 'UNKNOWN_ERROR';
    const now = new Date();

    job.lastFailedAt = now;
    if (!job.firstFailedAt) job.firstFailedAt = now;
    job.failureCode = truncate(code, 100);
    job.failureMessage = truncate(message, 500);

    const transient = isTransient(error);
    const hasAttemptsLeft = job.attemptCount + 1 < job.maxAttempts;

    if (transient && hasAttemptsLeft) {
      job.attemptCount += 1;
      job.status = 'pending';
      const schedule = getBackoffScheduleMs(job.jobType);
      const delayMs = schedule[Math.min(job.attemptCount, schedule.length - 1)];
      job.nextAttemptAt = new Date(now.getTime() + delayMs);
      await job.save();
      logWarn('[OperationalJobService] Job attempt failed — scheduled for retry', {
        jobId: job._id.toString(),
        jobType: job.jobType,
        attemptCount: job.attemptCount,
        nextAttemptAt: job.nextAttemptAt,
      });
      return;
    }

    // Permanent failure, or attempts exhausted — dead_letter, never retried
    // automatically again (an admin may still trigger manualRetry).
    if (!transient) {
      job.attemptCount += 1;
    }
    job.status = 'dead_letter';
    await job.save();
    logError('[OperationalJobService] Job moved to dead_letter', {
      jobId: job._id.toString(),
      jobType: job.jobType,
      failureCode: job.failureCode,
    });
    try {
      const { captureException } = await import('../config/monitoring');
      captureException(error instanceof Error ? error : new Error(message), {
        jobId: job._id.toString(),
        jobType: job.jobType,
        errorCode: job.failureCode,
      });
    } catch {
      // Monitoring is optional/best-effort — never let a Sentry hiccup affect job processing.
    }
  }

  /** Only allowed from `dead_letter`. Resets to `pending`/`nextAttemptAt=now`, attemptCount unchanged (still respects maxAttempts going forward). */
  async manualRetry(jobId: string, adminUserId: string): Promise<IOperationalJob> {
    const job = await OperationalJob.findById(jobId);
    if (!job) {
      throw new ApiError(404, 'Operational job not found', undefined, OpsErrorCode.JOB_NOT_FOUND);
    }
    if (job.status !== 'dead_letter') {
      throw new ApiError(
        400,
        'Only a dead_letter job may be manually retried',
        undefined,
        OpsErrorCode.JOB_RETRY_NOT_ALLOWED
      );
    }

    job.status = 'pending';
    job.nextAttemptAt = new Date();
    job.manualRetryCount += 1;
    job.adminReviewStatus = 'retried';
    job.lastRetriedByAdminUserId = adminUserId;
    await job.save();
    return job;
  }

  async listJobs(options: {
    status?: OperationalJobStatus;
    jobType?: OperationalJobType;
    page?: number;
    limit?: number;
  }): Promise<{ jobs: AdminSafeJob[]; page: number; limit: number; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const filter: Record<string, unknown> = {};
    if (options.status) filter.status = options.status;
    if (options.jobType) filter.jobType = options.jobType;

    const [jobs, total] = await Promise.all([
      OperationalJob.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      OperationalJob.countDocuments(filter),
    ]);

    return { jobs: jobs.map((j) => this.toAdminSafeJob(j)), page, limit, total };
  }

  async getJob(jobId: string): Promise<AdminSafeJob> {
    const job = await OperationalJob.findById(jobId);
    if (!job) {
      throw new ApiError(404, 'Operational job not found', undefined, OpsErrorCode.JOB_NOT_FOUND);
    }
    return this.toAdminSafeJob(job);
  }

  private toAdminSafeJob(job: IOperationalJob): AdminSafeJob {
    return {
      id: job._id.toString(),
      jobType: job.jobType,
      status: job.status,
      payload: job.payload,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
      firstFailedAt: job.firstFailedAt,
      lastFailedAt: job.lastFailedAt,
      failureCode: job.failureCode,
      failureMessage: job.failureMessage,
      adminReviewStatus: job.adminReviewStatus,
      manualRetryCount: job.manualRetryCount,
      lastRetriedByAdminUserId: job.lastRetriedByAdminUserId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  /**
   * Periodic sweep (PR-OPS-2) — neither UserSubscriptionService nor
   * OrganizationSubscriptionService had any proactive expiry sweep before
   * this task (both only self-heal lazily, on next read, via
   * refreshSubscriptionStatus/expire). Rather than modeling "scan N rows"
   * as a single OperationalJob (which doesn't fit the one-row-one-execution
   * retry/dead-letter model), this scan enqueues one small, bounded,
   * idempotent SUBSCRIPTION_EXPIRY/ORGANIZATION_SUBSCRIPTION_EXPIRY job per
   * currently-expired subscription — each then goes through the exact same
   * generic claim/retry/dead-letter machinery as every other job type.
   * idempotencyKey is scoped to the specific expiring period so a renewed
   * subscription's NEXT period can still be swept later without collision.
   */
  async scanForExpiredSubscriptions(batchSize = 50): Promise<void> {
    const now = new Date();
    try {
      const { UserSubscription } = await import('../models/UserSubscription.model');
      const expiredUsers = await UserSubscription.find({
        status: { $in: ['active', 'trial', 'past_due'] },
        currentPeriodEnd: { $lt: now },
      })
        .select('userId currentPeriodEnd')
        .limit(batchSize)
        .lean();

      for (const sub of expiredUsers) {
        const periodEndMs = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : 0;
        await this.enqueue({
          jobType: OperationalJobType.SUBSCRIPTION_EXPIRY,
          payload: { userId: sub.userId.toString() },
          idempotencyKey: `subscription-expiry:${sub.userId.toString()}:${periodEndMs}`,
        }).catch((error) => {
          logError('[OperationalJobService] Failed to enqueue SUBSCRIPTION_EXPIRY job', { error: error?.message });
        });
      }
    } catch (error) {
      logError('[OperationalJobService] scanForExpiredSubscriptions (user) failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const { OrganizationSubscription } = await import('../models/OrganizationSubscription.model');
      const expiredOrgs = await OrganizationSubscription.find({
        status: { $in: ['active', 'trial', 'past_due'] },
        currentPeriodEnd: { $lt: now },
      })
        .select('organizationId currentPeriodEnd')
        .limit(batchSize)
        .lean();

      for (const sub of expiredOrgs) {
        const periodEndMs = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getTime() : 0;
        await this.enqueue({
          jobType: OperationalJobType.ORGANIZATION_SUBSCRIPTION_EXPIRY,
          payload: { organizationId: sub.organizationId.toString() },
          idempotencyKey: `organization-subscription-expiry:${sub.organizationId.toString()}:${periodEndMs}`,
        }).catch((error) => {
          logError('[OperationalJobService] Failed to enqueue ORGANIZATION_SUBSCRIPTION_EXPIRY job', {
            error: error?.message,
          });
        });
      }
    } catch (error) {
      logError('[OperationalJobService] scanForExpiredSubscriptions (organization) failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Periodic sweep (PR-PRIVACY-2) — folded into the same lightweight
   * per-tick pattern as scanForExpiredSubscriptions rather than a
   * standalone OperationalJobType, since this is a bounded direct-delete
   * sweep (not a one-row-one-execution retryable unit). Only ever touches
   * PrivacyExportRequest rows via PrivacyExportService.cleanupExpiredExports.
   */
  async cleanupExpiredPrivacyExports(batchSize = 50): Promise<void> {
    try {
      const { privacyExportService } = await import('./PrivacyExportService');
      await privacyExportService.cleanupExpiredExports(batchSize);
    } catch (error) {
      logError('[OperationalJobService] cleanupExpiredPrivacyExports failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const operationalJobService = new OperationalJobService();
