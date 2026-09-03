import mongoose, { Schema, Document, Types } from 'mongoose';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';

/**
 * Many-to-many membership layer between User and Organization — a user can
 * belong to multiple organizations, each with its own tenant-scoped role.
 * Deliberately minimal: no permissions array (8C/8D), no invitation fields
 * (8E), no embedded user/organization data (identity references only).
 */
export interface IOrganizationMember extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  // Business "became an active member" timestamp — distinct from
  // `createdAt`, which can differ once invitations (8E) introduce a gap
  // between record creation and actual joining.
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationMemberSchema = new Schema<IOrganizationMember>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // No default — role must be chosen intentionally by the caller (8B).
    role: {
      type: String,
      enum: {
        values: Object.values(OrganizationMemberRole),
        message: '{VALUE} is not a valid organization member role',
      },
      required: [true, 'Organization member role is required'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(OrganizationMemberStatus),
        message: '{VALUE} is not a valid organization member status',
      },
      default: OrganizationMemberStatus.ACTIVE,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'organization_members',
  }
);

// At most one membership record per user per organization.
organizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
organizationMemberSchema.index({ organizationId: 1, status: 1, role: 1, createdAt: -1 });
organizationMemberSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export default mongoose.model<IOrganizationMember>('OrganizationMember', organizationMemberSchema);
