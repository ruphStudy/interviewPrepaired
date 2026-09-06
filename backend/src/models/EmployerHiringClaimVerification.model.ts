import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Internal EVIDENCE ALIGNMENT of important candidate claims made in one
 * hiring assessment against structured evidence ALREADY available inside
 * this hiring chain (26D) — NOT external fact-checking, NOT background
 * verification, NOT lie/deception detection. `alignment` never means
 * truth/falsehood: "unsupported" means no supporting structured evidence
 * was found (never "false"), "conflicting" means structured evidence
 * materially conflicts with the claim (never "lying"). Every
 * `evidenceSources[].sourceArtifactId` is validated server-side to belong
 * to the EXACT organization/application/interview chain — never trusted
 * verbatim from AI output. Read-only intelligence layer: never mutates
 * answers, evaluations, the 21E aggregate, the 22A evidence matrix, resume
 * analysis, or screening.
 */
export type EmployerHiringClaimVerificationStatus = 'processing' | 'completed' | 'failed';

export type EmployerHiringClaimCategory =
  | 'experience'
  | 'skill'
  | 'project'
  | 'responsibility'
  | 'achievement'
  | 'education'
  | 'domain'
  | 'other';

export type EmployerHiringClaimAlignment = 'supported' | 'partially_supported' | 'unsupported' | 'conflicting' | 'unverifiable';

export type EmployerHiringClaimEvidenceSourceType = 'resume' | 'screening' | 'assessment' | 'evidence_matrix' | 'consistency';

export interface IClaimEvidenceSource {
  type: EmployerHiringClaimEvidenceSourceType;
  sourceArtifactId: Types.ObjectId;
  evidenceSummary: string;
}

export interface IVerifiedClaim {
  claimId: string;
  questionIndex: number;
  claimSummary: string;
  category: EmployerHiringClaimCategory;
  alignment: EmployerHiringClaimAlignment;
  evidenceSources: IClaimEvidenceSource[];
  limitation?: string;
}

export interface IClaimVerificationSummary {
  totalClaims: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  conflicting: number;
  unverifiable: number;
}

/** Same shape/convention as 26A/26B/26C's AI usage subdocument. */
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

export interface IEmployerHiringClaimVerification extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  status: EmployerHiringClaimVerificationStatus;
  claims?: IVerifiedClaim[];
  summary?: IClaimVerificationSummary;
  limitations: string[];
  aiUsage?: IEmployerHiringAnswerAIUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const claimEvidenceSourceSchema = new Schema<IClaimEvidenceSource>(
  {
    type: {
      type: String,
      enum: {
        values: ['resume', 'screening', 'assessment', 'evidence_matrix', 'consistency'],
        message: '{VALUE} is not a valid evidence source type',
      },
      required: true,
    },
    sourceArtifactId: { type: Schema.Types.ObjectId, required: true },
    evidenceSummary: { type: String, required: true, trim: true, maxlength: [350, 'evidenceSummary cannot exceed 350 characters'] },
  },
  { _id: false }
);

const verifiedClaimSchema = new Schema<IVerifiedClaim>(
  {
    claimId: { type: String, required: true, trim: true },
    questionIndex: { type: Number, required: true, min: 0 },
    claimSummary: { type: String, required: true, trim: true, maxlength: [300, 'claimSummary cannot exceed 300 characters'] },
    category: {
      type: String,
      enum: {
        values: ['experience', 'skill', 'project', 'responsibility', 'achievement', 'education', 'domain', 'other'],
        message: '{VALUE} is not a valid claim category',
      },
      required: true,
    },
    alignment: {
      type: String,
      enum: {
        values: ['supported', 'partially_supported', 'unsupported', 'conflicting', 'unverifiable'],
        message: '{VALUE} is not a valid alignment',
      },
      required: true,
    },
    evidenceSources: { type: [claimEvidenceSourceSchema], default: [] },
    limitation: { type: String, trim: true, maxlength: [300, 'limitation cannot exceed 300 characters'] },
  },
  { _id: false }
);

const claimVerificationSummarySchema = new Schema<IClaimVerificationSummary>(
  {
    totalClaims: { type: Number, required: true, min: 0 },
    supported: { type: Number, required: true, min: 0 },
    partiallySupported: { type: Number, required: true, min: 0 },
    unsupported: { type: Number, required: true, min: 0 },
    conflicting: { type: Number, required: true, min: 0 },
    unverifiable: { type: Number, required: true, min: 0 },
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

const employerHiringClaimVerificationSchema = new Schema<IEmployerHiringClaimVerification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    claims: { type: [verifiedClaimSchema], default: undefined },
    summary: { type: claimVerificationSummarySchema },
    limitations: { type: [String], default: [] },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_claim_verification',
  }
);

// Exactly one claim-verification row per interview, ever — same
// claim/concurrency pattern as 26A/26B/26C's own unique indexes.
employerHiringClaimVerificationSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerHiringClaimVerification>('EmployerHiringClaimVerification', employerHiringClaimVerificationSchema);
