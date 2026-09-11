import mongoose, { Schema, Document } from 'mongoose';

/**
 * Append-only log of every received Razorpay webhook delivery (PR-BILL-3).
 * `providerEventId` is the provider's own event id when present, else a
 * deterministic sha256 fingerprint of the raw body — either way, the unique
 * index below is what makes a replayed/duplicate webhook delivery a no-op
 * instead of a second entitlement grant. Never stores the raw payload.
 */
export type PaymentWebhookProcessingStatus = 'received' | 'processed' | 'ignored' | 'failed';

export interface IPaymentWebhookEvent extends Document {
  provider: 'razorpay';
  providerEventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  signatureVerified: boolean;
  processingStatus: PaymentWebhookProcessingStatus;
  processedAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentWebhookEventSchema = new Schema<IPaymentWebhookEvent>(
  {
    provider: {
      type: String,
      enum: ['razorpay'],
      required: true,
      default: 'razorpay',
    },
    providerEventId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    providerOrderId: { type: String, trim: true },
    providerPaymentId: { type: String, trim: true },
    signatureVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    processingStatus: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'failed'],
      required: true,
      default: 'received',
    },
    processedAt: { type: Date },
    failureReason: {
      type: String,
      trim: true,
      maxlength: [500, 'failureReason cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'paymentwebhookevents',
  }
);

paymentWebhookEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ providerOrderId: 1 });
paymentWebhookEventSchema.index({ createdAt: -1 });

export const PaymentWebhookEvent = mongoose.model<IPaymentWebhookEvent>('PaymentWebhookEvent', paymentWebhookEventSchema);
