import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserConsentType = 'terms' | 'privacy_policy';

/**
 * Append-only consent record (PR-PRIVACY-4). A new version of a policy
 * gets its OWN row (unique on {userId, consentType, version}) rather than
 * mutating a previous acceptance in place — re-accepting the SAME version
 * again (e.g. a retried request) upserts that one row idempotently, but
 * history across versions is never overwritten.
 *
 * `ai_processing` is deliberately NOT a consentType here: AI evaluation is
 * a core, non-optional part of the product (see PublicEmployerInterviewInvitationService
 * disclosure/consent gate and the practice-interview flow), so a togglable
 * consent record that could never actually be honored if withdrawn would
 * violate the "no consent toggle with no effect" rule — disclosure text is
 * used instead (see frontend Privacy settings + candidate assessment intro).
 */
export interface IUserConsent extends Document {
  userId: Types.ObjectId;
  consentType: UserConsentType;
  version: string;
  accepted: boolean;
  acceptedAt?: Date;
  withdrawnAt?: Date;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

const userConsentSchema = new Schema<IUserConsent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    consentType: {
      type: String,
      enum: ['terms', 'privacy_policy'],
      required: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
      maxlength: [30, 'version cannot exceed 30 characters'],
    },
    accepted: { type: Boolean, required: true },
    acceptedAt: { type: Date },
    withdrawnAt: { type: Date },
    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, 'source cannot exceed 50 characters'],
    },
  },
  {
    timestamps: true,
    collection: 'user_consents',
  }
);

userConsentSchema.index({ userId: 1, consentType: 1, version: 1 }, { unique: true });
userConsentSchema.index({ userId: 1, createdAt: -1 });

export const UserConsent = mongoose.model<IUserConsent>('UserConsent', userConsentSchema);
export default UserConsent;
