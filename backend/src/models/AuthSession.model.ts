import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuthSessionStatus = 'active' | 'revoked' | 'expired';

/**
 * ONE issued login session (PR-AUTH-3) — the server-enforced counterpart
 * to a JWT. The JWT's `sessionId` claim references a row here; every
 * protected request re-validates that the row still exists, is `active`,
 * and hasn't passed `expiresAt` — this is what makes logout/logout-all/
 * password-reset/password-change able to invalidate an ALREADY-ISSUED,
 * still-cryptographically-valid JWT. Never stores the JWT itself, never
 * an IP address (deliberately, to avoid over-collecting PII) — only a
 * bounded user-agent summary for the user's own "sessions" UI.
 */
export interface IAuthSession extends Document {
  userId: Types.ObjectId;
  sessionId: string;
  status: AuthSessionStatus;
  lastSeenAt?: Date;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  userAgentSummary?: string;
  createdAt: Date;
  updatedAt: Date;
}

const authSessionSchema = new Schema<IAuthSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['active', 'revoked', 'expired'],
      required: true,
      default: 'active',
    },
    lastSeenAt: { type: Date },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: { type: Date },
    revokedReason: {
      type: String,
      trim: true,
      maxlength: [100, 'revokedReason cannot exceed 100 characters'],
    },
    userAgentSummary: {
      type: String,
      trim: true,
      maxlength: [200, 'userAgentSummary cannot exceed 200 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'authsessions',
  }
);

authSessionSchema.index({ sessionId: 1 }, { unique: true });
authSessionSchema.index({ userId: 1, status: 1 });
authSessionSchema.index({ expiresAt: 1 });

export const AuthSession = mongoose.model<IAuthSession>('AuthSession', authSessionSchema);
