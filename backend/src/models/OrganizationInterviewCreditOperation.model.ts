import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationCreditOperationStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

/**
 * Idempotency claim/reservation for one {organizationId, idempotencyKey}
 * credit operation (15D hardening). This collection — NOT a check against
 * the ledger — is what actually serializes concurrent same-key callers:
 * only the caller whose insert wins this collection's unique compound
 * index may mutate OrganizationInterviewCreditBalance for that key. Every
 * other concurrent caller for the exact same {organizationId,
 * idempotencyKey} must recover the COMPLETED result (or atomically revive
 * a FAILED claim before retrying) instead of ever touching balance itself.
 *
 * Not audit history — OrganizationInterviewCreditLedger remains the
 * immutable record of what actually happened; this collection exists
 * purely to make "claim this key" a single atomic operation.
 */
export interface IOrganizationInterviewCreditOperation extends Document {
  organizationId: Types.ObjectId;
  idempotencyKey: string;
  status: OrganizationCreditOperationStatus;
  ledgerTransactionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationInterviewCreditOperationSchema = new Schema<IOrganizationInterviewCreditOperation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      required: true,
      default: 'PENDING',
    },
    ledgerTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationInterviewCreditLedger',
    },
  },
  {
    timestamps: true,
    collection: 'organization_interview_credit_operations',
  }
);

// The actual claim mechanism — the first insert for a given
// {organizationId, idempotencyKey} pair wins; every subsequent insert
// attempt for that exact pair fails with a duplicate-key error.
organizationInterviewCreditOperationSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });

export const OrganizationInterviewCreditOperation = mongoose.model<IOrganizationInterviewCreditOperation>(
  'OrganizationInterviewCreditOperation',
  organizationInterviewCreditOperationSchema
);
