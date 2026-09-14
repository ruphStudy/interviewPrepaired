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
export type PaymentPurchaseType = 'subscription' | 'credit_pack' | 'organization_credit_pack' | 'organization_subscription';
export type PaymentProviderName = 'razorpay';
/** 'user' = B2C (existing, default for every pre-existing row). 'organization' = B2B (PR-B2B-BILL) — userId still stores the ACTING/initiating member's user id, never blank. */
export type PaymentBuyerType = 'user' | 'organization';
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
  /** Defaults to 'user' for every existing/legacy row — see PaymentBuyerType. */
  buyerType: PaymentBuyerType;
  /** Set only when buyerType === 'organization'. */
  organizationId?: Types.ObjectId;
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
    buyerType: {
      type: String,
      enum: ['user', 'organization'],
      required: true,
      default: 'user',
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
    },
    purchaseType: {
      type: String,
      enum: ['subscription', 'credit_pack', 'organization_credit_pack', 'organization_subscription'],
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
// `sparse: true` on a COMPOUND index only skips a document when ALL of the
// index's fields are missing — since `provider` is `required` (always
// present), these two indexes were effectively NON-sparse in practice: every
// order created before a provider order/payment id is assigned (i.e. every
// single checkout attempt, and always when the payment provider is
// unconfigured) indexes as `providerOrderId: null`/`providerPaymentId:
// null`, so the second such order from ANY user collided with the first and
// crashed checkout with a raw E11000 500. A partial index (matching the
// `organizationId` index below) only indexes documents where the field
// genuinely exists, which is what was actually intended here.
paymentOrderSchema.index(
  { provider: 1, providerOrderId: 1 },
  { unique: true, partialFilterExpression: { providerOrderId: { $exists: true } } }
);
paymentOrderSchema.index(
  { provider: 1, providerPaymentId: 1 },
  { unique: true, partialFilterExpression: { providerPaymentId: { $exists: true } } }
);
paymentOrderSchema.index({ userId: 1, createdAt: -1 });
paymentOrderSchema.index({ status: 1 });
// Organization purchases are idempotency-scoped by organizationId, not
// userId — two different admins of the same org using the same key must
// collide with each other. This is additive/partial: it never touches the
// existing {userId, idempotencyKey} unique index above, and only applies to
// rows that actually have an organizationId (organization purchases).
paymentOrderSchema.index(
  { organizationId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { organizationId: { $exists: true } } }
);
paymentOrderSchema.index({ organizationId: 1, createdAt: -1 });

export const PaymentOrder = mongoose.model<IPaymentOrder>('PaymentOrder', paymentOrderSchema);
