import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (no AI) evidence-strength/gap intelligence derived from the
 * exact 25A skill graph for one application (25B) — mutable, upserted in
 * place on every rebuild (unlike most append-only artifacts in this
 * domain): "no historical duplicate required in 25B" per its own spec.
 * `evidenceStrengthScore` means "strength of currently available
 * structured evidence" ONLY — never a proficiency %, mastery %, success
 * probability, or hiring recommendation.
 */
export type EmployerSkillClassification =
  | 'strong_evidence'
  | 'supported'
  | 'limited_evidence'
  | 'missing'
  | 'additional_candidate_skill';

export interface ISkillSourceSummary {
  resume: boolean;
  screening: boolean;
  assessment: boolean;
  evidence: boolean;
}

export interface IApplicationSkillIntelligenceEntry {
  skillNodeId: Types.ObjectId;
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  jobImportance?: string;
  jobWeight?: number;
  sourceSummary: ISkillSourceSummary;
}

export interface IApplicationSkillIntelligenceSummary {
  jobSkillCount: number;
  matchedSkillCount: number;
  strongEvidenceCount: number;
  supportedCount: number;
  limitedEvidenceCount: number;
  missingCount: number;
  additionalCandidateSkillCount: number;
  coveragePercent: number;
}

export interface IEmployerApplicationSkillIntelligence extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  skills: IApplicationSkillIntelligenceEntry[];
  summary: IApplicationSkillIntelligenceSummary;
  createdAt: Date;
  updatedAt: Date;
}

const sourceSummarySchema = new Schema<ISkillSourceSummary>(
  {
    resume: { type: Boolean, required: true, default: false },
    screening: { type: Boolean, required: true, default: false },
    assessment: { type: Boolean, required: true, default: false },
    evidence: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

const skillIntelligenceEntrySchema = new Schema<IApplicationSkillIntelligenceEntry>(
  {
    skillNodeId: { type: Schema.Types.ObjectId, ref: 'EmployerSkillNode', required: true },
    classification: {
      type: String,
      enum: {
        values: ['strong_evidence', 'supported', 'limited_evidence', 'missing', 'additional_candidate_skill'],
        message: '{VALUE} is not a valid skill classification',
      },
      required: true,
    },
    evidenceStrengthScore: { type: Number, min: 0, max: 100 },
    jobImportance: { type: String },
    jobWeight: { type: Number },
    sourceSummary: { type: sourceSummarySchema, required: true },
  },
  { _id: false }
);

const skillIntelligenceSummarySchema = new Schema<IApplicationSkillIntelligenceSummary>(
  {
    jobSkillCount: { type: Number, required: true, min: 0 },
    matchedSkillCount: { type: Number, required: true, min: 0 },
    strongEvidenceCount: { type: Number, required: true, min: 0 },
    supportedCount: { type: Number, required: true, min: 0 },
    limitedEvidenceCount: { type: Number, required: true, min: 0 },
    missingCount: { type: Number, required: true, min: 0 },
    additionalCandidateSkillCount: { type: Number, required: true, min: 0 },
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const employerApplicationSkillIntelligenceSchema = new Schema<IEmployerApplicationSkillIntelligence>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    skills: { type: [skillIntelligenceEntrySchema], default: [] },
    summary: { type: skillIntelligenceSummarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_application_skill_intelligence',
  }
);

// Exactly one row per application, ever — replaced/reconciled in place on every rebuild.
employerApplicationSkillIntelligenceSchema.index({ organizationId: 1, applicationId: 1 }, { unique: true });

export default mongoose.model<IEmployerApplicationSkillIntelligence>(
  'EmployerApplicationSkillIntelligence',
  employerApplicationSkillIntelligenceSchema
);
