import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobApplicationStatus, EmployerJobApplicationSource } from '../constants/employerJobApplication';

/**
 * Links one company candidate to one company job (18D). Always scoped to
 * exactly one `organizationId`. A candidate may apply to a job at most
 * once — the unique index below is the enforcement — status HISTORY for
 * that single application is tracked via `status` transitions on this same
 * row, never by creating additional application rows. `resumeSourceId`/
 * `resumeAnalysisId` are an optional, deterministic snapshot of which
 * resume version (and its completed analysis, if any) was current at the
 * moment of application — never required, never a copy of the resume
 * content itself. No screening/ranking, no AI, no interview scheduling
 * happens here — that's Sprint 19/20.
 */
export interface IEmployerJobApplication extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  status: EmployerJobApplicationStatus;
  source: EmployerJobApplicationSource;
  appliedAt: Date;
  resumeSourceId?: Types.ObjectId;
  resumeAnalysisId?: Types.ObjectId;
  notes?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerJobApplicationSchema = new Schema<IEmployerJobApplication>(
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
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerJobApplicationStatus), message: '{VALUE} is not a valid application status' },
      default: EmployerJobApplicationStatus.APPLIED,
      required: true,
    },
    source: {
      type: String,
      enum: { values: Object.values(EmployerJobApplicationSource), message: '{VALUE} is not a valid application source' },
      default: EmployerJobApplicationSource.MANUAL,
      required: true,
    },
    appliedAt: {
      type: Date,
      required: true,
    },
    // Deterministic snapshot of which resume version was current at the
    // moment of application — set once at creation, never updated later.
    resumeSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateResumeSource',
    },
    resumeAnalysisId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateResumeAnalysis',
    },
    notes: { type: String, trim: true, maxlength: [2000, 'notes cannot exceed 2000 characters'] },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'employer_job_applications',
  }
);

// One application per candidate per job, per organization — this same
// unique index is also relied on to reject a duplicate create with a 409,
// never a duplicate application row for status history (status is tracked
// via transitions on this one row instead).
employerJobApplicationSchema.index({ organizationId: 1, jobId: 1, candidateId: 1 }, { unique: true });
employerJobApplicationSchema.index({ organizationId: 1, jobId: 1, status: 1, createdAt: -1 });
employerJobApplicationSchema.index({ organizationId: 1, candidateId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobApplication>('EmployerJobApplication', employerJobApplicationSchema);
