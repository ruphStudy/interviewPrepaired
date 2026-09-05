import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One immutable record marking a hiring Interview's ENTIRE Sprint 21/22
 * assessment evidence package as finalized for downstream Sprint 23
 * comparison/pipeline work (22E) — NOT a hire/reject decision. Pins the
 * exact interview/blueprint/rubric/result/evidence-matrix/(optional
 * follow-up plan)/report used at creation time. Uniqueness is keyed on
 * `interviewId` — a later hiring session always gets its own separate
 * finalization; an existing one is never updated/recalculated. No
 * update/delete endpoint exists for this model at all.
 */
export interface IFinalizationEvidenceSummary {
  strongCount: number;
  sufficientCount: number;
  partialCount: number;
  insufficientCount: number;
  followUpCompetencyCount: number;
  criticalFollowUpCount: number;
}

export interface IFinalizationReviewSummary {
  eligibleReviewerCount: number;
  reviewedCount: number;
}

export interface IFinalizationSnapshot {
  overallScore: number;
  averageRubricScore: number;
  competencyCoveragePercent: number;
  assessedWeight: number;
  evidenceSummary: IFinalizationEvidenceSummary;
  followUpQuestionCount: number;
  reviewSummary: IFinalizationReviewSummary;
  calculationVersion: string;
}

export interface IEmployerHiringAssessmentFinalization extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  assessmentResultId: Types.ObjectId;
  evidenceMatrixId: Types.ObjectId;
  followUpPlanId?: Types.ObjectId;
  reportId: Types.ObjectId;
  finalizedByMembershipId: Types.ObjectId;
  finalizedAt: Date;
  snapshot: IFinalizationSnapshot;
  createdAt: Date;
}

const evidenceSummarySchema = new Schema<IFinalizationEvidenceSummary>(
  {
    strongCount: { type: Number, required: true, min: 0 },
    sufficientCount: { type: Number, required: true, min: 0 },
    partialCount: { type: Number, required: true, min: 0 },
    insufficientCount: { type: Number, required: true, min: 0 },
    followUpCompetencyCount: { type: Number, required: true, min: 0 },
    criticalFollowUpCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const reviewSummarySchema = new Schema<IFinalizationReviewSummary>(
  {
    eligibleReviewerCount: { type: Number, required: true, min: 0 },
    reviewedCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const snapshotSchema = new Schema<IFinalizationSnapshot>(
  {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    averageRubricScore: { type: Number, required: true, min: 1, max: 5 },
    competencyCoveragePercent: { type: Number, required: true, min: 0, max: 100 },
    assessedWeight: { type: Number, required: true, min: 0 },
    evidenceSummary: { type: evidenceSummarySchema, required: true },
    followUpQuestionCount: { type: Number, required: true, min: 0 },
    reviewSummary: { type: reviewSummarySchema, required: true },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerHiringAssessmentFinalizationSchema = new Schema<IEmployerHiringAssessmentFinalization>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    assessmentResultId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentResult', required: true },
    evidenceMatrixId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringEvidenceMatrix', required: true },
    followUpPlanId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringFollowUpPlan' },
    reportId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentReport', required: true },
    finalizedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    finalizedAt: { type: Date, required: true },
    snapshot: { type: snapshotSchema, required: true },
  },
  {
    // No updatedAt — immutable; there is no update/delete path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_hiring_assessment_finalizations',
  }
);

// Exactly one finalization per hiring session, ever. This unique index is
// ALSO the sole concurrency guard: the first create() wins; a concurrent
// duplicate throws E11000, which EmployerHiringAssessmentFinalizationService
// catches to return the already-created winner instead of erroring or
// creating a second row.
employerHiringAssessmentFinalizationSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });
employerHiringAssessmentFinalizationSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringAssessmentFinalization>(
  'EmployerHiringAssessmentFinalization',
  employerHiringAssessmentFinalizationSchema
);
