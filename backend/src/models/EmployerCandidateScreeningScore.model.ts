import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic, explainable score for ONE completed 19A screening (19B).
 * NOT AI-generated — a fixed-formula breakdown of the screening's own
 * persisted result against the exact JD snapshot it was screened against.
 * Immutable: recalculating the same screening always yields the same
 * inputs and the same formula, so there is no update/delete path — exactly
 * one row per screening, ever. This deterministic `score.overallScore` is
 * the EXPLAINABLE calculated score; it is a SEPARATE, distinct number from
 * the AI's own `screening.result.overallScore` — this model never reads,
 * copies, or replaces that field. No ranking across candidates (19D), no
 * deeper gap analysis beyond this breakdown (19C), no shortlist automation
 * (19E).
 */
export interface IScreeningScoreComponent {
  score: number;
  weight: number;
  contribution: number;
}

export interface IScreeningScoreCompetencyBreakdown {
  name: string;
  jdWeight: number;
  matchScore: number;
  weightedContribution: number;
  evidence: string[];
}

export interface IScreeningScore {
  overallScore: number;
  components: {
    skills: IScreeningScoreComponent;
    competencies: IScreeningScoreComponent;
    experience: IScreeningScoreComponent;
    education: IScreeningScoreComponent;
  };
  competencyBreakdown: IScreeningScoreCompetencyBreakdown[];
  calculationVersion: string;
}

export interface IEmployerCandidateScreeningScore extends Document {
  organizationId: Types.ObjectId;
  screeningId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  jdSnapshotId: Types.ObjectId;
  resumeAnalysisId: Types.ObjectId;
  score: IScreeningScore;
  createdAt: Date;
}

const scoreComponentSchema = new Schema<IScreeningScoreComponent>(
  {
    score: { type: Number, required: true, min: 0, max: 100 },
    weight: { type: Number, required: true, min: 0, max: 1 },
    contribution: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const competencyBreakdownSchema = new Schema<IScreeningScoreCompetencyBreakdown>(
  {
    name: { type: String, required: true },
    jdWeight: { type: Number, required: true, min: 0, max: 100 },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    weightedContribution: { type: Number, required: true, min: 0, max: 100 },
    evidence: { type: [String], default: [] },
  },
  { _id: false }
);

const scoreSchema = new Schema<IScreeningScore>(
  {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    components: {
      skills: { type: scoreComponentSchema, required: true },
      competencies: { type: scoreComponentSchema, required: true },
      experience: { type: scoreComponentSchema, required: true },
      education: { type: scoreComponentSchema, required: true },
    },
    competencyBreakdown: { type: [competencyBreakdownSchema], default: [] },
    calculationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerCandidateScreeningScoreSchema = new Schema<IEmployerCandidateScreeningScore>(
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
    score: { type: scoreSchema, required: true },
  },
  {
    // No updatedAt — deterministic and immutable; there is no update/delete
    // path for this row, ever.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_screening_scores',
  }
);

// Exactly one score per screening, ever. This unique index is ALSO the sole
// concurrency guard: the first `create()` for a given
// {organizationId, screeningId} wins; every concurrent duplicate throws
// E11000, which EmployerCandidateScreeningScoreService catches to return
// the already-created winner instead of erroring or creating a second row.
employerCandidateScreeningScoreSchema.index({ organizationId: 1, screeningId: 1 }, { unique: true });
employerCandidateScreeningScoreSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateScreeningScore>(
  'EmployerCandidateScreeningScore',
  employerCandidateScreeningScoreSchema
);
