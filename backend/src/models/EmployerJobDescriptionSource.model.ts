import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobDescriptionSourceType, JD_RAW_TEXT_MAX_LENGTH } from '../constants/employerJobDescription';

/**
 * One immutable version of a job's raw JD text (17A). Every save creates a
 * NEW version for the job — never overwrites a previous one. `version` is
 * unique per job (see the index below) and monotonically increasing;
 * EmployerJobDescriptionService derives "the current version" from the
 * highest version number rather than trusting `isCurrent` alone, so
 * `isCurrent` is best-effort bookkeeping for display/history highlighting,
 * not the sole source of truth. No AI parsing/skill extraction/competency
 * generation happens here or anywhere in this sprint — this is raw-text
 * intake and versioning only.
 */
export interface IEmployerJobDescriptionSource extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  rawText: string;
  sourceType: EmployerJobDescriptionSourceType;
  version: number;
  isCurrent: boolean;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const employerJobDescriptionSourceSchema = new Schema<IEmployerJobDescriptionSource>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    rawText: {
      type: String,
      required: [true, 'rawText is required'],
      trim: true,
      maxlength: [JD_RAW_TEXT_MAX_LENGTH, `rawText cannot exceed ${JD_RAW_TEXT_MAX_LENGTH} characters`],
    },
    sourceType: {
      type: String,
      enum: { values: Object.values(EmployerJobDescriptionSourceType), message: '{VALUE} is not a valid JD source type' },
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    isCurrent: {
      type: Boolean,
      required: true,
      default: true,
    },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    // No updatedAt — a JD source version is immutable/append-only once
    // created; only `isCurrent` ever toggles, via a direct updateMany from
    // EmployerJobDescriptionService, never by resaving this document.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_job_description_sources',
  }
);

// The actual concurrency guard for version generation — a duplicate-version
// race is caught as an E11000 error and retried by the service, never
// silently allowed to create two rows with the same version.
employerJobDescriptionSourceSchema.index({ organizationId: 1, jobId: 1, version: 1 }, { unique: true });
employerJobDescriptionSourceSchema.index({ organizationId: 1, jobId: 1, isCurrent: 1 });
employerJobDescriptionSourceSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobDescriptionSource>('EmployerJobDescriptionSource', employerJobDescriptionSourceSchema);
