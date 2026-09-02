import mongoose, { Schema, Document, Types } from 'mongoose';

export type CreditLedgerType =
  | 'PLAN_GRANT'
  | 'PACK_GRANT'
  | 'CONSUME'
  | 'REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRE';

export type CreditLedgerReferenceType = 'subscription' | 'interview' | 'pack' | 'admin' | 'system';

/**
 * One immutable interview-credit transaction. Append-only by service
 * convention — no update/delete operations exist for these documents.
 */
export interface IInterviewCreditLedger extends Document {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  interviewId?: Types.ObjectId;
  type: CreditLedgerType;
  /** Signed integer: positive = credit added, negative = credit removed. */
  amount: number;
  /** Resulting balance after this transaction — always >= 0. */
  balanceAfter: number;
  referenceType?: CreditLedgerReferenceType;
  referenceId?: string;
  idempotencyKey?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const integerValidator = { validator: Number.isInteger, message: '{PATH} must be an integer' };

const interviewCreditLedgerSchema = new Schema<IInterviewCreditLedger>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'UserSubscription',
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
    },
    type: {
      type: String,
      enum: ['PLAN_GRANT', 'PACK_GRANT', 'CONSUME', 'REFUND', 'ADMIN_ADJUSTMENT', 'EXPIRE'],
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
      enum: ['subscription', 'interview', 'pack', 'admin', 'system'],
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
    collection: 'interviewcreditledgers',
  }
);

interviewCreditLedgerSchema.index({ userId: 1, createdAt: -1 });
interviewCreditLedgerSchema.index({ userId: 1, type: 1 });
interviewCreditLedgerSchema.index({ interviewId: 1 });
interviewCreditLedgerSchema.index({ subscriptionId: 1 });
interviewCreditLedgerSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const InterviewCreditLedger = mongoose.model<IInterviewCreditLedger>(
  'InterviewCreditLedger',
  interviewCreditLedgerSchema
);
