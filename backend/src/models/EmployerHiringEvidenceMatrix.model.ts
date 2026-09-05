import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A deterministic (no AI), immutable evidence matrix built from a hiring
 * Interview's 21D question evaluations + its 21E assessment result (22A) —
 * what evidence supports each competency, what is missing, and which
 * competencies need follow-up. No new questions, no recommendation.
 * Uniqueness is keyed on `interviewId` — exactly one matrix per hiring
 * session, ever; a new session always gets its own separate matrix row.
 * No update/delete endpoint exists for this model at all.
 */
export type EvidenceStatus = 'strong' | 'sufficient' | 'partial' | 'insufficient';

export interface IEvidenceSourceQuestion {
  questionIndex: number;
  questionText: string;
  rubricScore: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface IEvidenceCompetency {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number;
  evidenceStatus: EvidenceStatus;
  supportingEvidence: string[];
  missingEvidence: string[];
  sourceQuestions: IEvidenceSourceQuestion[];
  requiresFollowUp: boolean;
  followUpReasons: string[];
}

export interface IEvidenceSummary {
  strongCount: number;
  sufficientCount: number;
  partialCount: number;
  insufficientCount: number;
  followUpCompetencyCount: number;
  criticalFollowUpCount: number;
}

export interface IHiringEvidenceMatrix {
  competencies: IEvidenceCompetency[];
  summary: IEvidenceSummary;
  calculationVersion: string;
}

export interface IEmployerHiringEvidenceMatrix extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  assessmentResultId: Types.ObjectId;
  matrix: IHiringEvidenceMatrix;
  createdAt: Date;
}

const sourceQuestionSchema = new Schema<IEvidenceSourceQuestion>(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    questionText: { type: String, required: true },
    rubricScore: { type: Number, required: true, min: 1, max: 5 },
    evidence: { type: [String], default: [] },
    missingEvidence: { type: [String], default: [] },
  },
  { _id: false }
);

const evidenceCompetencySchema = new Schema<IEvidenceCompetency>(
  {
    competencyName: { type: String, required: true },
    importance: { type: String, required: true },
    jdWeight: { type: Number, required: true, min: 0, max: 100 },
    score: { type: Number, required: true, min: 1, max: 5 },
    evidenceStatus: { type: String, enum: ['strong', 'sufficient', 'partial', 'insufficient'], required: true },
    supportingEvidence: { type: [String], default: [] },
    missingEvidence: { type: [String], default: [] },
    sourceQuestions: { type: [sourceQuestionSchema], default: [] },
    requiresFollowUp: { type: Boolean, required: true },
    followUpReasons: { type: [String], default: [] },
  },
  { _id: false }
);

const evidenceSummarySchema = new Schema<IEvidenceSummary>(
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

const matrixSchema = new Schema<IHiringEvidenceMatrix>(
  {
    competencies: { type: [evidenceCompetencySchema], default: [] },
    summary: { type: evidenceSummarySchema, required: true },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerHiringEvidenceMatrixSchema = new Schema<IEmployerHiringEvidenceMatrix>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    assessmentResultId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentResult', required: true },
    matrix: { type: matrixSchema, required: true },
  },
  {
    // No updatedAt — deterministic and immutable; there is no update/delete
    // path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_hiring_evidence_matrices',
  }
);

// Exactly one matrix per hiring session, ever. This unique index is ALSO
// the sole concurrency guard: the first create() wins; a concurrent
// duplicate throws E11000, which EmployerHiringEvidenceMatrixService
// catches to return the already-created winner instead of erroring or
// creating a second row.
employerHiringEvidenceMatrixSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });
employerHiringEvidenceMatrixSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringEvidenceMatrix>(
  'EmployerHiringEvidenceMatrix',
  employerHiringEvidenceMatrixSchema
);
