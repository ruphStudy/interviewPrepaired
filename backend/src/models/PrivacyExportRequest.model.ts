import mongoose, { Schema, Document, Types } from 'mongoose';

export type PrivacyExportRequestStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

/**
 * One user-data-export request (PR-PRIVACY-2). Mirrors the object-storage
 * reference field naming already used by
 * EmployerCandidateResumeSource.model.ts/OrganizationKnowledgeDocument.model.ts
 * (`objectKey`/`storageProvider`/`checksumSha256`) for consistency. Only
 * ONE active (pending/processing) export per user is allowed — enforced by
 * the partial unique index below, mirroring the exact partial-unique-index
 * style already used for OrganizationSubscription's "one active
 * subscription" invariant.
 */
export interface IPrivacyExportRequest extends Document {
  userId: Types.ObjectId;
  status: PrivacyExportRequestStatus;
  objectKey?: string;
  storageProvider?: 's3' | 'local';
  checksumSha256?: string;
  requestedAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const privacyExportRequestSchema = new Schema<IPrivacyExportRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'expired'],
      required: true,
      default: 'pending',
    },
    objectKey: { type: String },
    storageProvider: { type: String, enum: ['s3', 'local'] },
    checksumSha256: { type: String },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date },
    expiresAt: { type: Date },
    failureReason: { type: String, trim: true, maxlength: [500, 'failureReason cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'privacy_export_requests',
  }
);

privacyExportRequestSchema.index({ userId: 1, createdAt: -1 });
// The actual "only one active export per user" concurrency guard — a
// second request while one is already pending/processing hits E11000,
// which PrivacyExportService catches and resolves by returning the
// existing row instead of erroring.
privacyExportRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'processing'] } } }
);
privacyExportRequestSchema.index({ status: 1, expiresAt: 1 });

export const PrivacyExportRequest = mongoose.model<IPrivacyExportRequest>('PrivacyExportRequest', privacyExportRequestSchema);
export default PrivacyExportRequest;
