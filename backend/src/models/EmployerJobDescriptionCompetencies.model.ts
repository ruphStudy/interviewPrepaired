import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobDescriptionCompetenciesStatus, EmployerJobCompetencyCategory, EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';

/**
 * A job/JD-version competency blueprint (17D) — derived from an
 * ALREADY-COMPLETED 17B analysis and 17C skill set for ONE immutable JD
 * source version. A competency is broader than a single skill (e.g.
 * "Backend Engineering", not "Node.js"). This is explicitly NOT an
 * interview-question/assessment blueprint, NOT candidate scoring, and NOT a
 * global/cross-company competency catalog — all later sprints. Never feeds
 * back into EmployerJob, EmployerJobDescriptionSource, the 17B analysis, or
 * the 17C skills.
 */
export interface IJobDescriptionCompetency {
  name: string;
  description: string;
  category: EmployerJobCompetencyCategory;
  importance: EmployerJobCompetencyImportance;
  /** Relative importance for THIS job, 0-100; the full competency set always sums to exactly 100 (backend-normalized, never trusted from AI as-is). */
  weight: number;
  /** Restricted to actual 17C skill names only — an unknown reference is dropped server-side, never persisted. */
  skillNames: string[];
  evidence: string[];
  /** Observable evidence an interviewer should look for — NOT interview questions. */
  interviewSignals: string[];
  confidence: number;
}

/** Same safe-subset-of-gateway-metadata shape as 17B/17C's aiUsage — one AI call per generation. */
export interface IEmployerJobDescriptionCompetenciesUsage {
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

export interface IEmployerJobDescriptionCompetencies extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  jdSourceId: Types.ObjectId;
  jdVersion: number;
  analysisId: Types.ObjectId;
  skillsId: Types.ObjectId;
  status: EmployerJobDescriptionCompetenciesStatus;
  competencies: IJobDescriptionCompetency[];
  aiUsage?: IEmployerJobDescriptionCompetenciesUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const competencySchema = new Schema<IJobDescriptionCompetency>(
  {
    name: { type: String, required: true, trim: true, maxlength: [150, 'name cannot exceed 150 characters'] },
    description: { type: String, required: true, trim: true, maxlength: [500, 'description cannot exceed 500 characters'] },
    category: {
      type: String,
      enum: { values: Object.values(EmployerJobCompetencyCategory), message: '{VALUE} is not a valid competency category' },
      required: true,
    },
    importance: {
      type: String,
      enum: { values: Object.values(EmployerJobCompetencyImportance), message: '{VALUE} is not a valid importance level' },
      required: true,
    },
    weight: { type: Number, required: true, min: 0, max: 100 },
    skillNames: { type: [String], default: [] },
    evidence: { type: [String], default: [] },
    interviewSignals: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerJobDescriptionCompetenciesUsage>(
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

const employerJobDescriptionCompetenciesSchema = new Schema<IEmployerJobDescriptionCompetencies>(
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
    analysisId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobDescriptionAnalysis',
      required: true,
    },
    skillsId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobDescriptionSkills',
      required: true,
    },
    status: {
      type: String,
      enum: {
        values: Object.values(EmployerJobDescriptionCompetenciesStatus),
        message: '{VALUE} is not a valid competencies status',
      },
      required: true,
    },
    competencies: { type: [competencySchema], default: [] },
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
    collection: 'employer_job_description_competencies',
  }
);

// The source version is immutable — exactly one competency blueprint per JD
// source version. This same unique index doubles as the concurrency claim,
// same pattern as 17B/17C: the first `create()` for a given
// {organizationId, jobId, jdSourceId} wins; every concurrent duplicate
// throws E11000, which EmployerJobDescriptionCompetencyService uses to
// detect an in-flight/existing generation rather than starting a second AI
// call.
employerJobDescriptionCompetenciesSchema.index({ organizationId: 1, jobId: 1, jdSourceId: 1 }, { unique: true });
employerJobDescriptionCompetenciesSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobDescriptionCompetencies>(
  'EmployerJobDescriptionCompetencies',
  employerJobDescriptionCompetenciesSchema
);
