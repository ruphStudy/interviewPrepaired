import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) aggregate report over the coding assessment
 * attached to ONE hiring interview (30E) — built purely from 30A question
 * metadata, 30B session/submissions, and COMPLETED 30C executions / 30D
 * evaluations. Never a hiring recommendation, candidate ranking, or
 * personality/intelligence score, and never a numeric overall coding
 * score. Partial state (unattempted/unexecuted/unevaluated questions) is a
 * valid, clearly-shown report state — never auto-runs/auto-evaluates
 * anything to fill gaps.
 */
export type EmployerCodingQuestionExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'executor_unavailable';
export type EmployerCodingQuestionEvaluationStatus = 'processing' | 'completed' | 'failed';
export type CodingReportCorrectnessAssessment = 'strong' | 'sufficient' | 'partial' | 'insufficient';
export type CodingReportQualityLevel = 'strong' | 'sufficient' | 'limited' | 'insufficient';
export type CodingReportEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';

export interface ICodingReportExecutionSummary {
  assignedQuestionCount: number;
  attemptedQuestionCount: number;
  executedQuestionCount: number;
  evaluatedQuestionCount: number;
  totalSubmissionCount: number;
  totalExecutionCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  passPercent: number;
}

export interface ICodingReportQuestion {
  codingQuestionId: Types.ObjectId;
  title: string;
  difficulty: string;
  submittedAttemptCount: number;
  latestSubmissionId?: Types.ObjectId;
  executionStatus?: EmployerCodingQuestionExecutionStatus;
  passPercent?: number;
  evaluationStatus?: EmployerCodingQuestionEvaluationStatus;
  correctnessAssessment?: CodingReportCorrectnessAssessment;
}

export interface ICodingReportQualityLevelCounts {
  strong: number;
  sufficient: number;
  limited: number;
  insufficient: number;
}

export interface ICodingReportCodeQuality {
  readability: ICodingReportQualityLevelCounts;
  maintainability: ICodingReportQualityLevelCounts;
  structure: ICodingReportQualityLevelCounts;
}

export interface ICodingReportReasoning {
  algorithmChoice: ICodingReportQualityLevelCounts;
  complexityAwareness: ICodingReportQualityLevelCounts;
  edgeCaseHandling: ICodingReportQualityLevelCounts;
}

export interface ICodingReportCompetencyEvidenceStates {
  strong: number;
  sufficient: number;
  partial: number;
  insufficient: number;
  notObserved: number;
}

export interface ICodingReportCompetencyEvidence {
  competencyName: string;
  evaluatedSubmissionCount: number;
  states: ICodingReportCompetencyEvidenceStates;
  overallEvidenceState: CodingReportEvidenceState;
  evidence: string[];
}

export interface ICodingReportSummary {
  strengths: string[];
  concerns: string[];
  evidenceGaps: string[];
}

export interface IEmployerCodingAssessmentReport extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  codingSessionId: Types.ObjectId;
  reportVersion: string;
  generatedAt: Date;
  execution: ICodingReportExecutionSummary;
  questions: ICodingReportQuestion[];
  codeQuality: ICodingReportCodeQuality;
  reasoning: ICodingReportReasoning;
  competencyEvidence: ICodingReportCompetencyEvidence[];
  summary: ICodingReportSummary;
  createdAt: Date;
  updatedAt: Date;
}

const executionSummarySchema = new Schema<ICodingReportExecutionSummary>(
  {
    assignedQuestionCount: { type: Number, required: true, min: 0 },
    attemptedQuestionCount: { type: Number, required: true, min: 0 },
    executedQuestionCount: { type: Number, required: true, min: 0 },
    evaluatedQuestionCount: { type: Number, required: true, min: 0 },
    totalSubmissionCount: { type: Number, required: true, min: 0 },
    totalExecutionCount: { type: Number, required: true, min: 0 },
    totalTests: { type: Number, required: true, min: 0 },
    passedTests: { type: Number, required: true, min: 0 },
    failedTests: { type: Number, required: true, min: 0 },
    passPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const reportQuestionSchema = new Schema<ICodingReportQuestion>(
  {
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion', required: true },
    title: { type: String, required: true },
    difficulty: { type: String, required: true },
    submittedAttemptCount: { type: Number, required: true, min: 0 },
    latestSubmissionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingSubmission' },
    executionStatus: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'timeout', 'executor_unavailable'],
    },
    passPercent: { type: Number, min: 0, max: 100 },
    evaluationStatus: { type: String, enum: ['processing', 'completed', 'failed'] },
    correctnessAssessment: { type: String, enum: ['strong', 'sufficient', 'partial', 'insufficient'] },
  },
  { _id: false }
);

const qualityLevelCountsSchema = new Schema<ICodingReportQualityLevelCounts>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    sufficient: { type: Number, required: true, min: 0, default: 0 },
    limited: { type: Number, required: true, min: 0, default: 0 },
    insufficient: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const codeQualitySchema = new Schema<ICodingReportCodeQuality>(
  {
    readability: { type: qualityLevelCountsSchema, required: true },
    maintainability: { type: qualityLevelCountsSchema, required: true },
    structure: { type: qualityLevelCountsSchema, required: true },
  },
  { _id: false }
);

const reasoningSchema = new Schema<ICodingReportReasoning>(
  {
    algorithmChoice: { type: qualityLevelCountsSchema, required: true },
    complexityAwareness: { type: qualityLevelCountsSchema, required: true },
    edgeCaseHandling: { type: qualityLevelCountsSchema, required: true },
  },
  { _id: false }
);

const competencyEvidenceStatesSchema = new Schema<ICodingReportCompetencyEvidenceStates>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    sufficient: { type: Number, required: true, min: 0, default: 0 },
    partial: { type: Number, required: true, min: 0, default: 0 },
    insufficient: { type: Number, required: true, min: 0, default: 0 },
    notObserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const competencyEvidenceSchema = new Schema<ICodingReportCompetencyEvidence>(
  {
    competencyName: { type: String, required: true, trim: true, maxlength: [200, 'competencyName cannot exceed 200 characters'] },
    evaluatedSubmissionCount: { type: Number, required: true, min: 0 },
    states: { type: competencyEvidenceStatesSchema, required: true },
    overallEvidenceState: {
      type: String,
      enum: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'],
      required: true,
    },
    evidence: { type: [String], default: [] },
  },
  { _id: false }
);

const reportSummarySchema = new Schema<ICodingReportSummary>(
  {
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    evidenceGaps: { type: [String], default: [] },
  },
  { _id: false }
);

const employerCodingAssessmentReportSchema = new Schema<IEmployerCodingAssessmentReport>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    codingSessionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingAssessmentSession', required: true },
    reportVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    execution: { type: executionSummarySchema, required: true },
    questions: { type: [reportQuestionSchema], default: [] },
    codeQuality: { type: codeQualitySchema, required: true },
    reasoning: { type: reasoningSchema, required: true },
    competencyEvidence: { type: [competencyEvidenceSchema], default: [] },
    summary: { type: reportSummarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_coding_assessment_reports',
  }
);

employerCodingAssessmentReportSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerCodingAssessmentReport>('EmployerCodingAssessmentReport', employerCodingAssessmentReportSchema);
