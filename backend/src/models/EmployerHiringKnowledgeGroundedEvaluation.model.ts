import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE question-level, OPTIONAL knowledge-grounding evaluation (29E) — whether
 * an already-answered hiring-assessment question's answer aligns with the
 * organization knowledge actually retrieved for it (29C/29D). This is NOT a
 * truth/deception detector, NOT a candidate ranking, NOT a hiring
 * recommendation, and NEVER replaces the 21D competency/rubric evaluation —
 * the two are always separate persisted artifacts. Only ever created when
 * 29D's interview knowledge config was enabled AND relevant retrievable
 * indexed chunks existed at generation time.
 */
export type EmployerHiringKnowledgeGroundedEvaluationStatus = 'processing' | 'completed' | 'failed';
export type KnowledgeAlignmentOverall = 'aligned' | 'partially_aligned' | 'conflicting' | 'insufficient_evidence' | 'not_applicable';
export type KnowledgeClaimStatus = 'supported' | 'partially_supported' | 'conflicting' | 'not_supported' | 'unverifiable';

export interface IKnowledgeGroundedEvaluationSource {
  knowledgeBaseId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkId: Types.ObjectId;
}

export interface IKnowledgeGroundedEvaluationContext {
  enabled: boolean;
  retrievalAvailable: boolean;
  sources: IKnowledgeGroundedEvaluationSource[];
}

export interface IKnowledgeGroundedClaim {
  claim: string;
  status: KnowledgeClaimStatus;
  /** References only chunk IDs actually present in `knowledgeContext.sources` for THIS evaluation — server-validated, never trusted from AI as-is. */
  sourceChunkIds: string[];
  explanation: string;
}

export interface IKnowledgeGroundedAlignment {
  overall: KnowledgeAlignmentOverall;
  claims: IKnowledgeGroundedClaim[];
}

export interface IOrganizationKnowledgeSignals {
  demonstratesKnowledge: boolean;
  usesRelevantTerminology: boolean;
  respectsKnownConstraints: boolean;
  evidence: string[];
  gaps: string[];
}

/** Same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerHiringKnowledgeGroundedEvaluationAIUsage {
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

export interface IEmployerHiringKnowledgeGroundedEvaluation extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  questionIndex: number;
  status: EmployerHiringKnowledgeGroundedEvaluationStatus;
  evaluationVersion: string;
  knowledgeContext: IKnowledgeGroundedEvaluationContext;
  alignment?: IKnowledgeGroundedAlignment;
  organizationKnowledgeSignals?: IOrganizationKnowledgeSignals;
  summary?: string;
  aiUsage?: IEmployerHiringKnowledgeGroundedEvaluationAIUsage;
  evaluatedAt?: Date;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const knowledgeSourceSchema = new Schema<IKnowledgeGroundedEvaluationSource>(
  {
    knowledgeBaseId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeBase', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeDocument', required: true },
    chunkId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeChunk', required: true },
  },
  { _id: false }
);

const knowledgeContextSchema = new Schema<IKnowledgeGroundedEvaluationContext>(
  {
    enabled: { type: Boolean, required: true, default: false },
    retrievalAvailable: { type: Boolean, required: true, default: false },
    sources: { type: [knowledgeSourceSchema], default: [] },
  },
  { _id: false }
);

const claimSchema = new Schema<IKnowledgeGroundedClaim>(
  {
    claim: { type: String, required: true, trim: true, maxlength: [400, 'claim cannot exceed 400 characters'] },
    status: {
      type: String,
      enum: {
        values: ['supported', 'partially_supported', 'conflicting', 'not_supported', 'unverifiable'],
        message: '{VALUE} is not a valid claim status',
      },
      required: true,
    },
    sourceChunkIds: { type: [String], default: [] },
    explanation: { type: String, trim: true, maxlength: [500, 'explanation cannot exceed 500 characters'] },
  },
  { _id: false }
);

const alignmentSchema = new Schema<IKnowledgeGroundedAlignment>(
  {
    overall: {
      type: String,
      enum: {
        values: ['aligned', 'partially_aligned', 'conflicting', 'insufficient_evidence', 'not_applicable'],
        message: '{VALUE} is not a valid overall alignment',
      },
      required: true,
    },
    claims: { type: [claimSchema], default: [] },
  },
  { _id: false }
);

const knowledgeSignalsSchema = new Schema<IOrganizationKnowledgeSignals>(
  {
    demonstratesKnowledge: { type: Boolean, required: true, default: false },
    usesRelevantTerminology: { type: Boolean, required: true, default: false },
    respectsKnownConstraints: { type: Boolean, required: true, default: false },
    evidence: { type: [String], default: [] },
    gaps: { type: [String], default: [] },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerHiringKnowledgeGroundedEvaluationAIUsage>(
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

const employerHiringKnowledgeGroundedEvaluationSchema = new Schema<IEmployerHiringKnowledgeGroundedEvaluation>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    evaluationVersion: { type: String, required: true },
    knowledgeContext: { type: knowledgeContextSchema, required: true },
    alignment: { type: alignmentSchema },
    organizationKnowledgeSignals: { type: knowledgeSignalsSchema },
    summary: { type: String, trim: true, maxlength: [800, 'summary cannot exceed 800 characters'] },
    aiUsage: { type: aiUsageSchema },
    evaluatedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_knowledge_grounded_evaluations',
  }
);

// Exactly one knowledge-grounded evaluation per question per interview, ever
// — doubles as the concurrency claim (first create() wins; E11000 signals an
// in-flight/existing evaluation).
employerHiringKnowledgeGroundedEvaluationSchema.index({ organizationId: 1, interviewId: 1, questionIndex: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringKnowledgeGroundedEvaluation>(
  'EmployerHiringKnowledgeGroundedEvaluation',
  employerHiringKnowledgeGroundedEvaluationSchema
);
