import mongoose, { Schema, Document } from 'mongoose';

export type EmailProviderEventProcessingStatus = 'received' | 'processed' | 'ignored' | 'failed';

/**
 * Append-only log of every received email-provider webhook delivery
 * (PR-COMM-6). The unique (provider, providerEventId) index is what makes
 * a replayed/duplicate webhook delivery a safe no-op instead of a second
 * state transition on the related EmailDelivery.
 */
export interface IEmailProviderEvent extends Document {
  provider: string;
  providerEventId: string;
  providerMessageId?: string;
  eventType: string;
  signatureVerified: boolean;
  processingStatus: EmailProviderEventProcessingStatus;
  occurredAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailProviderEventSchema = new Schema<IEmailProviderEvent>(
  {
    provider: {
      type: String,
      required: true,
      trim: true,
    },
    providerEventId: {
      type: String,
      required: true,
      trim: true,
    },
    providerMessageId: {
      type: String,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
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
    occurredAt: { type: Date },
    failureReason: {
      type: String,
      trim: true,
      maxlength: [500, 'failureReason cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'emailproviderevents',
  }
);

emailProviderEventSchema.index({ provider: 1, providerEventId: 1 }, { unique: true });
emailProviderEventSchema.index({ providerMessageId: 1 });

export const EmailProviderEvent = mongoose.model<IEmailProviderEvent>('EmailProviderEvent', emailProviderEventSchema);
