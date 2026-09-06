import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) assessment-level aggregate over already-completed
 * 26A (reasoning evidence), 26B (confidence/uncertainty), 26C (answer
 * consistency), and 26D (claim evidence alignment) artifacts (26E) —
 * mutable, upserted in place on every rebuild, same convention as 25A/25B.
 * Purely counts/copies existing structured values; never a numeric
 * reasoning/confidence/honesty score, never an average of signal levels,
 * never a hiring recommendation or candidate ranking. 26A-26D artifacts
 * may be partially available — this NEVER auto-generates them.
 */
export interface ISignalLevelCounts {
  strong: number;
  present: number;
  limited: number;
  notObserved: number;
}

export interface IReasoningAggregate {
  analyzedAnswerCount: number;
  strongAnswerCount: number;
  sufficientAnswerCount: number;
  limitedAnswerCount: number;
  insufficientAnswerCount: number;
  signalCounts: {
    problem_decomposition: ISignalLevelCounts;
    tradeoff_awareness: ISignalLevelCounts;
    assumption_awareness: ISignalLevelCounts;
    evidence_usage: ISignalLevelCounts;
    causal_reasoning: ISignalLevelCounts;
    alternative_consideration: ISignalLevelCounts;
    decision_clarity: ISignalLevelCounts;
  };
}

export interface IExpressionConfidenceCounts {
  high: number;
  moderate: number;
  low: number;
  mixed: number;
}

export interface IUncertaintyAwarenessCounts {
  strong: number;
  present: number;
  limited: number;
  notObserved: number;
}

export interface ICalibrationCounts {
  wellCalibrated: number;
  possiblyOverconfident: number;
  possiblyUnderconfident: number;
  insufficientEvidence: number;
}

export interface IConfidenceAggregate {
  analyzedAnswerCount: number;
  expressionConfidenceCounts: IExpressionConfidenceCounts;
  uncertaintyAwarenessCounts: IUncertaintyAwarenessCounts;
  calibrationCounts: ICalibrationCounts;
}

export interface IConsistencyAggregate {
  available: boolean;
  overallConsistency?: string;
  findingCount: number;
  highSeverityFindingCount: number;
  mediumSeverityFindingCount: number;
  lowSeverityFindingCount: number;
}

export interface IClaimAlignmentAggregate {
  available: boolean;
  totalClaims: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  conflicting: number;
  unverifiable: number;
}

export interface ICoverageAggregate {
  totalAnsweredQuestions: number;
  reasoningAnalyzedQuestions: number;
  confidenceAnalyzedQuestions: number;
  reasoningCoveragePercent: number;
  confidenceCoveragePercent: number;
  consistencyAvailable: boolean;
  claimVerificationAvailable: boolean;
}

export interface IEmployerHiringReasoningConfidenceAggregate extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  reasoning: IReasoningAggregate;
  confidence: IConfidenceAggregate;
  consistency: IConsistencyAggregate;
  claimAlignment: IClaimAlignmentAggregate;
  coverage: ICoverageAggregate;
  createdAt: Date;
  updatedAt: Date;
}

const signalLevelCountsSchema = new Schema<ISignalLevelCounts>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    present: { type: Number, required: true, min: 0, default: 0 },
    limited: { type: Number, required: true, min: 0, default: 0 },
    notObserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const reasoningAggregateSchema = new Schema<IReasoningAggregate>(
  {
    analyzedAnswerCount: { type: Number, required: true, min: 0 },
    strongAnswerCount: { type: Number, required: true, min: 0 },
    sufficientAnswerCount: { type: Number, required: true, min: 0 },
    limitedAnswerCount: { type: Number, required: true, min: 0 },
    insufficientAnswerCount: { type: Number, required: true, min: 0 },
    signalCounts: {
      type: {
        problem_decomposition: { type: signalLevelCountsSchema, required: true },
        tradeoff_awareness: { type: signalLevelCountsSchema, required: true },
        assumption_awareness: { type: signalLevelCountsSchema, required: true },
        evidence_usage: { type: signalLevelCountsSchema, required: true },
        causal_reasoning: { type: signalLevelCountsSchema, required: true },
        alternative_consideration: { type: signalLevelCountsSchema, required: true },
        decision_clarity: { type: signalLevelCountsSchema, required: true },
      },
      required: true,
    },
  },
  { _id: false }
);

const confidenceAggregateSchema = new Schema<IConfidenceAggregate>(
  {
    analyzedAnswerCount: { type: Number, required: true, min: 0 },
    expressionConfidenceCounts: {
      type: {
        high: { type: Number, required: true, min: 0, default: 0 },
        moderate: { type: Number, required: true, min: 0, default: 0 },
        low: { type: Number, required: true, min: 0, default: 0 },
        mixed: { type: Number, required: true, min: 0, default: 0 },
      },
      required: true,
    },
    uncertaintyAwarenessCounts: {
      type: {
        strong: { type: Number, required: true, min: 0, default: 0 },
        present: { type: Number, required: true, min: 0, default: 0 },
        limited: { type: Number, required: true, min: 0, default: 0 },
        notObserved: { type: Number, required: true, min: 0, default: 0 },
      },
      required: true,
    },
    calibrationCounts: {
      type: {
        wellCalibrated: { type: Number, required: true, min: 0, default: 0 },
        possiblyOverconfident: { type: Number, required: true, min: 0, default: 0 },
        possiblyUnderconfident: { type: Number, required: true, min: 0, default: 0 },
        insufficientEvidence: { type: Number, required: true, min: 0, default: 0 },
      },
      required: true,
    },
  },
  { _id: false }
);

const consistencyAggregateSchema = new Schema<IConsistencyAggregate>(
  {
    available: { type: Boolean, required: true },
    overallConsistency: { type: String },
    findingCount: { type: Number, required: true, min: 0 },
    highSeverityFindingCount: { type: Number, required: true, min: 0 },
    mediumSeverityFindingCount: { type: Number, required: true, min: 0 },
    lowSeverityFindingCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const claimAlignmentAggregateSchema = new Schema<IClaimAlignmentAggregate>(
  {
    available: { type: Boolean, required: true },
    totalClaims: { type: Number, required: true, min: 0 },
    supported: { type: Number, required: true, min: 0 },
    partiallySupported: { type: Number, required: true, min: 0 },
    unsupported: { type: Number, required: true, min: 0 },
    conflicting: { type: Number, required: true, min: 0 },
    unverifiable: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const coverageAggregateSchema = new Schema<ICoverageAggregate>(
  {
    totalAnsweredQuestions: { type: Number, required: true, min: 0 },
    reasoningAnalyzedQuestions: { type: Number, required: true, min: 0 },
    confidenceAnalyzedQuestions: { type: Number, required: true, min: 0 },
    reasoningCoveragePercent: { type: Number, required: true, min: 0, max: 100 },
    confidenceCoveragePercent: { type: Number, required: true, min: 0, max: 100 },
    consistencyAvailable: { type: Boolean, required: true },
    claimVerificationAvailable: { type: Boolean, required: true },
  },
  { _id: false }
);

const employerHiringReasoningConfidenceAggregateSchema = new Schema<IEmployerHiringReasoningConfidenceAggregate>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    reasoning: { type: reasoningAggregateSchema, required: true },
    confidence: { type: confidenceAggregateSchema, required: true },
    consistency: { type: consistencyAggregateSchema, required: true },
    claimAlignment: { type: claimAlignmentAggregateSchema, required: true },
    coverage: { type: coverageAggregateSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_reasoning_confidence_aggregate',
  }
);

// Exactly one row per interview, ever — replaced/reconciled in place on
// every rebuild (same upsert-in-place convention as 25A/25B).
employerHiringReasoningConfidenceAggregateSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringReasoningConfidenceAggregate>(
  'EmployerHiringReasoningConfidenceAggregate',
  employerHiringReasoningConfidenceAggregateSchema
);
