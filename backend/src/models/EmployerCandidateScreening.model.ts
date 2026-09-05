import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateScreeningStatus, EmployerCandidateScreeningRecommendation } from '../constants/employerCandidateScreening';

/**
 * One AI-assisted screening result comparing a job application's candidate
 * resume analysis against a job's FINALIZED JD Intelligence Snapshot (19A).
 * Uniqueness is keyed on the EXACT combination of
 * {applicationId, jdSnapshotId, resumeAnalysisId} — if the JD later gets a
 * new finalized snapshot, or the candidate gets a new completed resume
 * analysis, that is a NEW combination and gets its own screening row; a
 * historical screening result is never overwritten. No ranking across
 * candidates (19D), no shortlist automation (19E), no interview generation
 * happens here or anywhere in this model's lifecycle.
 */
export interface IScreeningSkillMatch {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
}

export interface IScreeningCompetencyMatch {
  competencyName: string;
  score: number;
  evidence: string[];
}

export interface IScreeningExperienceMatch {
  score: number;
  summary?: string;
}

export interface IScreeningEducationMatch {
  score: number;
  summary?: string;
}

export interface IScreeningResult {
  overallScore: number;
  recommendation: EmployerCandidateScreeningRecommendation;
  skillMatch: IScreeningSkillMatch;
  competencyMatch: IScreeningCompetencyMatch[];
  experienceMatch: IScreeningExperienceMatch;
  educationMatch: IScreeningEducationMatch;
  strengths: string[];
  concerns: string[];
  confidence: number;
}

/** A safe subset of the AI Gateway's normalized usage metadata, plus cost computed via the existing shared pricing config — never a parallel pricing calculator. */
export interface IEmployerCandidateScreeningUsage {
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

export interface IEmployerCandidateScreening extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  jdSnapshotId: Types.ObjectId;
  resumeAnalysisId: Types.ObjectId;
  status: EmployerCandidateScreeningStatus;
  result?: IScreeningResult;
  aiUsage?: IEmployerCandidateScreeningUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const skillMatchSchema = new Schema<IScreeningSkillMatch>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    partialSkills: { type: [String], default: [] },
  },
  { _id: false }
);

const competencyMatchSchema = new Schema<IScreeningCompetencyMatch>(
  {
    competencyName: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    evidence: { type: [String], default: [] },
  },
  { _id: false }
);

const experienceMatchSchema = new Schema<IScreeningExperienceMatch>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    summary: { type: String },
  },
  { _id: false }
);

const educationMatchSchema = new Schema<IScreeningEducationMatch>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    summary: { type: String },
  },
  { _id: false }
);

const resultSchema = new Schema<IScreeningResult>(
  {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    recommendation: { type: String, enum: Object.values(EmployerCandidateScreeningRecommendation), required: true },
    skillMatch: { type: skillMatchSchema, required: true },
    competencyMatch: { type: [competencyMatchSchema], default: [] },
    experienceMatch: { type: experienceMatchSchema, required: true },
    educationMatch: { type: educationMatchSchema, required: true },
    strengths: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerCandidateScreeningUsage>(
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

const employerCandidateScreeningSchema = new Schema<IEmployerCandidateScreening>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobApplication',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    jdSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobIntelligenceSnapshot',
      required: true,
    },
    resumeAnalysisId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateResumeAnalysis',
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerCandidateScreeningStatus), message: '{VALUE} is not a valid screening status' },
      required: true,
    },
    result: { type: resultSchema },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'employer_candidate_screenings',
  }
);

// The exact combination is immutable — exactly one screening row per
// {applicationId, jdSnapshotId, resumeAnalysisId}. This same unique index
// doubles as the concurrency claim: the FIRST `create()` for a given
// combination wins; every concurrent duplicate throws E11000, which
// EmployerCandidateScreeningService uses to detect an in-flight/existing
// screening rather than starting a second AI call.
employerCandidateScreeningSchema.index(
  { organizationId: 1, applicationId: 1, jdSnapshotId: 1, resumeAnalysisId: 1 },
  { unique: true }
);
employerCandidateScreeningSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateScreening>('EmployerCandidateScreening', employerCandidateScreeningSchema);
