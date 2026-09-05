import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';

/**
 * An append-only, HUMAN-entered audit note for one job application (23E)
 * — no update/delete endpoint exists for this model at all. `decisionType`
 * is an audit LABEL only; it never represents (and never writes)
 * `EmployerJobApplication.status` — recording a decision here MUST NOT
 * change the application's lifecycle status, and moving lifecycle status
 * (23B) MUST NOT automatically create a row here. `applicationStatusAtDecision`
 * is a server-derived snapshot of the CURRENT status at the moment this
 * row is created — never client-supplied.
 */
export type EmployerJobApplicationDecisionType =
  | 'continue_process'
  | 'hold'
  | 'advance_to_offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'other';

export type EmployerJobApplicationDecisionReasonCode =
  | 'skills_match'
  | 'experience_match'
  | 'assessment_evidence'
  | 'interview_evidence'
  | 'stronger_candidate'
  | 'insufficient_skill_evidence'
  | 'insufficient_experience'
  | 'insufficient_interview_evidence'
  | 'role_requirements_changed'
  | 'candidate_withdrew'
  | 'candidate_unavailable'
  | 'compensation_alignment'
  | 'timing'
  | 'other';

export const EMPLOYER_JOB_APPLICATION_DECISION_TYPES: EmployerJobApplicationDecisionType[] = [
  'continue_process',
  'hold',
  'advance_to_offer',
  'hired',
  'rejected',
  'withdrawn',
  'other',
];

export const EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES: EmployerJobApplicationDecisionReasonCode[] = [
  'skills_match',
  'experience_match',
  'assessment_evidence',
  'interview_evidence',
  'stronger_candidate',
  'insufficient_skill_evidence',
  'insufficient_experience',
  'insufficient_interview_evidence',
  'role_requirements_changed',
  'candidate_withdrew',
  'candidate_unavailable',
  'compensation_alignment',
  'timing',
  'other',
];

export interface IEmployerJobApplicationDecision extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  decisionType: EmployerJobApplicationDecisionType;
  reasonCode: EmployerJobApplicationDecisionReasonCode;
  notes?: string;
  applicationStatusAtDecision: EmployerJobApplicationStatus;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const employerJobApplicationDecisionSchema = new Schema<IEmployerJobApplicationDecision>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    decisionType: {
      type: String,
      enum: { values: EMPLOYER_JOB_APPLICATION_DECISION_TYPES, message: '{VALUE} is not a valid decision type' },
      required: true,
    },
    reasonCode: {
      type: String,
      enum: { values: EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES, message: '{VALUE} is not a valid reason code' },
      required: true,
    },
    notes: { type: String, trim: true, maxlength: [2000, 'notes cannot exceed 2000 characters'] },
    applicationStatusAtDecision: { type: String, enum: Object.values(EmployerJobApplicationStatus), required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    // No updatedAt — append-only; rows are never modified after creation.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_job_application_decisions',
  }
);

employerJobApplicationDecisionSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });
employerJobApplicationDecisionSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobApplicationDecision>(
  'EmployerJobApplicationDecision',
  employerJobApplicationDecisionSchema
);
