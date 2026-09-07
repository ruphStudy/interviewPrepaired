import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * DB-backed outbox row (31D) — one delivery attempt lineage per
 * {connection, event}. Created eagerly (best-effort) whenever an
 * `EmployerIntegrationEvent` is emitted, for every eligible active
 * connection; actual HTTP delivery (31E, generic webhooks) happens
 * OUTSIDE any primary business transaction — a delivery failure never
 * affects the hiring operation that produced the event. Bounded, and
 * NEVER retried forever.
 */
export type EmployerIntegrationDeliveryStatus = 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter';

export interface IEmployerIntegrationDelivery extends Document {
  organizationId: Types.ObjectId;
  connectionId: Types.ObjectId;
  integrationEventId: Types.ObjectId;
  status: EmployerIntegrationDeliveryStatus;
  attemptCount: number;
  nextAttemptAt?: Date;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  responseStatus?: number;
  /** Short, safe, user-facing message only — never a raw provider/library error dump, never the signing secret. */
  errorMessage?: string;
  deliveryVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

const employerIntegrationDeliverySchema = new Schema<IEmployerIntegrationDelivery>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    connectionId: { type: Schema.Types.ObjectId, ref: 'EmployerIntegrationConnection', required: true },
    integrationEventId: { type: Schema.Types.ObjectId, ref: 'EmployerIntegrationEvent', required: true },
    status: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'failed', 'dead_letter'],
      required: true,
      default: 'pending',
    },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    nextAttemptAt: { type: Date },
    lastAttemptAt: { type: Date },
    deliveredAt: { type: Date },
    responseStatus: { type: Number },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
    deliveryVersion: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_integration_deliveries',
  }
);

// Exactly one delivery row per {connection, event} — doubles as the
// concurrency claim/de-dupe guard for outbox fan-out.
employerIntegrationDeliverySchema.index({ connectionId: 1, integrationEventId: 1 }, { unique: true });
employerIntegrationDeliverySchema.index({ organizationId: 1, connectionId: 1, createdAt: -1 });
employerIntegrationDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

export default mongoose.model<IEmployerIntegrationDelivery>('EmployerIntegrationDelivery', employerIntegrationDeliverySchema);
