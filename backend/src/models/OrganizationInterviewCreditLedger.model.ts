import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationCreditLedgerType = 'GRANT' | 'CONSUME' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'EXPIRE';

export type OrganizationCreditLedgerReferenceType = 'plan' | 'interview' | 'admin' | 'system';

/**
 * One immutable institute-organization interview-credit transaction (15D).
 * Append-only by service convention — no update/delete operations exist for
 * these documents. Deliberately SEPARATE from InterviewCreditLedger (the
 * personal/B2C ledger, keyed by userId) — an organization's credits and a
 * user's personal credits must never share a collection or be summed
 * together. Pricing/plans (15E) and actual consumption during institute
 * assignment start are NOT wired up yet — this is the ledger/service
 * foundation only.
 */
export interface IOrganizationInterviewCreditLedger extends Document {
  organizationId: Types.ObjectId;
  interviewId?: Types.ObjectId;
  type: OrganizationCreditLedgerType;
  /** Signed integer: positive = credit added, negative = credit removed. */
  amount: number;
  /** Resulting balance after this transaction — always >= 0. */
  balanceAfter: number;
  referenceType?: OrganizationCreditLedgerReferenceType;
  referenceId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const integerValidator = { validator: Number.isInteger, message: '{PATH} must be an integer' };

const organizationInterviewCreditLedgerSchema = new Schema<IOrganizationInterviewCreditLedger>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
    },
    type: {
      type: String,
      enum: ['GRANT', 'CONSUME', 'REFUND', 'ADMIN_ADJUSTMENT', 'EXPIRE'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      validate: integerValidator,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    referenceType: {
      type: String,
      enum: ['plan', 'interview', 'admin', 'system'],
    },
    referenceId: {
      type: String,
    },
    idempotencyKey: {
      type: String,
    },
    description: {
      type: String,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'organization_interview_credit_ledgers',
  }
);

organizationInterviewCreditLedgerSchema.index({ organizationId: 1, createdAt: -1 });
organizationInterviewCreditLedgerSchema.index({ organizationId: 1, type: 1 });
organizationInterviewCreditLedgerSchema.index({ interviewId: 1 });
organizationInterviewCreditLedgerSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const OrganizationInterviewCreditLedger = mongoose.model<IOrganizationInterviewCreditLedger>(
  'OrganizationInterviewCreditLedger',
  organizationInterviewCreditLedgerSchema
);
