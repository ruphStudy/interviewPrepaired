import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';

/**
 * An immutable, DETERMINISTIC (no AI) interviewer evaluation rubric for
 * one COMPLETED 20A blueprint (20B) — built purely from the blueprint's
 * own sections/question plans plus the exact finalized JD competencies it
 * was generated from. Guides interviewer evaluation only; this is never a
 * candidate score, and no candidate answers are evaluated by this model.
 * Uniqueness is keyed on `blueprintId` — a NEW blueprint (from a new
 * screening) gets its own rubric; a historical rubric is never
 * overwritten. No update/delete endpoint exists for this model at all.
 */
export interface IRubricScoringAnchors {
  score1: string;
  score2: string;
  score3: string;
  score4: string;
  score5: string;
}

export interface IRubricCompetency {
  competencyName: string;
  description?: string;
  jdWeight: number;
  importance: EmployerJobCompetencyImportance;
  sectionIds: string[];
  plannedIntentCount: number;
  evidenceSignals: string[];
  scoringAnchors: IRubricScoringAnchors;
}

export interface IRubricCoverage {
  totalCompetencies: number;
  coveredCompetencies: number;
  uncoveredCompetencies: string[];
  criticalCovered: number;
  criticalTotal: number;
  highCovered: number;
  highTotal: number;
  coveragePercent: number;
}

export interface IInterviewCompetencyRubric {
  competencies: IRubricCompetency[];
  coverage: IRubricCoverage;
  calculationVersion: string;
}

export interface IEmployerInterviewCompetencyRubric extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  screeningId: Types.ObjectId;
  jdSnapshotId: Types.ObjectId;
  rubric: IInterviewCompetencyRubric;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const scoringAnchorsSchema = new Schema<IRubricScoringAnchors>(
  {
    score1: { type: String, required: true },
    score2: { type: String, required: true },
    score3: { type: String, required: true },
    score4: { type: String, required: true },
    score5: { type: String, required: true },
  },
  { _id: false }
);

const rubricCompetencySchema = new Schema<IRubricCompetency>(
  {
    competencyName: { type: String, required: true },
    description: { type: String },
    jdWeight: { type: Number, required: true, min: 0, max: 100 },
    importance: { type: String, enum: Object.values(EmployerJobCompetencyImportance), required: true },
    sectionIds: { type: [String], default: [] },
    plannedIntentCount: { type: Number, required: true, min: 0 },
    evidenceSignals: { type: [String], default: [] },
    scoringAnchors: { type: scoringAnchorsSchema, required: true },
  },
  { _id: false }
);

const coverageSchema = new Schema<IRubricCoverage>(
  {
    totalCompetencies: { type: Number, required: true, min: 0 },
    coveredCompetencies: { type: Number, required: true, min: 0 },
    uncoveredCompetencies: { type: [String], default: [] },
    criticalCovered: { type: Number, required: true, min: 0 },
    criticalTotal: { type: Number, required: true, min: 0 },
    highCovered: { type: Number, required: true, min: 0 },
    highTotal: { type: Number, required: true, min: 0 },
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const rubricSchema = new Schema<IInterviewCompetencyRubric>(
  {
    competencies: { type: [rubricCompetencySchema], default: [] },
    coverage: { type: coverageSchema, required: true },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerInterviewCompetencyRubricSchema = new Schema<IEmployerInterviewCompetencyRubric>(
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
    blueprintId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerInterviewBlueprint',
      required: true,
    },
    screeningId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreening',
      required: true,
    },
    jdSnapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobIntelligenceSnapshot',
      required: true,
    },
    rubric: { type: rubricSchema, required: true },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    // No updatedAt — deterministic and immutable; there is no update/delete
    // path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_interview_competency_rubrics',
  }
);

// Exactly one rubric per blueprint, ever. This unique index is ALSO the
// sole concurrency guard: the first `create()` for a given
// {organizationId, blueprintId} wins; every concurrent duplicate throws
// E11000, which EmployerInterviewCompetencyRubricService catches to return
// the already-created winner instead of erroring or creating a second row.
employerInterviewCompetencyRubricSchema.index({ organizationId: 1, blueprintId: 1 }, { unique: true });
employerInterviewCompetencyRubricSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerInterviewCompetencyRubric>(
  'EmployerInterviewCompetencyRubric',
  employerInterviewCompetencyRubricSchema
);
