import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateSource, EmployerCandidateStatus } from '../constants/employerCandidate';

/**
 * A candidate profile owned by a COMPANY organization (18A). Always scoped
 * to exactly one `organizationId`. Deliberately minimal: no resume upload/
 * parsing (18B/18C), no job/application linkage (18D), no screening/
 * ranking, no AI — this is manually-entered candidate metadata only. Email
 * is the primary candidate identity WITHIN one organization (see the unique
 * index below) — the same email may exist independently in a different
 * organization; candidates are never globally merged across companies.
 */
export interface IEmployerCandidate extends Document {
  organizationId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  location?: string;
  totalExperienceYears?: number;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  noticePeriodDays?: number;
  currentSalary?: number;
  expectedSalary?: number;
  salaryCurrency?: string;
  source: EmployerCandidateSource;
  status: EmployerCandidateStatus;
  notes?: string;
  tags?: string[];
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerCandidateSchema = new Schema<IEmployerCandidate>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    firstName: {
      type: String,
      required: [true, 'firstName is required'],
      trim: true,
      maxlength: [100, 'firstName cannot exceed 100 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'lastName is required'],
      trim: true,
      maxlength: [100, 'lastName cannot exceed 100 characters'],
    },
    // Not globally unique — only unique within an organization (see the
    // compound index below). Same email may exist in a different organization.
    email: {
      type: String,
      required: [true, 'email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'email cannot exceed 254 characters'],
    },
    phone: { type: String, trim: true, maxlength: [30, 'phone cannot exceed 30 characters'] },
    headline: { type: String, trim: true, maxlength: [200, 'headline cannot exceed 200 characters'] },
    currentCompany: { type: String, trim: true, maxlength: [150, 'currentCompany cannot exceed 150 characters'] },
    currentTitle: { type: String, trim: true, maxlength: [150, 'currentTitle cannot exceed 150 characters'] },
    location: { type: String, trim: true, maxlength: [200, 'location cannot exceed 200 characters'] },
    totalExperienceYears: { type: Number, min: [0, 'totalExperienceYears cannot be negative'] },
    linkedinUrl: { type: String, trim: true, maxlength: [300, 'linkedinUrl cannot exceed 300 characters'] },
    portfolioUrl: { type: String, trim: true, maxlength: [300, 'portfolioUrl cannot exceed 300 characters'] },
    githubUrl: { type: String, trim: true, maxlength: [300, 'githubUrl cannot exceed 300 characters'] },
    noticePeriodDays: {
      type: Number,
      min: [0, 'noticePeriodDays cannot be negative'],
      validate: { validator: (value: number) => Number.isInteger(value), message: 'noticePeriodDays must be a whole number' },
    },
    currentSalary: { type: Number, min: [0, 'currentSalary cannot be negative'] },
    expectedSalary: { type: Number, min: [0, 'expectedSalary cannot be negative'] },
    salaryCurrency: { type: String, trim: true, uppercase: true, maxlength: [10, 'salaryCurrency cannot exceed 10 characters'] },
    source: {
      type: String,
      enum: { values: Object.values(EmployerCandidateSource), message: '{VALUE} is not a valid candidate source' },
      default: EmployerCandidateSource.MANUAL,
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerCandidateStatus), message: '{VALUE} is not a valid candidate status' },
      default: EmployerCandidateStatus.ACTIVE,
      required: true,
    },
    notes: { type: String, trim: true, maxlength: [2000, 'notes cannot exceed 2000 characters'] },
    tags: { type: [String], default: undefined },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'employer_candidates',
  }
);

employerCandidateSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
// Email is the primary candidate identity WITHIN one organization — unique
// per organization, never globally. A duplicate create in the same
// organization is rejected (409, mapped from this index's E11000).
employerCandidateSchema.index({ organizationId: 1, email: 1 }, { unique: true });

export default mongoose.model<IEmployerCandidate>('EmployerCandidate', employerCandidateSchema);
