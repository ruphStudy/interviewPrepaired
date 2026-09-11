import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE B2C checkout attempt/order (PR-BILL-1/2). This is the local source of
 * truth for "what was this payment supposed to be for and how much" —
 * created BEFORE any provider call, so the amount/currency/purchase
 * identity are always server-decided and never trusted from the client.
 * `status` only ever advances via BillingCheckoutService (order creation),
 * BillingSettlementService (verified settlement — the ONLY path that grants
 * entitlement), or provider webhook processing (failure/refund markers).
 * Never stores a provider secret or raw webhook payload.
 */
export type PaymentPurchaseType = 'subscription' | 'credit_pack';
export type PaymentProviderName = 'razorpay';
export type PaymentOrderStatus =
  | 'created'
  | 'provider_created'
  | 'payment_pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

export interface IPaymentOrder extends Document {
  userId: Types.ObjectId;
  purchaseType: PaymentPurchaseType;
  planId?: Types.ObjectId;
  planCode?: string;
  creditPackId?: Types.ObjectId;
  creditPackCode?: string;
  amountPaise: number;
  currency: string;
  provider: PaymentProviderName;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: PaymentOrderStatus;
  idempotencyKey: string;
  receiptReference: string;
  failureCode?: string;
  failureMessage?: string;
  paidAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
  refundedAt?: Date;
  refundedAmountPaise?: number;
  /** Bounded, internal-only context — never provider credentials/secrets/raw webhook payloads. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentOrderSchema = new Schema<IPaymentOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    purchaseType: {
      type: String,
      enum: ['subscription', 'credit_pack'],
      required: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
    },
    planCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    creditPackId: {
      type: Schema.Types.ObjectId,
      ref: 'CreditPack',
    },
    creditPackCode: {
      type: String,
      trim: true,
      uppercase: true,
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
    provider: {
      type: String,
      enum: ['razorpay'],
      required: true,
      default: 'razorpay',
    },
    providerOrderId: {
      type: String,
      trim: true,
    },
    providerPaymentId: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['created', 'provider_created', 'payment_pending', 'paid', 'failed', 'cancelled', 'expired', 'refunded', 'partially_refunded'],
      required: true,
      default: 'created',
    },
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'idempotencyKey cannot exceed 200 characters'],
    },
    receiptReference: {
      type: String,
      required: true,
      trim: true,
    },
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
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    expiredAt: { type: Date },
    refundedAt: { type: Date },
    refundedAmountPaise: { type: Number, min: 0 },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'paymentorders',
  }
);

paymentOrderSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
paymentOrderSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true, sparse: true });
paymentOrderSchema.index({ provider: 1, providerPaymentId: 1 }, { unique: true, sparse: true });
paymentOrderSchema.index({ userId: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1 });

export const PaymentOrder = mongoose.model<IPaymentOrder>('PaymentOrder', paymentOrderSchema);
