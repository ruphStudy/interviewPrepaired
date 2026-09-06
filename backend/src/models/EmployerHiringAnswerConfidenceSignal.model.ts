import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Structured OBSERVABLE confidence/uncertainty-handling evidence for one
 * hiring-assessment answer (26B) — how certainly claims are PHRASED, and
 * whether limitations/assumptions/unknowns/risks are acknowledged. This is
 * explicitly NOT lie detection, NOT deception detection, NOT a truth
 * probability/honesty score, NOT personality or psychological confidence,
 * and NEVER infers protected traits. `calibration` describes only the
 * relationship between how strongly a claim is expressed and how much
 * support/uncertainty is visible IN THE ANSWER — it always stays "possibly"
 * where applicable and is never converted into a personality trait. Read-
 * only intelligence layer: never mutates the answer, its 21D evaluation,
 * 21E aggregate, 22A evidence matrix, or 22E finalization.
 *
 * There is no separate persisted "answer evaluation" document to reference
 * (see 26A's model comment) — `{interviewId, questionIndex}` is the sole
 * link back to it. `reasoningSignalId` is a REAL id (26A is its own
 * top-level collection) and is populated only when a completed 26A row
 * already exists at generation time — 26B never auto-generates 26A.
 */
export type EmployerHiringAnswerConfidenceStatus = 'processing' | 'completed' | 'failed';

export type EmployerHiringExpressionConfidence = 'high' | 'moderate' | 'low' | 'mixed';
export type EmployerHiringUncertaintyAwareness = 'strong' | 'present' | 'limited' | 'not_observed';
export type EmployerHiringCalibration = 'well_calibrated' | 'possibly_overconfident' | 'possibly_underconfident' | 'insufficient_evidence';
export type EmployerHiringClaimConfidenceExpression = 'high' | 'moderate' | 'low' | 'uncertain';
export type EmployerHiringClaimSupportLevel = 'supported_by_answer' | 'partially_supported' | 'unsupported';

export interface IConfidenceClaim {
  claimSummary: string;
  confidenceExpression: EmployerHiringClaimConfidenceExpression;
  supportLevel: EmployerHiringClaimSupportLevel;
  uncertaintyAcknowledged: boolean;
}

/** Same shape/convention as 26A's `IEmployerHiringAnswerAIUsage` — a safe subset of the AI Gateway's normalized usage metadata plus cost via the existing shared pricing config. */
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

export interface IEmployerHiringAnswerConfidenceSignal extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  questionIndex: number;
  reasoningSignalId?: Types.ObjectId;
  rubricId: Types.ObjectId;
  status: EmployerHiringAnswerConfidenceStatus;
  expressionConfidence?: EmployerHiringExpressionConfidence;
  uncertaintyAwareness?: EmployerHiringUncertaintyAwareness;
  calibration?: EmployerHiringCalibration;
  claims?: IConfidenceClaim[];
  strengths: string[];
  concerns: string[];
  limitations: string[];
  aiUsage?: IEmployerHiringAnswerAIUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const confidenceClaimSchema = new Schema<IConfidenceClaim>(
  {
    claimSummary: { type: String, required: true, trim: true, maxlength: [250, 'claimSummary cannot exceed 250 characters'] },
    confidenceExpression: {
      type: String,
      enum: { values: ['high', 'moderate', 'low', 'uncertain'], message: '{VALUE} is not a valid confidence expression' },
      required: true,
    },
    supportLevel: {
      type: String,
      enum: {
        values: ['supported_by_answer', 'partially_supported', 'unsupported'],
        message: '{VALUE} is not a valid support level',
      },
      required: true,
    },
    uncertaintyAcknowledged: { type: Boolean, required: true },
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

const employerHiringAnswerConfidenceSignalSchema = new Schema<IEmployerHiringAnswerConfidenceSignal>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    reasoningSignalId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAnswerReasoningSignal' },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    expressionConfidence: {
      type: String,
      enum: { values: ['high', 'moderate', 'low', 'mixed'], message: '{VALUE} is not a valid expression confidence' },
    },
    uncertaintyAwareness: {
      type: String,
      enum: { values: ['strong', 'present', 'limited', 'not_observed'], message: '{VALUE} is not a valid uncertainty awareness level' },
    },
    calibration: {
      type: String,
      enum: {
        values: ['well_calibrated', 'possibly_overconfident', 'possibly_underconfident', 'insufficient_evidence'],
        message: '{VALUE} is not a valid calibration label',
      },
    },
    claims: { type: [confidenceClaimSchema], default: undefined },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    limitations: { type: [String], default: [] },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_answer_confidence_signals',
  }
);

// Exactly one row per question per interview, ever — same claim/concurrency
// pattern as 26A's own unique index.
employerHiringAnswerConfidenceSignalSchema.index({ organizationId: 1, interviewId: 1, questionIndex: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringAnswerConfidenceSignal>(
  'EmployerHiringAnswerConfidenceSignal',
  employerHiringAnswerConfidenceSignalSchema
);
