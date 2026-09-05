import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateResumeSourceType } from '../constants/employerCandidateResume';

/**
 * One immutable version of a candidate's resume file (18B). Every upload
 * creates a NEW version for the candidate — never overwrites a previous
 * one, and the previous file is never deleted. `version` is unique per
 * candidate (see the index below) and monotonically increasing;
 * EmployerCandidateResumeService derives "the current version" from the
 * highest version number rather than trusting `isCurrent` alone (same
 * convention as EmployerJobDescriptionSource, 17A). No AI parsing/text
 * extraction happens here or anywhere in this sprint — this is file
 * storage and versioning only.
 */
export interface IEmployerCandidateResumeSource extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  version: number;
  isCurrent: boolean;
  originalFileName: string;
  /** Relative path under the resume storage root — server-internal only, never returned by the API. */
  storedFileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  sourceType: EmployerCandidateResumeSourceType;
  uploadedByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const employerCandidateResumeSourceSchema = new Schema<IEmployerCandidateResumeSource>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
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
    originalFileName: {
      type: String,
      required: [true, 'originalFileName is required'],
      trim: true,
      maxlength: [255, 'originalFileName cannot exceed 255 characters'],
    },
    storedFileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
      maxlength: 150,
    },
    fileSize: {
      type: Number,
      required: true,
      min: [1, 'fileSize must be greater than 0'],
    },
    fileExtension: {
      type: String,
      required: true,
      maxlength: 10,
    },
    sourceType: {
      type: String,
      enum: { values: Object.values(EmployerCandidateResumeSourceType), message: '{VALUE} is not a valid resume source type' },
      default: EmployerCandidateResumeSourceType.UPLOAD,
      required: true,
    },
    uploadedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    // No updatedAt — a resume version is immutable/append-only once created;
    // only `isCurrent` ever toggles, via a direct updateMany from
    // EmployerCandidateResumeService, never by resaving this document.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_resume_sources',
  }
);

// The actual concurrency guard for version generation — a duplicate-version
// race is caught as an E11000 error and retried by the service, never
// silently allowed to create two rows with the same version.
employerCandidateResumeSourceSchema.index({ organizationId: 1, candidateId: 1, version: 1 }, { unique: true });
employerCandidateResumeSourceSchema.index({ organizationId: 1, candidateId: 1, isCurrent: 1 });
employerCandidateResumeSourceSchema.index({ organizationId: 1, candidateId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateResumeSource>(
  'EmployerCandidateResumeSource',
  employerCandidateResumeSourceSchema
);
