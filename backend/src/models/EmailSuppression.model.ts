import mongoose, { Schema, Document } from 'mongoose';
import { EmailSuppressionReason } from '../constants/email';

/**
 * A recipient we must NOT send transactional email to again (hard bounce /
 * spam complaint / manual). Checked before every send. `normalizedEmail` is
 * kept (not just a hash) because the suppression check and any future
 * admin-clear workflow both need the literal address — this is the
 * minimum PII genuinely required for the feature to work.
 */
export interface IEmailSuppression extends Document {
  normalizedEmail: string;
  reason: EmailSuppressionReason;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
}

const emailSuppressionSchema = new Schema<IEmailSuppression>(
  {
    normalizedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: [254, 'normalizedEmail cannot exceed 254 characters'],
    },
    reason: {
      type: String,
      enum: Object.values(EmailSuppressionReason),
      required: true,
    },
    provider: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'emailsuppressions',
  }
);

export const EmailSuppression = mongoose.model<IEmailSuppression>('EmailSuppression', emailSuppressionSchema);
