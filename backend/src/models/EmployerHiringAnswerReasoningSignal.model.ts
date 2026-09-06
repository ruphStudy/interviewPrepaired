import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Structured, explainable OBSERVABLE-reasoning signals for one hiring-
 * assessment answer (26A) — derived by AI from ONLY the candidate-facing
 * question, the candidate's own answer text, the completed 21D evaluation,
 * and the relevant 20B rubric expectations. This NEVER exposes chain-of-
 * thought, never infers hidden mental processes, intelligence, personality,
 * psychological state, or protected traits — every `evidenceSummary`
 * describes only visible answer content. `overallReasoningEvidence` means
 * "how much observable reasoning evidence THIS answer contains", never a
 * global candidate ability/IQ measure. Read-only intelligence layer: never
 * mutates the answer, its 21D evaluation, 21E aggregate, 22A evidence
 * matrix, or 22E finalization.
 *
 * There is no separate persisted "answer evaluation" document to reference
 * (the 21D evaluation is an embedded, `_id`-less subdocument of
 * `Interview.questions[questionIndex].evaluation`) — so `{interviewId,
 * questionIndex}` (the SAME identifier `Interview.evaluateQuestion` already
 * uses) is the sole, sufficient link back to it; no synthetic id is
 * fabricated for it.
 */
export type EmployerHiringAnswerReasoningStatus = 'processing' | 'completed' | 'failed';

export type EmployerHiringReasoningSignalType =
  | 'problem_decomposition'
  | 'tradeoff_awareness'
  | 'assumption_awareness'
  | 'evidence_usage'
  | 'causal_reasoning'
  | 'alternative_consideration'
  | 'decision_clarity';

export type EmployerHiringReasoningSignalLevel = 'strong' | 'present' | 'limited' | 'not_observed';

export type EmployerHiringOverallReasoningEvidence = 'strong' | 'sufficient' | 'limited' | 'insufficient';

export interface IReasoningSignal {
  type: EmployerHiringReasoningSignalType;
  level: EmployerHiringReasoningSignalLevel;
  evidenceSummary: string;
}

/** A safe subset of the AI Gateway's normalized usage metadata, plus cost computed via the existing shared pricing config — same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerHiringAnswerAIUsage {
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

export interface IEmployerHiringAnswerReasoningSignal extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  questionIndex: number;
  rubricId: Types.ObjectId;
  status: EmployerHiringAnswerReasoningStatus;
  signals?: IReasoningSignal[];
  overallReasoningEvidence?: EmployerHiringOverallReasoningEvidence;
  limitations: string[];
  aiUsage?: IEmployerHiringAnswerAIUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const reasoningSignalSchema = new Schema<IReasoningSignal>(
  {
    type: {
      type: String,
      enum: {
        values: [
          'problem_decomposition',
          'tradeoff_awareness',
          'assumption_awareness',
          'evidence_usage',
          'causal_reasoning',
          'alternative_consideration',
          'decision_clarity',
        ],
        message: '{VALUE} is not a valid reasoning signal type',
      },
      required: true,
    },
    level: {
      type: String,
      enum: { values: ['strong', 'present', 'limited', 'not_observed'], message: '{VALUE} is not a valid signal level' },
      required: true,
    },
    evidenceSummary: { type: String, required: true, trim: true, maxlength: [300, 'evidenceSummary cannot exceed 300 characters'] },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerHiringAnswerAIUsage>(
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

const employerHiringAnswerReasoningSignalSchema = new Schema<IEmployerHiringAnswerReasoningSignal>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    signals: { type: [reasoningSignalSchema], default: undefined },
    overallReasoningEvidence: {
      type: String,
      enum: { values: ['strong', 'sufficient', 'limited', 'insufficient'], message: '{VALUE} is not a valid overall reasoning evidence label' },
    },
    limitations: { type: [String], default: [] },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_answer_reasoning_signals',
  }
);

// Exactly one row per question per interview, ever. This unique index
// doubles as the concurrency claim — the first create() for a given
// {organizationId, interviewId, questionIndex} wins; every concurrent
// duplicate throws E11000, which EmployerHiringAnswerReasoningService uses
// to detect an in-flight/existing row rather than starting a second AI call.
employerHiringAnswerReasoningSignalSchema.index({ organizationId: 1, interviewId: 1, questionIndex: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringAnswerReasoningSignal>(
  'EmployerHiringAnswerReasoningSignal',
  employerHiringAnswerReasoningSignalSchema
);
