import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobDescriptionAnalysisStatus } from '../constants/employerJobDescriptionAnalysis';

/**
 * Structured, AI-parsed understanding of ONE immutable JD source version
 * (17B) — raw understanding only. `technicalKeywords`/`softSkillKeywords`
 * are raw parsed concepts pulled from the text, NOT the canonical/scored
 * skill taxonomy (that's Sprint 17C) and not competencies (17D). This model
 * never feeds back into EmployerJob or EmployerJobDescriptionSource.
 */
export interface IJobDescriptionAnalysisRequirements {
  mandatory: string[];
  preferred: string[];
}

export interface IJobDescriptionAnalysisExperience {
  minYears?: number;
  maxYears?: number;
  description?: string;
}

export interface IJobDescriptionAnalysisCompensation {
  min?: number;
  max?: number;
  currency?: string;
  rawText?: string;
}

export interface IJobDescriptionAnalysisConfidence {
  overall: number;
  ambiguousSections: string[];
}

export interface IJobDescriptionAnalysis {
  jobTitle?: string;
  summary?: string;
  rolePurpose?: string;
  responsibilities: string[];
  requirements: IJobDescriptionAnalysisRequirements;
  experience: IJobDescriptionAnalysisExperience;
  education: string[];
  domainKnowledge: string[];
  technicalKeywords: string[];
  toolsTechnologies: string[];
  softSkillKeywords: string[];
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  compensation?: IJobDescriptionAnalysisCompensation;
  confidence: IJobDescriptionAnalysisConfidence;
}

/** A safe subset of the AI Gateway's normalized usage metadata, plus cost computed via the existing shared pricing config — never a parallel pricing calculator. */
export interface IEmployerJobDescriptionAnalysisUsage {
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

export interface IEmployerJobDescriptionAnalysis extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  jdSourceId: Types.ObjectId;
  jdVersion: number;
  status: EmployerJobDescriptionAnalysisStatus;
  analysis?: IJobDescriptionAnalysis;
  aiUsage?: IEmployerJobDescriptionAnalysisUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const requirementsSchema = new Schema<IJobDescriptionAnalysisRequirements>(
  {
    mandatory: { type: [String], default: [] },
    preferred: { type: [String], default: [] },
  },
  { _id: false }
);

const experienceSchema = new Schema<IJobDescriptionAnalysisExperience>(
  {
    minYears: { type: Number },
    maxYears: { type: Number },
    description: { type: String },
  },
  { _id: false }
);

const compensationSchema = new Schema<IJobDescriptionAnalysisCompensation>(
  {
    min: { type: Number },
    max: { type: Number },
    currency: { type: String },
    rawText: { type: String },
  },
  { _id: false }
);

const confidenceSchema = new Schema<IJobDescriptionAnalysisConfidence>(
  {
    overall: { type: Number, required: true, min: 0, max: 1 },
    ambiguousSections: { type: [String], default: [] },
  },
  { _id: false }
);

const analysisSchema = new Schema<IJobDescriptionAnalysis>(
  {
    jobTitle: { type: String },
    summary: { type: String },
    rolePurpose: { type: String },
    responsibilities: { type: [String], default: [] },
    requirements: { type: requirementsSchema, default: () => ({ mandatory: [], preferred: [] }) },
    experience: { type: experienceSchema, default: () => ({}) },
    education: { type: [String], default: [] },
    domainKnowledge: { type: [String], default: [] },
    technicalKeywords: { type: [String], default: [] },
    toolsTechnologies: { type: [String], default: [] },
    softSkillKeywords: { type: [String], default: [] },
    location: { type: String },
    workplaceType: { type: String },
    employmentType: { type: String },
    compensation: { type: compensationSchema },
    confidence: { type: confidenceSchema, required: true },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerJobDescriptionAnalysisUsage>(
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

const employerJobDescriptionAnalysisSchema = new Schema<IEmployerJobDescriptionAnalysis>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    jdSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobDescriptionSource',
      required: true,
    },
    jdVersion: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerJobDescriptionAnalysisStatus), message: '{VALUE} is not a valid analysis status' },
      required: true,
    },
    analysis: { type: analysisSchema },
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
    collection: 'employer_job_description_analyses',
  }
);

// The source version is immutable — exactly one analysis row per JD source
// version. This same unique index doubles as the concurrency claim: the
// FIRST `create()` for a given {organizationId, jobId, jdSourceId} wins;
// every concurrent duplicate throws E11000, which
// EmployerJobDescriptionAnalysisService uses to detect an in-flight/
// existing analysis rather than starting a second AI call.
employerJobDescriptionAnalysisSchema.index({ organizationId: 1, jobId: 1, jdSourceId: 1 }, { unique: true });
employerJobDescriptionAnalysisSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobDescriptionAnalysis>(
  'EmployerJobDescriptionAnalysis',
  employerJobDescriptionAnalysisSchema
);
