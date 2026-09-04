import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Atomic balance projection for an institute organization's interview
 * credits (15D) — mirrors the B2C InterviewCreditBalance pattern exactly,
 * for the same reason: a single-document atomic $inc (with a
 * balance>=required filter for debits) is concurrency-safe even on a
 * standalone (non-replica-set) MongoDB deployment, unlike multi-document
 * transactions — and this codebase never uses transactions today.
 *
 * NOT a `balance` field on the Organization model/document itself (that is
 * explicitly disallowed) and NOT the audit source of truth — this value
 * always mirrors the latest OrganizationInterviewCreditLedger row's
 * `balanceAfter` because every mutation updates both atomically in the same
 * service call. The ledger remains the historical/audit record; this
 * collection exists purely so `getBalance()` is O(1) and so concurrent
 * consumes can never overspend.
 */
export interface IOrganizationInterviewCreditBalance extends Document {
  organizationId: Types.ObjectId;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const organizationInterviewCreditBalanceSchema = new Schema<IOrganizationInterviewCreditBalance>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
  },
  {
    timestamps: true,
    collection: 'organization_interview_credit_balances',
  }
);

export const OrganizationInterviewCreditBalance = mongoose.model<IOrganizationInterviewCreditBalance>(
  'OrganizationInterviewCreditBalance',
  organizationInterviewCreditBalanceSchema
);
