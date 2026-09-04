import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  EmployerJobDescriptionSkillsStatus,
  EmployerJobSkillCategory,
  EmployerJobSkillRequirement,
  EmployerJobSkillProficiency,
  EmployerJobSkillImportance,
} from '../constants/employerJobDescriptionSkills';

/**
 * A normalized, de-duplicated set of skills extracted from ONE immutable JD
 * source version's ALREADY-COMPLETED 17B analysis (17C) — job/JD-version
 * skill intelligence only. This is explicitly NOT a global/cross-company
 * skill catalog (that's a later sprint) and never feeds back into
 * EmployerJob, EmployerJobDescriptionSource, or the 17B analysis itself.
 */
export interface IJobDescriptionSkill {
  name: string;
  /** Deterministic, server-computed identity key — never trusted from AI output. */
  normalizedName: string;
  category: EmployerJobSkillCategory;
  requirement: EmployerJobSkillRequirement;
  proficiency: EmployerJobSkillProficiency;
  importance: EmployerJobSkillImportance;
  evidence: string[];
  aliases: string[];
  confidence: number;
}

/** Same safe-subset-of-gateway-metadata shape as 17B's aiUsage — one AI call per extraction. */
export interface IEmployerJobDescriptionSkillsUsage {
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

export interface IEmployerJobDescriptionSkills extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  jdSourceId: Types.ObjectId;
  jdVersion: number;
  analysisId: Types.ObjectId;
  status: EmployerJobDescriptionSkillsStatus;
  skills: IJobDescriptionSkill[];
  aiUsage?: IEmployerJobDescriptionSkillsUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema<IJobDescriptionSkill>(
  {
    name: { type: String, required: true, trim: true, maxlength: [150, 'name cannot exceed 150 characters'] },
    normalizedName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: { values: Object.values(EmployerJobSkillCategory), message: '{VALUE} is not a valid skill category' },
      required: true,
    },
    requirement: {
      type: String,
      enum: { values: Object.values(EmployerJobSkillRequirement), message: '{VALUE} is not a valid requirement level' },
      required: true,
    },
    proficiency: {
      type: String,
      enum: { values: Object.values(EmployerJobSkillProficiency), message: '{VALUE} is not a valid proficiency level' },
      required: true,
    },
    importance: {
      type: String,
      enum: { values: Object.values(EmployerJobSkillImportance), message: '{VALUE} is not a valid importance level' },
      required: true,
    },
    evidence: { type: [String], default: [] },
    aliases: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerJobDescriptionSkillsUsage>(
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

const employerJobDescriptionSkillsSchema = new Schema<IEmployerJobDescriptionSkills>(
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
    status: {
      type: String,
      enum: { values: Object.values(EmployerJobDescriptionSkillsStatus), message: '{VALUE} is not a valid skills status' },
      required: true,
    },
    skills: { type: [skillSchema], default: [] },
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
    collection: 'employer_job_description_skills',
  }
);

// The source version is immutable — exactly one skills row per JD source
// version. This same unique index doubles as the concurrency claim, same
// pattern as EmployerJobDescriptionAnalysis (17B): the first `create()` for
// a given {organizationId, jobId, jdSourceId} wins; every concurrent
// duplicate throws E11000, which EmployerJobDescriptionSkillsService uses
// to detect an in-flight/existing extraction rather than starting a second
// AI call.
employerJobDescriptionSkillsSchema.index({ organizationId: 1, jobId: 1, jdSourceId: 1 }, { unique: true });
employerJobDescriptionSkillsSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobDescriptionSkills>('EmployerJobDescriptionSkills', employerJobDescriptionSkillsSchema);
