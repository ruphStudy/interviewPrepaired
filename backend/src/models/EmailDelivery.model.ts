import mongoose, { Schema, Document } from 'mongoose';
import { EmailTemplateCode, EmailDeliveryStatus } from '../constants/email';

export type EmailProviderName = 'resend' | 'dev-console';

/**
 * ONE transactional email send attempt lifecycle (PR-COMM-2) — the
 * technical delivery record. Deliberately separate from
 * EmployerCandidateCommunication (the BUSINESS communication audit) — this
 * model is never merged with it. Never stores a raw security token (reset/
 * invitation) — only the rendered subject snapshot and bounded, non-
 * sensitive metadata. `recipientHash` exists purely for suppression
 * cross-referencing; `recipient` itself is still stored in the clear
 * because the retry worker needs the literal address to actually send.
 */
export interface IEmailDelivery extends Document {
  recipient: string;
  recipientHash: string;
  templateCode: EmailTemplateCode;
  status: EmailDeliveryStatus;
  provider: EmailProviderName;
  providerMessageId?: string;
  subjectSnapshot: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  bouncedAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  idempotencyKey: string;
  /** Bounded, non-sensitive context only — NEVER a raw security token. */
  metadata?: Record<string, unknown>;
  /**
   * Rendered content held ONLY long enough for the background retry worker
   * to complete an in-flight send — `select: false` so it is invisible to
   * every normal query, admin-visibility mapper, and log statement unless
   * explicitly requested with `.select('+pendingContent')`. A security-link
   * token embedded in this HTML/text is therefore never queryable through
   * the ordinary EmailDelivery shape, is never included in `metadata`, and
   * is deleted the moment the delivery reaches ANY terminal state (sent,
   * permanently failed, bounced, suppressed) — never an indefinite archive.
   */
  pendingContent?: { html: string; text: string; replyTo?: string };
  createdAt: Date;
  updatedAt: Date;
}

const emailDeliverySchema = new Schema<IEmailDelivery>(
  {
    recipient: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: [254, 'recipient cannot exceed 254 characters'],
    },
    recipientHash: {
      type: String,
      required: true,
    },
    templateCode: {
      type: String,
      enum: Object.values(EmailTemplateCode),
      required: true,
    },
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'suppressed', 'cancelled'],
      required: true,
      default: 'queued',
    },
    provider: {
      type: String,
      enum: ['resend', 'dev-console'],
      required: true,
    },
    providerMessageId: {
      type: String,
      trim: true,
    },
    subjectSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: [300, 'subjectSnapshot cannot exceed 300 characters'],
    },
    relatedEntityType: {
      type: String,
      trim: true,
      maxlength: [100, 'relatedEntityType cannot exceed 100 characters'],
    },
    relatedEntityId: {
      type: String,
      trim: true,
    },
    attemptCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
    },
    lastAttemptAt: { type: Date },
    nextAttemptAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    failedAt: { type: Date },
    bouncedAt: { type: Date },
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
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: [250, 'idempotencyKey cannot exceed 250 characters'],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    pendingContent: {
      type: new Schema(
        {
          html: { type: String, required: true },
          text: { type: String, required: true },
          replyTo: { type: String },
        },
        { _id: false }
      ),
      select: false,
    },
  },
  {
    timestamps: true,
    collection: 'emaildeliveries',
  }
);

emailDeliverySchema.index({ idempotencyKey: 1 }, { unique: true });
emailDeliverySchema.index({ provider: 1, providerMessageId: 1 }, { sparse: true });
emailDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
emailDeliverySchema.index({ relatedEntityType: 1, relatedEntityId: 1 });
emailDeliverySchema.index({ recipientHash: 1 });

export const EmailDelivery = mongoose.model<IEmailDelivery>('EmailDelivery', emailDeliverySchema);
