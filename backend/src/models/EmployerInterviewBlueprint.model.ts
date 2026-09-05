import mongoose, { Schema, Document, Types } from 'mongoose';
import {
  EmployerInterviewBlueprintStatus,
  EmployerInterviewBlueprintSectionCategory,
  EmployerInterviewBlueprintDifficulty,
} from '../constants/employerInterviewBlueprint';

/**
 * An AI-assisted structured interview PLAN for one shortlisted application
 * (20A) — question INTENTS/planning slots only, never final candidate-
 * facing questions, never an interview session/invitation. Built from the
 * finalized JD Intelligence Snapshot (job truth) plus the candidate's
 * structured screening/score/(optional) gap artifacts — never raw JD/
 * resume text, never demographic/contact information, never recruiter
 * notes or application source attribution. Uniqueness is keyed on the
 * EXACT combination of {applicationId, screeningId} — if the screening
 * later changes (because the JD or resume changes), that is a NEW
 * combination and gets its own blueprint row; a historical blueprint is
 * never overwritten.
 */
export interface IBlueprintQuestionPlanItem {
  intent: string;
  difficulty: EmployerInterviewBlueprintDifficulty;
  evidenceExpected: string[];
  followUpFocus: string[];
}

export interface IBlueprintSection {
  id: string;
  title: string;
  objective: string;
  order: number;
  durationMinutes: number;
  category: EmployerInterviewBlueprintSectionCategory;
  competencies: string[];
  skills: string[];
  questionPlan: IBlueprintQuestionPlanItem[];
}

export interface IBlueprintMetadata {
  totalSections: number;
  totalPlannedQuestions: number;
  sourceCompetencyCount: number;
  sourceSkillCount: number;
}

export interface IInterviewBlueprint {
  title: string;
  estimatedDurationMinutes: number;
  sections: IBlueprintSection[];
  focusAreas: string[];
  avoidAreas: string[];
  metadata: IBlueprintMetadata;
}

/** A safe subset of the AI Gateway's normalized usage metadata, plus cost computed via the existing shared pricing config — never a parallel pricing calculator. */
export interface IEmployerInterviewBlueprintUsage {
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

export interface IEmployerInterviewBlueprint extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  shortlistDecisionId: Types.ObjectId;
  jdSnapshotId: Types.ObjectId;
  screeningId: Types.ObjectId;
  screeningScoreId: Types.ObjectId;
  screeningGapId?: Types.ObjectId;
  status: EmployerInterviewBlueprintStatus;
  blueprint?: IInterviewBlueprint;
  aiUsage?: IEmployerInterviewBlueprintUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const questionPlanItemSchema = new Schema<IBlueprintQuestionPlanItem>(
  {
    intent: { type: String, required: true },
    difficulty: { type: String, enum: Object.values(EmployerInterviewBlueprintDifficulty), required: true },
    evidenceExpected: { type: [String], default: [] },
    followUpFocus: { type: [String], default: [] },
  },
  { _id: false }
);

const sectionSchema = new Schema<IBlueprintSection>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    objective: { type: String, required: true },
    order: { type: Number, required: true, min: 1 },
    durationMinutes: { type: Number, required: true, min: 1 },
    category: { type: String, enum: Object.values(EmployerInterviewBlueprintSectionCategory), required: true },
    competencies: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    questionPlan: { type: [questionPlanItemSchema], default: [] },
  },
  { _id: false }
);

const metadataSchema = new Schema<IBlueprintMetadata>(
  {
    totalSections: { type: Number, required: true, min: 0 },
    totalPlannedQuestions: { type: Number, required: true, min: 0 },
    sourceCompetencyCount: { type: Number, required: true, min: 0 },
    sourceSkillCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const blueprintSchema = new Schema<IInterviewBlueprint>(
  {
    title: { type: String, required: true },
    estimatedDurationMinutes: { type: Number, required: true, min: 1 },
    sections: { type: [sectionSchema], default: [] },
    focusAreas: { type: [String], default: [] },
    avoidAreas: { type: [String], default: [] },
    metadata: { type: metadataSchema, required: true },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerInterviewBlueprintUsage>(
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

const employerInterviewBlueprintSchema = new Schema<IEmployerInterviewBlueprint>(
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
    shortlistDecisionId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateShortlistDecision',
      required: true,
    },
    jdSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobIntelligenceSnapshot',
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
    screeningGapId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreeningGap',
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerInterviewBlueprintStatus), message: '{VALUE} is not a valid blueprint status' },
      required: true,
    },
    blueprint: { type: blueprintSchema },
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
    collection: 'employer_interview_blueprints',
  }
);

// The exact combination is immutable — exactly one blueprint row per
// {applicationId, screeningId}. This same unique index doubles as the
// concurrency claim: the FIRST `create()` for a given combination wins;
// every concurrent duplicate throws E11000, which
// EmployerInterviewBlueprintService uses to detect an in-flight/existing
// blueprint rather than starting a second AI call.
employerInterviewBlueprintSchema.index({ organizationId: 1, applicationId: 1, screeningId: 1 }, { unique: true });
employerInterviewBlueprintSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerInterviewBlueprint>('EmployerInterviewBlueprint', employerInterviewBlueprintSchema);
