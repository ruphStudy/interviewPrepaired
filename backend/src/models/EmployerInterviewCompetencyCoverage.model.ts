import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) LIVE competency coverage overlay for one hiring-
 * assessment interview's 27A graph (27C) — how much assessment evidence has
 * actually been collected for each competency, recomputed directly from
 * CURRENT `Interview.questions` (including valid 27B dynamic follow-ups) so
 * it stays correct without ever rebuilding/mutating the stored 27A graph.
 * Never reads 26 reasoning/confidence artifacts, recruiter notes, or
 * decision logs. `evidenceState` is a coverage classification only — never
 * a numeric proficiency/candidate score. Mutable, upserted in place on
 * every rebuild (same convention as 27A) — no historical duplicate rows.
 */
export type EmployerInterviewCompetencyEvidenceState = 'not_started' | 'partial' | 'covered';

export interface ICompetencyCoverageEntry {
  competencyNodeId: string;
  competencyName: string;
  plannedQuestionCount: number;
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  evidenceState: EmployerInterviewCompetencyEvidenceState;
  questionIndexes: number[];
  answeredQuestionIndexes: number[];
  evaluatedQuestionIndexes: number[];
  dynamicFollowUpCount: number;
}

export interface ICompetencyCoverageDynamicEdge {
  competencyNodeId: string;
  questionIndex: number;
  sourceQuestionIndex: number;
}

export interface ICompetencyCoverageSummary {
  competencyCount: number;
  coveredCount: number;
  partialCount: number;
  notStartedCount: number;
  totalQuestionCount: number;
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  coveragePercent: number;
}

export interface IEmployerInterviewCompetencyCoverage extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  graphId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  competencies: ICompetencyCoverageEntry[];
  dynamicEdges: ICompetencyCoverageDynamicEdge[];
  summary: ICompetencyCoverageSummary;
  createdAt: Date;
  updatedAt: Date;
}

const competencyCoverageEntrySchema = new Schema<ICompetencyCoverageEntry>(
  {
    competencyNodeId: { type: String, required: true },
    competencyName: { type: String, required: true },
    plannedQuestionCount: { type: Number, required: true, min: 0 },
    answeredQuestionCount: { type: Number, required: true, min: 0 },
    evaluatedQuestionCount: { type: Number, required: true, min: 0 },
    evidenceState: {
      type: String,
      enum: { values: ['not_started', 'partial', 'covered'], message: '{VALUE} is not a valid evidence state' },
      required: true,
    },
    questionIndexes: { type: [Number], default: [] },
    answeredQuestionIndexes: { type: [Number], default: [] },
    evaluatedQuestionIndexes: { type: [Number], default: [] },
    dynamicFollowUpCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const dynamicEdgeSchema = new Schema<ICompetencyCoverageDynamicEdge>(
  {
    competencyNodeId: { type: String, required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    sourceQuestionIndex: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const summarySchema = new Schema<ICompetencyCoverageSummary>(
  {
    competencyCount: { type: Number, required: true, min: 0 },
    coveredCount: { type: Number, required: true, min: 0 },
    partialCount: { type: Number, required: true, min: 0 },
    notStartedCount: { type: Number, required: true, min: 0 },
    totalQuestionCount: { type: Number, required: true, min: 0 },
    answeredQuestionCount: { type: Number, required: true, min: 0 },
    evaluatedQuestionCount: { type: Number, required: true, min: 0 },
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const employerInterviewCompetencyCoverageSchema = new Schema<IEmployerInterviewCompetencyCoverage>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    graphId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewGraph', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    competencies: { type: [competencyCoverageEntrySchema], default: [] },
    dynamicEdges: { type: [dynamicEdgeSchema], default: [] },
    summary: { type: summarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_competency_coverage',
  }
);

// Exactly one coverage row per interview, ever — replaced/reconciled in
// place on every rebuild (same upsert-in-place convention as 27A).
employerInterviewCompetencyCoverageSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewCompetencyCoverage>(
  'EmployerInterviewCompetencyCoverage',
  employerInterviewCompetencyCoverageSchema
);
