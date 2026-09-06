import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerSkillClassification } from './EmployerApplicationSkillIntelligence.model';

/**
 * Deterministic (no AI) interpretation of how the AVAILABLE STRUCTURED
 * EVIDENCE for one candidate skill changed across the existing 25C Skill
 * Memory observations (25D) — mutable, upserted in place per skill on every
 * refresh. This is EVIDENCE evolution only: it never claims the candidate's
 * actual human skill improved or declined, only that the structured
 * evidence this organization has collected got stronger/weaker/staler.
 * Rebuilt ONLY from an existing `EmployerCandidateSkillMemory` row — never
 * rereads raw source artifacts, never auto-builds 25C.
 */
export type EmployerSkillEvolutionTrend = 'stronger_evidence' | 'stable_evidence' | 'weaker_evidence' | 'first_observation';
export type EmployerSkillEvidenceRecencyBucket = 'recent' | 'aging' | 'stale';

export interface ISkillEvolutionObservationSnapshot {
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  observedAt: Date;
}

export interface ISkillEvolutionRecency {
  daysSinceLastObservation: number;
  bucket: EmployerSkillEvidenceRecencyBucket;
}

export interface IEmployerCandidateSkillEvolution extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  skillNodeId: Types.ObjectId;
  memoryId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  latest: ISkillEvolutionObservationSnapshot;
  previous?: ISkillEvolutionObservationSnapshot;
  trend: EmployerSkillEvolutionTrend;
  recency: ISkillEvolutionRecency;
  observationCount: number;
  applicationCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const skillEvolutionObservationSnapshotSchema = new Schema<ISkillEvolutionObservationSnapshot>(
  {
    classification: {
      type: String,
      enum: {
        values: ['strong_evidence', 'supported', 'limited_evidence', 'missing', 'additional_candidate_skill'],
        message: '{VALUE} is not a valid skill classification',
      },
      required: true,
    },
    evidenceStrengthScore: { type: Number, min: 0, max: 100 },
    observedAt: { type: Date, required: true },
  },
  { _id: false }
);

const skillEvolutionRecencySchema = new Schema<ISkillEvolutionRecency>(
  {
    daysSinceLastObservation: { type: Number, required: true, min: 0 },
    bucket: {
      type: String,
      enum: { values: ['recent', 'aging', 'stale'], message: '{VALUE} is not a valid recency bucket' },
      required: true,
    },
  },
  { _id: false }
);

const employerCandidateSkillEvolutionSchema = new Schema<IEmployerCandidateSkillEvolution>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    skillNodeId: { type: Schema.Types.ObjectId, ref: 'EmployerSkillNode', required: true },
    memoryId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidateSkillMemory', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    latest: { type: skillEvolutionObservationSnapshotSchema, required: true },
    previous: { type: skillEvolutionObservationSnapshotSchema },
    trend: {
      type: String,
      enum: {
        values: ['stronger_evidence', 'stable_evidence', 'weaker_evidence', 'first_observation'],
        message: '{VALUE} is not a valid evolution trend',
      },
      required: true,
    },
    recency: { type: skillEvolutionRecencySchema, required: true },
    observationCount: { type: Number, required: true, min: 0 },
    applicationCount: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
    collection: 'employer_candidate_skill_evolution',
  }
);

// Exactly one evolution row per skill per candidate per organization, ever —
// reconciled/upserted in place on every refresh.
employerCandidateSkillEvolutionSchema.index({ organizationId: 1, candidateId: 1, skillNodeId: 1 }, { unique: true });
employerCandidateSkillEvolutionSchema.index({ organizationId: 1, candidateId: 1 });

export default mongoose.model<IEmployerCandidateSkillEvolution>(
  'EmployerCandidateSkillEvolution',
  employerCandidateSkillEvolutionSchema
);
