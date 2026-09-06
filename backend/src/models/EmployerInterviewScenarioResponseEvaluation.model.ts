import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Evidence-based evaluation of ONE candidate response to ONE 28B scenario
 * question (28C) — hiring assessment evidence collection only. NEVER
 * coaching, never a candidate-facing score, never a hiring recommendation,
 * never infers personality/honesty/deception. Absence of evidence is
 * never treated as proof of anything false. Read-only over the scenario/
 * question-set/session; never mutates them.
 */
export type EmployerScenarioResponseEvaluationStatus = 'processing' | 'completed' | 'failed';
export type EmployerScenarioEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';
export type EmployerScenarioAssessmentLevel = 'strong' | 'sufficient' | 'limited' | 'insufficient';

export interface IScenarioCompetencyEvidence {
  competencyName: string;
  evidenceState: EmployerScenarioEvidenceState;
  evidence: string[];
  missingEvidence: string[];
}

export interface IScenarioResponseAssessment {
  relevance: EmployerScenarioAssessmentLevel;
  reasoningQuality: EmployerScenarioAssessmentLevel;
  decisionClarity: EmployerScenarioAssessmentLevel;
  constraintAwareness: EmployerScenarioAssessmentLevel;
}

/** Same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerScenarioResponseEvaluationAIUsage {
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

export interface IEmployerInterviewScenarioResponseEvaluation extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  questionSetId: Types.ObjectId;
  questionSequence: number;
  status: EmployerScenarioResponseEvaluationStatus;
  evaluationVersion: string;
  targetedCompetencies: string[];
  competencyEvidence?: IScenarioCompetencyEvidence[];
  responseAssessment?: IScenarioResponseAssessment;
  evidenceSummary?: string;
  followUpUseful?: boolean;
  followUpReason?: string;
  aiUsage?: IEmployerScenarioResponseEvaluationAIUsage;
  evaluatedAt?: Date;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const competencyEvidenceSchema = new Schema<IScenarioCompetencyEvidence>(
  {
    competencyName: { type: String, required: true },
    evidenceState: {
      type: String,
      enum: {
        values: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'],
        message: '{VALUE} is not a valid evidence state',
      },
      required: true,
    },
    evidence: { type: [String], default: [] },
    missingEvidence: { type: [String], default: [] },
  },
  { _id: false }
);

const responseAssessmentSchema = new Schema<IScenarioResponseAssessment>(
  {
    relevance: { type: String, enum: ['strong', 'sufficient', 'limited', 'insufficient'], required: true },
    reasoningQuality: { type: String, enum: ['strong', 'sufficient', 'limited', 'insufficient'], required: true },
    decisionClarity: { type: String, enum: ['strong', 'sufficient', 'limited', 'insufficient'], required: true },
    constraintAwareness: { type: String, enum: ['strong', 'sufficient', 'limited', 'insufficient'], required: true },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerScenarioResponseEvaluationAIUsage>(
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

const employerInterviewScenarioResponseEvaluationSchema = new Schema<IEmployerInterviewScenarioResponseEvaluation>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenario', required: true },
    questionSetId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenarioQuestionSet', required: true },
    questionSequence: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    evaluationVersion: { type: String, required: true },
    targetedCompetencies: { type: [String], default: [] },
    competencyEvidence: { type: [competencyEvidenceSchema], default: undefined },
    responseAssessment: { type: responseAssessmentSchema },
    evidenceSummary: { type: String, trim: true, maxlength: [1000, 'evidenceSummary cannot exceed 1000 characters'] },
    followUpUseful: { type: Boolean },
    followUpReason: { type: String, trim: true, maxlength: [300, 'followUpReason cannot exceed 300 characters'] },
    aiUsage: { type: aiUsageSchema },
    evaluatedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_interview_scenario_response_evaluations',
  }
);

// Exactly one evaluation per scenario question step, ever — doubles as the
// concurrency claim (first create() wins; E11000 signals an in-flight/
// existing row).
employerInterviewScenarioResponseEvaluationSchema.index(
  { organizationId: 1, interviewId: 1, scenarioId: 1, questionSequence: 1 },
  { unique: true }
);

export default mongoose.model<IEmployerInterviewScenarioResponseEvaluation>(
  'EmployerInterviewScenarioResponseEvaluation',
  employerInterviewScenarioResponseEvaluationSchema
);
