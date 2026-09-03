import mongoose, { Schema, Document, Types } from 'mongoose';
import { OrganizationStatus } from '../constants/organization';

/**
 * Generic tenant/account root aggregate — deliberately not coupled to any
 * specific organization type, interview data, members, or billing yet.
 * Prompt 7B adds institute/company specialization; 7C adds tenant isolation
 * on other models; Sprint 8 adds membership/RBAC.
 */
export interface IOrganizationSettings {
  timezone?: string;
}

export interface IOrganization extends Document {
  ownerUserId: Types.ObjectId;
  name: string;
  slug: string;
  status: OrganizationStatus;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings: IOrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSettingsSchema = new Schema<IOrganizationSettings>(
  {
    // India-first product — a sensible default, not a hard requirement.
    timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
  },
  { _id: false }
);

const organizationSchema = new Schema<IOrganization>(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [120, 'Organization name cannot exceed 120 characters'],
    },
    // Not globally derived from `name` here — a creation flow (Prompt 7D)
    // owns slug generation/collision handling; this field just stores and
    // enforces the final, unique value.
    slug: {
      type: String,
      required: [true, 'Organization slug is required'],
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: [140, 'Organization slug cannot exceed 140 characters'],
      match: [/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug may only contain lowercase letters, numbers, and hyphens'],
    },
    status: {
      type: String,
      enum: {
        values: Object.values(OrganizationStatus),
        message: '{VALUE} is not a valid organization status',
      },
      default: OrganizationStatus.ACTIVE,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    website: {
      type: String,
      trim: true,
      maxlength: [300, 'Website cannot exceed 300 characters'],
    },
    logoUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Logo URL cannot exceed 500 characters'],
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [254, 'Contact email cannot exceed 254 characters'],
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: [30, 'Contact phone cannot exceed 30 characters'],
    },
    settings: {
      type: organizationSettingsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    collection: 'organizations',
  }
);

organizationSchema.index({ ownerUserId: 1, createdAt: -1 });
organizationSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IOrganization>('Organization', organizationSchema);
