import mongoose, { Schema, Document, Types } from 'mongoose';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationMemberRole } from '../constants/organizationMember';

/**
 * Only `tokenHash` (SHA-256 of a random raw token) is ever persisted — the
 * raw token exists solely in the create/resend API response and is never
 * logged or stored. No TTL index: revoked/accepted/expired rows stay as an
 * audit trail rather than being auto-deleted.
 */
export interface IOrganizationInvitation extends Document {
  organizationId: Types.ObjectId;
  email: string;
  role: OrganizationMemberRole;
  status: OrganizationInvitationStatus;
  invitedByUserId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  acceptedByUserId?: Types.ObjectId;
  acceptedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationInvitationSchema = new Schema<IOrganizationInvitation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    email: {
      type: String,
      required: [true, 'Invitation email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email cannot exceed 254 characters'],
    },
    role: {
      type: String,
      enum: {
        values: Object.values(OrganizationMemberRole),
        message: '{VALUE} is not a valid organization role',
      },
      required: [true, 'Invitation role is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(OrganizationInvitationStatus),
        message: '{VALUE} is not a valid invitation status',
      },
      default: OrganizationInvitationStatus.PENDING,
      required: true,
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    acceptedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    acceptedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'organization_invitations',
  }
);

organizationInvitationSchema.index({ organizationId: 1, email: 1, status: 1 });
organizationInvitationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
// Not a TTL index — no `expires` option. Invitation history is retained
// regardless of expiry; `getInvitationByToken` lazily flips PENDING+expired
// rows to EXPIRED rather than relying on Mongo to remove them.
organizationInvitationSchema.index({ expiresAt: 1 });

export default mongoose.model<IOrganizationInvitation>('OrganizationInvitation', organizationInvitationSchema);
