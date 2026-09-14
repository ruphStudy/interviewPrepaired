import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuthSecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'account_temporarily_locked'
  | 'logout'
  | 'logout_all'
  | 'password_changed'
  | 'password_reset'
  | 'email_verified'
  | 'verification_resent'
  | 'session_revoked';

/**
 * Minimal append-only account-security audit trail (PR-AUTH-4). Never
 * stores a password, JWT, reset token, or verification token — only the
 * event type, a loose user reference (absent for an unknown-email login
 * attempt, by design — we never look up/create a user record just to log
 * against it), and bounded, non-sensitive context.
 */
export interface IAuthSecurityEvent extends Document {
  userId?: Types.ObjectId;
  eventType: AuthSecurityEventType;
  occurredAt: Date;
  sessionId?: string;
  userAgentSummary?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const authSecurityEventSchema = new Schema<IAuthSecurityEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    eventType: {
      type: String,
      enum: [
        'login_success',
        'login_failure',
        'account_temporarily_locked',
        'logout',
        'logout_all',
        'password_changed',
        'password_reset',
        'email_verified',
        'verification_resent',
        'session_revoked',
      ],
      required: true,
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sessionId: {
      type: String,
      trim: true,
    },
    userAgentSummary: {
      type: String,
      trim: true,
      maxlength: [200, 'userAgentSummary cannot exceed 200 characters'],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'authsecurityevents',
  }
);

authSecurityEventSchema.index({ userId: 1, occurredAt: -1 });
authSecurityEventSchema.index({ eventType: 1, occurredAt: -1 });

export const AuthSecurityEvent = mongoose.model<IAuthSecurityEvent>('AuthSecurityEvent', authSecurityEventSchema);
