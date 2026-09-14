import mongoose, { Schema, Document } from 'mongoose';
import { OperationalJobType, OperationalJobStatus, DEFAULT_MAX_ATTEMPTS } from '../constants/operationalJob';

/**
 * ONE generic persistent job row (PR-OPS-1/2) — mirrors EmailDelivery's
 * proven claim/backoff/attempt-tracking shape so this satisfies
 * "persistence, delayed retry, backoff, concurrency-safe claiming" without
 * introducing a second queue technology (no Redis/BullMQ).
 *
 * `payload` MUST stay small and safe: entity IDs and small primitives only
 * (e.g. `{organizationId, userId, orderId, objectKey, subscriptionId}`-
 * shaped). NEVER put a secret/token/raw file bytes/full request body in
 * here — job payloads are readable via the admin API.
 */
export interface IOperationalJob extends Document {
  jobType: OperationalJobType;
  payload: Record<string, unknown>;
  status: OperationalJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  firstFailedAt?: Date;
  lastFailedAt?: Date;
  /** Bounded, non-sensitive — NEVER a raw stack trace or secret. */
  failureCode?: string;
  /** Bounded, non-sensitive — NEVER a raw stack trace or secret. */
  failureMessage?: string;
  idempotencyKey?: string;
  adminReviewStatus?: 'acknowledged' | 'retried' | 'resolved';
  manualRetryCount: number;
  lastRetriedByAdminUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const operationalJobSchema = new Schema<IOperationalJob>(
  {
    jobType: {
      type: String,
      enum: Object.values(OperationalJobType),
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'dead_letter', 'cancelled'],
      required: true,
      default: 'pending',
    },
    attemptCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
      default: DEFAULT_MAX_ATTEMPTS,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    firstFailedAt: { type: Date },
    lastFailedAt: { type: Date },
    failureCode: {
      type: String,
      trim: true,
      maxlength: [100, 'failureCode cannot exceed 100 characters'],
    },
    failureMessage: {
      type: String,
      trim: true,
      maxlength: [500, 'failureMessage cannot exceed 500 characters'],
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: [250, 'idempotencyKey cannot exceed 250 characters'],
    },
    adminReviewStatus: {
      type: String,
      enum: ['acknowledged', 'retried', 'resolved'],
    },
    manualRetryCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    lastRetriedByAdminUserId: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'operational_jobs',
  }
);

// Drives the claim query (findOneAndUpdate on status+nextAttemptAt).
operationalJobSchema.index({ status: 1, nextAttemptAt: 1 });
// Admin filtering by type + status.
operationalJobSchema.index({ jobType: 1, status: 1 });
// Same idempotency-race defensive pattern used elsewhere in this codebase
// (e.g. OrganizationInterviewCreditLedger's partial-unique index) — job
// idempotency keys are expected to already be globally unique strings
// (e.g. `payment-reconcile:<orderId>`), so a simple `{idempotencyKey}`
// unique partial index (filtered to only string values) is sufficient.
operationalJobSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export const OperationalJob = mongoose.model<IOperationalJob>('OperationalJob', operationalJobSchema);
