import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE employer-internal AI evaluation of a submitted candidate coding
 * attempt (30D) — built from the 30A problem definition, the candidate's
 * own source code, and the DETERMINISTIC 30C execution results. AI never
 * executes code and never overrides `correctness.executionPassPercent`
 * (server-computed, taken verbatim from 30C). Never a numeric overall
 * coding score, never a hiring recommendation, never a candidate
 * comparison. Never exposed through any candidate/public API.
 */
export type EmployerCodingEvaluationStatus = 'processing' | 'completed' | 'failed';
export type CorrectnessAssessment = 'strong' | 'sufficient' | 'partial' | 'insufficient';
export type QualityLevel = 'strong' | 'sufficient' | 'limited' | 'insufficient';
export type CompetencyEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';

export interface ICodingCorrectness {
  executionPassPercent: number;
  assessment: CorrectnessAssessment;
}

export interface ICodingQuality {
  readability: QualityLevel;
  maintainability: QualityLevel;
  structure: QualityLevel;
}

export interface ICodingReasoning {
  algorithmChoice: QualityLevel;
  complexityAwareness: QualityLevel;
  edgeCaseHandling: QualityLevel;
}

export interface ICodingCompetencyEvidence {
  competencyName: string;
  evidenceState: CompetencyEvidenceState;
  evidence: string[];
}

/** Same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerCodingEvaluationAIUsage {
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  pricingStatus: 'calculated' | 'unknown';
}

export interface IEmployerCodingEvaluation extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  codingSessionId: Types.ObjectId;
  codingQuestionId: Types.ObjectId;
  submissionId: Types.ObjectId;
  executionId: Types.ObjectId;
  status: EmployerCodingEvaluationStatus;
  evaluationVersion: string;
  correctness?: ICodingCorrectness;
  codeQuality?: ICodingQuality;
  reasoning?: ICodingReasoning;
  strengths: string[];
  concerns: string[];
  evidence: string[];
  competencyEvidence: ICodingCompetencyEvidence[];
  summary?: string;
  aiUsage?: IEmployerCodingEvaluationAIUsage;
  evaluatedAt?: Date;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const QUALITY_LEVELS = ['strong', 'sufficient', 'limited', 'insufficient'];

const correctnessSchema = new Schema<ICodingCorrectness>(
  {
    executionPassPercent: { type: Number, required: true, min: 0, max: 100 },
    assessment: {
      type: String,
      enum: { values: ['strong', 'sufficient', 'partial', 'insufficient'], message: '{VALUE} is not a valid assessment' },
      required: true,
    },
  },
  { _id: false }
);

const codeQualitySchema = new Schema<ICodingQuality>(
  {
    readability: { type: String, enum: QUALITY_LEVELS, required: true },
    maintainability: { type: String, enum: QUALITY_LEVELS, required: true },
    structure: { type: String, enum: QUALITY_LEVELS, required: true },
  },
  { _id: false }
);

const reasoningSchema = new Schema<ICodingReasoning>(
  {
    algorithmChoice: { type: String, enum: QUALITY_LEVELS, required: true },
    complexityAwareness: { type: String, enum: QUALITY_LEVELS, required: true },
    edgeCaseHandling: { type: String, enum: QUALITY_LEVELS, required: true },
  },
  { _id: false }
);

const competencyEvidenceSchema = new Schema<ICodingCompetencyEvidence>(
  {
    competencyName: { type: String, required: true, trim: true, maxlength: [200, 'competencyName cannot exceed 200 characters'] },
    evidenceState: {
      type: String,
      enum: {
        values: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'],
        message: '{VALUE} is not a valid evidence state',
      },
      required: true,
    },
    evidence: { type: [String], default: [] },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerCodingEvaluationAIUsage>(
  {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    cachedInputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    totalTokens: { type: Number, required: true },
    inputCostUsd: { type: Number, required: true },
    cachedInputCostUsd: { type: Number, required: true },
    outputCostUsd: { type: Number, required: true },
    totalCostUsd: { type: Number, required: true },
    pricingStatus: { type: String, enum: ['calculated', 'unknown'], required: true },
  },
  { _id: false }
);

const employerCodingEvaluationSchema = new Schema<IEmployerCodingEvaluation>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    codingSessionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingAssessmentSession', required: true },
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion', required: true },
    submissionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingSubmission', required: true },
    executionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingExecution', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    evaluationVersion: { type: String, required: true },
    correctness: { type: correctnessSchema },
    codeQuality: { type: codeQualitySchema },
    reasoning: { type: reasoningSchema },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    evidence: { type: [String], default: [] },
    competencyEvidence: { type: [competencyEvidenceSchema], default: [] },
    summary: { type: String, trim: true, maxlength: [800, 'summary cannot exceed 800 characters'] },
    aiUsage: { type: aiUsageSchema },
    evaluatedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_coding_evaluations',
  }
);

// Exactly one evaluation per submission, ever — doubles as the concurrency
// claim (first create() wins; E11000 signals an in-flight/existing
// evaluation).
employerCodingEvaluationSchema.index({ organizationId: 1, submissionId: 1 }, { unique: true });

export default mongoose.model<IEmployerCodingEvaluation>('EmployerCodingEvaluation', employerCodingEvaluationSchema);
