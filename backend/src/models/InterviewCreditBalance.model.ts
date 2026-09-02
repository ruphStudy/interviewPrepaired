import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Atomic balance projection — NOT the source of truth for history/audit
 * (InterviewCreditLedger is). Exists only so concurrent credit mutations
 * can use a single-document atomic $inc + conditional filter (Mongo
 * guarantees single-document update atomicity even on a standalone
 * deployment, unlike multi-document transactions). Every successful
 * mutation here must also append a ledger entry.
 */
export interface IInterviewCreditBalance extends Document {
  userId: Types.ObjectId;
  balance: number;
  createdAt: Date;
  updatedAt: Date;
}

const interviewCreditBalanceSchema = new Schema<IInterviewCreditBalance>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
    collection: 'interviewcreditbalances',
  }
);

export const InterviewCreditBalance = mongoose.model<IInterviewCreditBalance>(
  'InterviewCreditBalance',
  interviewCreditBalanceSchema
);
