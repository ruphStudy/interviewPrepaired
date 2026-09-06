import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A structured multi-step QUESTION PLAN for one READY 28A scenario (28B) —
 * generated once via the AI Gateway from ONLY the scenario's own
 * title/description/context/objectives/target-competencies plus the
 * relevant 20B rubric expectations. Never sends candidate identity/resume/
 * screening/answers/notes/decisions/communications/other candidates. This
 * is a QUESTION PLAN only — no candidate execution, no response
 * evaluation, no multi-step runtime simulation (that is 28C/28D).
 * Expected evidence is employer-only, never exposed publicly.
 */
export type EmployerInterviewScenarioQuestionSetStatus = 'processing' | 'completed' | 'failed';
export type EmployerScenarioQuestionType = 'opening' | 'probe' | 'complication' | 'decision' | 'reflection';
export type EmployerScenarioQuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface IScenarioQuestion {
  sequence: number;
  type: EmployerScenarioQuestionType;
  questionText: string;
  targetCompetencies: string[];
  evidenceExpected: string[];
  difficulty: EmployerScenarioQuestionDifficulty;
  scenarioUpdate?: string;
}

export interface IScenarioQuestionSetSummary {
  questionCount: number;
  competencyCount: number;
}

/** Same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerScenarioQuestionSetAIUsage {
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

export interface IEmployerInterviewScenarioQuestionSet extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  rubricId: Types.ObjectId;
  status: EmployerInterviewScenarioQuestionSetStatus;
  generationVersion: string;
  questions?: IScenarioQuestion[];
  summary?: IScenarioQuestionSetSummary;
  aiUsage?: IEmployerScenarioQuestionSetAIUsage;
  generatedAt?: Date;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scenarioQuestionSchema = new Schema<IScenarioQuestion>(
  {
    sequence: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      enum: {
        values: ['opening', 'probe', 'complication', 'decision', 'reflection'],
        message: '{VALUE} is not a valid scenario question type',
      },
      required: true,
    },
    questionText: { type: String, required: true, trim: true, maxlength: [1000, 'questionText cannot exceed 1000 characters'] },
    targetCompetencies: { type: [String], default: [] },
    evidenceExpected: { type: [String], default: [] },
    difficulty: {
      type: String,
      enum: { values: ['easy', 'medium', 'hard'], message: '{VALUE} is not a valid difficulty' },
      required: true,
    },
    scenarioUpdate: { type: String, trim: true, maxlength: [500, 'scenarioUpdate cannot exceed 500 characters'] },
  },
  { _id: false }
);

const summarySchema = new Schema<IScenarioQuestionSetSummary>(
  {
    questionCount: { type: Number, required: true, min: 0 },
    competencyCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerScenarioQuestionSetAIUsage>(
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

const employerInterviewScenarioQuestionSetSchema = new Schema<IEmployerInterviewScenarioQuestionSet>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenario', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    generationVersion: { type: String, required: true },
    questions: { type: [scenarioQuestionSchema], default: undefined },
    summary: { type: summarySchema },
    aiUsage: { type: aiUsageSchema },
    generatedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_interview_scenario_question_sets',
  }
);

// Exactly one question set per scenario, ever — doubles as the
// concurrency claim (first create() wins; E11000 signals an in-flight/
// existing set).
employerInterviewScenarioQuestionSetSchema.index({ organizationId: 1, scenarioId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewScenarioQuestionSet>(
  'EmployerInterviewScenarioQuestionSet',
  employerInterviewScenarioQuestionSetSchema
);
