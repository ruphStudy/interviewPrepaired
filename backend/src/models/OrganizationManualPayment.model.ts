import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationManualPaymentMethod = 'bank_transfer' | 'invoice' | 'offline' | 'other';

/**
 * ONE manually-recorded offline/contract payment (PR-B2B-BILL-5) — admin
 * bookkeeping only, never a substitute for verified online payment
 * settlement. `source` is hardcoded to `'manual'` (not client-settable) so
 * this row can never be mistaken for a Razorpay-verified payment anywhere
 * it is read. Never deleted — status/audit history is permanent.
 */
export interface IOrganizationManualPayment extends Document {
  organizationId: Types.ObjectId;
  method: OrganizationManualPaymentMethod;
  amountPaise: number;
  currency: string;
  referenceNote?: string;
  paymentDate: Date;
  recordedByAdminUserId: Types.ObjectId;
  /** Always 'manual' — never implies online/verified settlement. */
  source: 'manual';
  contractId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationManualPaymentSchema = new Schema<IOrganizationManualPayment>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    method: {
      type: String,
      enum: ['bank_transfer', 'invoice', 'offline', 'other'],
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    referenceNote: {
      type: String,
      trim: true,
      maxlength: [300, 'referenceNote cannot exceed 300 characters'],
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    recordedByAdminUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    source: {
      type: String,
      enum: ['manual'],
      default: 'manual',
      required: true,
      immutable: true,
    },
    contractId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationContract',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'notes cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'organization_manual_payments',
  }
);

organizationManualPaymentSchema.index({ organizationId: 1, createdAt: -1 });

export const OrganizationManualPayment = mongoose.model<IOrganizationManualPayment>(
  'OrganizationManualPayment',
  organizationManualPaymentSchema
);
