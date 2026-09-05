import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobSkillRequirement, EmployerJobSkillImportance } from '../constants/employerJobDescriptionSkills';
import { EmployerCandidateGapSeverity, EmployerCandidateSkillGapStatus } from '../constants/employerCandidateScreeningGap';

/**
 * Deterministic skill/requirement gap analysis for ONE completed 19A
 * screening (19C) — derived from the screening's own persisted result, its
 * 19B explainable score, and the exact finalized JD snapshot it was
 * screened against. NOT AI-generated. Immutable: exactly one row per
 * screening, ever — there is no update/delete path. Informational only;
 * never ranks candidates (19D), never automates shortlisting (19E), never
 * generates a remediation/training plan.
 */
export interface ISkillGap {
  skillName: string;
  requirement: EmployerJobSkillRequirement;
  importance: EmployerJobSkillImportance;
  status: EmployerCandidateSkillGapStatus;
  severity: EmployerCandidateGapSeverity;
}

export interface ICompetencyGap {
  competencyName: string;
  jdWeight: number;
  matchScore: number;
  severity: EmployerCandidateGapSeverity;
  evidence: string[];
}

export interface IExperienceGap {
  required?: string;
  candidate?: string;
  score: number;
  severity: EmployerCandidateGapSeverity;
  summary?: string;
}

export interface IEducationGap {
  score: number;
  severity: EmployerCandidateGapSeverity;
  summary?: string;
}

export interface IGapSummary {
  criticalGapCount: number;
  highGapCount: number;
  mediumGapCount: number;
  lowGapCount: number;
  matchedSkillCount: number;
  partialSkillCount: number;
  missingSkillCount: number;
}

export interface IScreeningGap {
  summary: IGapSummary;
  skillGaps: ISkillGap[];
  competencyGaps: ICompetencyGap[];
  experienceGap?: IExperienceGap;
  educationGap?: IEducationGap;
  strengths: string[];
  calculationVersion: string;
}

export interface IEmployerCandidateScreeningGap extends Document {
  organizationId: Types.ObjectId;
  screeningId: Types.ObjectId;
  screeningScoreId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  jdSnapshotId: Types.ObjectId;
  resumeAnalysisId: Types.ObjectId;
  gap: IScreeningGap;
  createdAt: Date;
}

const skillGapSchema = new Schema<ISkillGap>(
  {
    skillName: { type: String, required: true },
    requirement: { type: String, enum: Object.values(EmployerJobSkillRequirement), required: true },
    importance: { type: String, enum: Object.values(EmployerJobSkillImportance), required: true },
    status: { type: String, enum: Object.values(EmployerCandidateSkillGapStatus), required: true },
    severity: { type: String, enum: Object.values(EmployerCandidateGapSeverity), required: true },
  },
  { _id: false }
);

const competencyGapSchema = new Schema<ICompetencyGap>(
  {
    competencyName: { type: String, required: true },
    jdWeight: { type: Number, required: true, min: 0, max: 100 },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    severity: { type: String, enum: Object.values(EmployerCandidateGapSeverity), required: true },
    evidence: { type: [String], default: [] },
  },
  { _id: false }
);

const experienceGapSchema = new Schema<IExperienceGap>(
  {
    required: { type: String },
    candidate: { type: String },
    score: { type: Number, required: true, min: 0, max: 100 },
    severity: { type: String, enum: Object.values(EmployerCandidateGapSeverity), required: true },
    summary: { type: String },
  },
  { _id: false }
);

const educationGapSchema = new Schema<IEducationGap>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    severity: { type: String, enum: Object.values(EmployerCandidateGapSeverity), required: true },
    summary: { type: String },
  },
  { _id: false }
);

const gapSummarySchema = new Schema<IGapSummary>(
  {
    criticalGapCount: { type: Number, required: true, min: 0 },
    highGapCount: { type: Number, required: true, min: 0 },
    mediumGapCount: { type: Number, required: true, min: 0 },
    lowGapCount: { type: Number, required: true, min: 0 },
    matchedSkillCount: { type: Number, required: true, min: 0 },
    partialSkillCount: { type: Number, required: true, min: 0 },
    missingSkillCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const screeningGapSchema = new Schema<IScreeningGap>(
  {
    summary: { type: gapSummarySchema, required: true },
    skillGaps: { type: [skillGapSchema], default: [] },
    competencyGaps: { type: [competencyGapSchema], default: [] },
    experienceGap: { type: experienceGapSchema },
    educationGap: { type: educationGapSchema },
    strengths: { type: [String], default: [] },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerCandidateScreeningGapSchema = new Schema<IEmployerCandidateScreeningGap>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    screeningId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreening',
      required: true,
    },
    screeningScoreId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreeningScore',
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
    gap: { type: screeningGapSchema, required: true },
  },
  {
    // No updatedAt — deterministic and immutable; there is no update/delete
    // path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_screening_gaps',
  }
);

// Exactly one gap analysis per screening, ever. This unique index is ALSO
// the sole concurrency guard: the first `create()` for a given
// {organizationId, screeningId} wins; every concurrent duplicate throws
// E11000, which EmployerCandidateScreeningGapService catches to return the
// already-created winner instead of erroring or creating a second row.
employerCandidateScreeningGapSchema.index({ organizationId: 1, screeningId: 1 }, { unique: true });
employerCandidateScreeningGapSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateScreeningGap>(
  'EmployerCandidateScreeningGap',
  employerCandidateScreeningGapSchema
);
