import mongoose, { Schema, Document, Types } from 'mongoose';

export type PrivacyAction =
  | 'export_requested'
  | 'export_completed'
  | 'deletion_requested'
  | 'deletion_completed'
  | 'deletion_partial'
  | 'candidate_anonymized'
  | 'consent_updated'
  | 'retention_cleanup';

export type PrivacyActionStatus = 'pending' | 'processing' | 'completed' | 'partial' | 'failed';

/**
 * Append-only audit trail (PR-PRIVACY-1) for every export/deletion/consent
 * action taken by this codebase's privacy features. `metadata` MUST NEVER
 * contain a password/JWT/raw interview answer/full resume/security token —
 * same discipline as every other audit/ledger model in this codebase
 * (e.g. AuthSecurityEvent). Bounded, non-sensitive fields only.
 */
export interface IPrivacyActionAudit extends Document {
  action: PrivacyAction;
  /** Who performed the action — may differ from the subject (e.g. an org admin anonymizing a candidate). */
  actorUserId?: Types.ObjectId;
  subjectUserId?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  candidateId?: Types.ObjectId;
  status: PrivacyActionStatus;
  requestedAt: Date;
  completedAt?: Date;
  /** Bounded exemption-reason strings — see utils/deletionExemptions.ts. */
  retainedCategories?: string[];
  failureCode?: string;
  failureMessage?: string;
  /** NEVER password/JWT/raw interview answers/full resume/security tokens. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const privacyActionAuditSchema = new Schema<IPrivacyActionAudit>(
  {
    action: {
      type: String,
      enum: [
        'export_requested',
        'export_completed',
        'deletion_requested',
        'deletion_completed',
        'deletion_partial',
        'candidate_anonymized',
        'consent_updated',
        'retention_cleanup',
      ],
      required: true,
    },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    subjectUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'partial', 'failed'],
      required: true,
      default: 'pending',
    },
    requestedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date },
    retainedCategories: {
      type: [String],
      default: undefined,
      validate: {
        validator: (v: string[]) => v.length <= 10,
        message: 'retainedCategories cannot exceed 10 entries',
      },
    },
    failureCode: { type: String, trim: true, maxlength: [100, 'failureCode cannot exceed 100 characters'] },
    failureMessage: { type: String, trim: true, maxlength: [500, 'failureMessage cannot exceed 500 characters'] },
    // See class doc above — NEVER a secret/token/raw content field.
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'privacy_action_audits',
  }
);

privacyActionAuditSchema.index({ subjectUserId: 1, createdAt: -1 });
privacyActionAuditSchema.index({ organizationId: 1, createdAt: -1 });
privacyActionAuditSchema.index({ action: 1, status: 1 });

export const PrivacyActionAudit = mongoose.model<IPrivacyActionAudit>('PrivacyActionAudit', privacyActionAuditSchema);
export default PrivacyActionAudit;
