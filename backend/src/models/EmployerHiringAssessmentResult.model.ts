import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A deterministic (no AI), immutable aggregate of a hiring-assessment
 * Interview's 21D question-level evaluations against its exact 20B rubric
 * (21E). No hiring recommendation, no narrative report — arithmetic
 * aggregation only. Uniqueness is keyed on `interviewId` — exactly one
 * result per hiring session, ever; a new session (new invitation/
 * blueprint/rubric) always gets its own separate result row. No update/
 * delete endpoint exists for this model at all.
 */
export interface IHiringAssessmentCompetencyResult {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number; // 1-5, arithmetic mean of contributing question evaluations
  questionCount: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface IHiringAssessmentResult {
  overallScore: number; // 0-100
  averageRubricScore: number; // 1-5
  assessedWeight: number; // sum of jdWeight across assessed competencies
  competencyCoveragePercent: number; // 0-100
  competencies: IHiringAssessmentCompetencyResult[];
  strengths: string[];
  concerns: string[];
  calculationVersion: string;
}

export interface IEmployerHiringAssessmentResult extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  result: IHiringAssessmentResult;
  createdAt: Date;
}

const competencyResultSchema = new Schema<IHiringAssessmentCompetencyResult>(
  {
    competencyName: { type: String, required: true },
    importance: { type: String, required: true },
    jdWeight: { type: Number, required: true, min: 0, max: 100 },
    score: { type: Number, required: true, min: 1, max: 5 },
    questionCount: { type: Number, required: true, min: 1 },
    evidence: { type: [String], default: [] },
    missingEvidence: { type: [String], default: [] },
  },
  { _id: false }
);

const resultSchema = new Schema<IHiringAssessmentResult>(
  {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    averageRubricScore: { type: Number, required: true, min: 1, max: 5 },
    assessedWeight: { type: Number, required: true, min: 0 },
    competencyCoveragePercent: { type: Number, required: true, min: 0, max: 100 },
    competencies: { type: [competencyResultSchema], default: [] },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerHiringAssessmentResultSchema = new Schema<IEmployerHiringAssessmentResult>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    result: { type: resultSchema, required: true },
  },
  {
    // No updatedAt — deterministic and immutable; there is no update/delete
    // path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_hiring_assessment_results',
  }
);

// Exactly one result per hiring session, ever. This unique index is ALSO
// the sole concurrency guard: the first create() wins; a concurrent
// duplicate throws E11000, which EmployerHiringAssessmentResultService
// catches to return the already-created winner instead of erroring or
// creating a second row.
employerHiringAssessmentResultSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });
employerHiringAssessmentResultSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringAssessmentResult>(
  'EmployerHiringAssessmentResult',
  employerHiringAssessmentResultSchema
);
