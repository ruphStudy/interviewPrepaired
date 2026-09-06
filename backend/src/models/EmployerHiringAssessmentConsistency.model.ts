import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Structured, explainable ANSWER-TO-ANSWER consistency analysis across all
 * questions of one hiring-assessment interview (26C) — derived by AI from
 * ONLY the candidate-facing questions, the candidate's own answer text, the
 * completed 21D evaluations, and (optionally) already-completed 26A/26B
 * structured summaries. This is explicitly NOT deception/lie detection and
 * never infers honesty, intent, personality, memory ability, intelligence,
 * or protected traits — a "contradiction" finding requires genuinely
 * conflicting statements; different examples, different scope, or added
 * detail are never automatically contradictions. `overallConsistency`
 * describes the consistency of THIS assessment's observable responses
 * only, never converted into an honesty score. Read-only intelligence
 * layer: never mutates answers, evaluations, the 21E aggregate, or the 22A
 * evidence matrix.
 */
export type EmployerHiringConsistencyStatus = 'processing' | 'completed' | 'failed';

export type EmployerHiringConsistencyFindingType =
  | 'direct_contradiction'
  | 'factual_inconsistency'
  | 'scope_change'
  | 'timeline_inconsistency'
  | 'terminology_inconsistency'
  | 'unsupported_change';

export type EmployerHiringConsistencyFindingSeverity = 'high' | 'medium' | 'low';

export type EmployerHiringOverallConsistency = 'consistent' | 'mostly_consistent' | 'mixed' | 'inconsistent' | 'insufficient_evidence';

export interface IConsistencyFindingEvidence {
  questionIndex: number;
  answerExcerptOrSummary: string;
}

export interface IConsistencyFinding {
  type: EmployerHiringConsistencyFindingType;
  severity: EmployerHiringConsistencyFindingSeverity;
  questionIndexes: number[];
  summary: string;
  evidence: IConsistencyFindingEvidence[];
}

/** Same shape/convention as 26A/26B's AI usage subdocument. */
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

export interface IEmployerHiringAssessmentConsistency extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  status: EmployerHiringConsistencyStatus;
  findings?: IConsistencyFinding[];
  overallConsistency?: EmployerHiringOverallConsistency;
  consistentThemes: string[];
  limitations: string[];
  aiUsage?: IEmployerHiringAnswerAIUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const consistencyFindingEvidenceSchema = new Schema<IConsistencyFindingEvidence>(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    answerExcerptOrSummary: { type: String, required: true, trim: true, maxlength: [350, 'answerExcerptOrSummary cannot exceed 350 characters'] },
  },
  { _id: false }
);

const consistencyFindingSchema = new Schema<IConsistencyFinding>(
  {
    type: {
      type: String,
      enum: {
        values: [
          'direct_contradiction',
          'factual_inconsistency',
          'scope_change',
          'timeline_inconsistency',
          'terminology_inconsistency',
          'unsupported_change',
        ],
        message: '{VALUE} is not a valid consistency finding type',
      },
      required: true,
    },
    severity: {
      type: String,
      enum: { values: ['high', 'medium', 'low'], message: '{VALUE} is not a valid severity' },
      required: true,
    },
    questionIndexes: { type: [Number], required: true, default: [] },
    summary: { type: String, required: true, trim: true, maxlength: [350, 'summary cannot exceed 350 characters'] },
    evidence: { type: [consistencyFindingEvidenceSchema], default: [] },
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

const employerHiringAssessmentConsistencySchema = new Schema<IEmployerHiringAssessmentConsistency>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    findings: { type: [consistencyFindingSchema], default: undefined },
    overallConsistency: {
      type: String,
      enum: {
        values: ['consistent', 'mostly_consistent', 'mixed', 'inconsistent', 'insufficient_evidence'],
        message: '{VALUE} is not a valid overall consistency label',
      },
    },
    consistentThemes: { type: [String], default: [] },
    limitations: { type: [String], default: [] },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_assessment_consistency',
  }
);

// Exactly one consistency row per interview, ever. This unique index
// doubles as the concurrency claim — the first create() for a given
// {organizationId, interviewId} wins; every concurrent duplicate throws
// E11000, which EmployerHiringAssessmentConsistencyService uses to detect
// an in-flight/existing row rather than starting a second AI call.
employerHiringAssessmentConsistencySchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringAssessmentConsistency>(
  'EmployerHiringAssessmentConsistency',
  employerHiringAssessmentConsistencySchema
);
