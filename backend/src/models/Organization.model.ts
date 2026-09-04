import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  OrganizationStatus,
  OrganizationType,
  InstituteKind,
  CompanySize,
  OrganizationDateFormat,
  OrganizationTimeFormat,
  DEFAULT_ORGANIZATION_TIMEZONE,
  DEFAULT_ORGANIZATION_LOCALE,
  DEFAULT_ORGANIZATION_DATE_FORMAT,
  DEFAULT_ORGANIZATION_TIME_FORMAT,
} from '../constants/organization';
import { SUPPORTED_LANGUAGE_CODES, DEFAULT_LANGUAGE_CODE, SupportedLanguageCode } from '../config/languages';

/**
 * Generic tenant/account root aggregate — deliberately not coupled to
 * interview data, members, or billing yet. 7C adds tenant isolation on
 * other models; Sprint 8 adds membership/RBAC.
 */
export interface IOrganizationSettings {
  timezone?: string;
  locale?: string;
  dateFormat?: OrganizationDateFormat;
  timeFormat?: OrganizationTimeFormat;
  defaultInterviewLanguage?: SupportedLanguageCode;
}

export interface IInstituteProfile {
  instituteKind?: InstituteKind;
  affiliation?: string;
  accreditation?: string;
  establishedYear?: number;
  studentCount?: number;
  // Institute-wide metadata (10A) — deliberately not branch/course-specific;
  // that belongs to the branch (10B) and course (10C) models.
  officialName?: string;
  instituteCode?: string;
  universityName?: string;
  description?: string;
  website?: string;
  placementEmail?: string;
  placementPhone?: string;
}

export interface ICompanyProfile {
  industry?: string;
  companySize?: CompanySize;
  establishedYear?: number;
  // Company/hiring-specific metadata (16A) — deliberately not job/hiring-team
  // specific; that belongs to Jobs (16B) and hiring-team management (16D).
  officialName?: string;
  companyCode?: string;
  description?: string;
  website?: string;
  careersUrl?: string;
  headquarters?: string;
  linkedinUrl?: string;
  hiringEmail?: string;
  hiringPhone?: string;
}

export interface IOrganization extends Document {
  ownerUserId: Types.ObjectId;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings: IOrganizationSettings;
  // Only the profile matching `type` is expected to be populated — enforced
  // by the pre-validate hook below. Both stay optional metadata either way.
  instituteProfile?: IInstituteProfile;
  companyProfile?: ICompanyProfile;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSettingsSchema = new Schema<IOrganizationSettings>(
  {
    // India-first product — a sensible default, not a hard requirement.
    timezone: { type: String, trim: true, maxlength: [100, 'Timezone cannot exceed 100 characters'], default: DEFAULT_ORGANIZATION_TIMEZONE },
    locale: { type: String, trim: true, maxlength: [20, 'Locale cannot exceed 20 characters'], default: DEFAULT_ORGANIZATION_LOCALE },
    dateFormat: {
      type: String,
      enum: { values: Object.values(OrganizationDateFormat), message: '{VALUE} is not a valid date format' },
      default: DEFAULT_ORGANIZATION_DATE_FORMAT,
    },
    timeFormat: {
      type: String,
      enum: { values: Object.values(OrganizationTimeFormat), message: '{VALUE} is not a valid time format' },
      default: DEFAULT_ORGANIZATION_TIME_FORMAT,
    },
    defaultInterviewLanguage: {
      type: String,
      enum: { values: SUPPORTED_LANGUAGE_CODES, message: '{VALUE} is not a supported interview language' },
      default: DEFAULT_LANGUAGE_CODE,
    },
  },
  { _id: false }
);

/** Shared by both profiles — optional, integer year, not in the future. Upper-bound-only; API-level validation belongs to 7D. */
const establishedYearValidator = {
  validator: (value: number) => Number.isInteger(value) && value <= new Date().getFullYear(),
  message: 'establishedYear must be a whole number and cannot be in the future',
};

const instituteProfileSchema = new Schema<IInstituteProfile>(
  {
    instituteKind: {
      type: String,
      enum: {
        values: Object.values(InstituteKind),
        message: '{VALUE} is not a valid institute kind',
      },
    },
    affiliation: { type: String, trim: true, maxlength: [200, 'Affiliation cannot exceed 200 characters'] },
    accreditation: { type: String, trim: true, maxlength: [200, 'Accreditation cannot exceed 200 characters'] },
    establishedYear: { type: Number, min: 1800, validate: establishedYearValidator },
    studentCount: { type: Number, min: [0, 'studentCount cannot be negative'] },
    officialName: { type: String, trim: true, maxlength: [200, 'officialName cannot exceed 200 characters'] },
    // Not globally unique — different institutions/states may reuse codes (10A §5).
    instituteCode: { type: String, trim: true, uppercase: true, maxlength: [50, 'instituteCode cannot exceed 50 characters'] },
    universityName: { type: String, trim: true, maxlength: [200, 'universityName cannot exceed 200 characters'] },
    description: { type: String, trim: true, maxlength: [1500, 'description cannot exceed 1500 characters'] },
    website: { type: String, trim: true, maxlength: [300, 'website cannot exceed 300 characters'] },
    placementEmail: { type: String, trim: true, lowercase: true, maxlength: [254, 'placementEmail cannot exceed 254 characters'] },
    placementPhone: { type: String, trim: true, maxlength: [30, 'placementPhone cannot exceed 30 characters'] },
  },
  { _id: false }
);

const companyProfileSchema = new Schema<ICompanyProfile>(
  {
    industry: { type: String, trim: true, maxlength: [120, 'Industry cannot exceed 120 characters'] },
    companySize: {
      type: String,
      enum: {
        values: Object.values(CompanySize),
        message: '{VALUE} is not a valid company size',
      },
    },
    establishedYear: { type: Number, min: 1800, validate: establishedYearValidator },
    officialName: { type: String, trim: true, maxlength: [200, 'officialName cannot exceed 200 characters'] },
    // Not globally unique — different companies/subsidiaries may reuse codes, same as instituteCode.
    companyCode: { type: String, trim: true, uppercase: true, maxlength: [50, 'companyCode cannot exceed 50 characters'] },
    description: { type: String, trim: true, maxlength: [1500, 'description cannot exceed 1500 characters'] },
    website: { type: String, trim: true, maxlength: [300, 'website cannot exceed 300 characters'] },
    careersUrl: { type: String, trim: true, maxlength: [300, 'careersUrl cannot exceed 300 characters'] },
    headquarters: { type: String, trim: true, maxlength: [200, 'headquarters cannot exceed 200 characters'] },
    linkedinUrl: { type: String, trim: true, maxlength: [300, 'linkedinUrl cannot exceed 300 characters'] },
    hiringEmail: { type: String, trim: true, lowercase: true, maxlength: [254, 'hiringEmail cannot exceed 254 characters'] },
    hiringPhone: { type: String, trim: true, maxlength: [30, 'hiringPhone cannot exceed 30 characters'] },
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
    // No default — the creator must intentionally choose institute/company.
    type: {
      type: String,
      enum: {
        values: Object.values(OrganizationType),
        message: '{VALUE} is not a valid organization type',
      },
      required: [true, 'Organization type is required'],
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
    instituteProfile: {
      type: instituteProfileSchema,
    },
    companyProfile: {
      type: companyProfileSchema,
    },
  },
  {
    timestamps: true,
    collection: 'organizations',
  }
);

// Only the profile matching `type` may be populated — fails validation
// clearly rather than silently dropping the mismatched profile.
organizationSchema.pre('validate', function (next) {
  if (this.type === OrganizationType.INSTITUTE && this.companyProfile) {
    return next(new Error('companyProfile must not be set when organization type is "institute"'));
  }
  if (this.type === OrganizationType.COMPANY && this.instituteProfile) {
    return next(new Error('instituteProfile must not be set when organization type is "company"'));
  }
  next();
});

organizationSchema.index({ ownerUserId: 1, createdAt: -1 });
organizationSchema.index({ status: 1, createdAt: -1 });
organizationSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model<IOrganization>('Organization', organizationSchema);
