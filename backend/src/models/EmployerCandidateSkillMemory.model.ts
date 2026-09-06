import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerSkillClassification } from './EmployerApplicationSkillIntelligence.model';

/**
 * Organization-scoped historical skill EVIDENCE memory for one candidate
 * across multiple job applications (25C) — historical evidence memory,
 * NOT global user identity, NOT B2C interview memory, NEVER shared across
 * organizations. Rebuilt deterministically from existing 25B intelligence
 * only — never rereads raw resume/JD text, never averages scores across
 * jobs into one global proficiency number. `latestClassification`/
 * `latestEvidenceStrengthScore` reflect the MOST RECENT observation only;
 * older evidence may no longer represent the candidate's current skill
 * level.
 */
export interface ISkillMemoryObservation {
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  skillIntelligenceId?: Types.ObjectId;
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  sourceTypes: string[];
  observedAt: Date;
}

export interface IEmployerCandidateSkillMemory extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  skillNodeId: Types.ObjectId;
  observations: ISkillMemoryObservation[];
  firstObservedAt: Date;
  lastObservedAt: Date;
  observationCount: number;
  latestClassification: EmployerSkillClassification;
  latestEvidenceStrengthScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

const skillMemoryObservationSchema = new Schema<ISkillMemoryObservation>(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    skillIntelligenceId: { type: Schema.Types.ObjectId, ref: 'EmployerApplicationSkillIntelligence' },
    classification: {
      type: String,
      enum: {
        values: ['strong_evidence', 'supported', 'limited_evidence', 'missing', 'additional_candidate_skill'],
        message: '{VALUE} is not a valid skill classification',
      },
      required: true,
    },
    evidenceStrengthScore: { type: Number, min: 0, max: 100 },
    sourceTypes: { type: [String], default: [] },
    observedAt: { type: Date, required: true },
  },
  { _id: false }
);

const employerCandidateSkillMemorySchema = new Schema<IEmployerCandidateSkillMemory>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    skillNodeId: { type: Schema.Types.ObjectId, ref: 'EmployerSkillNode', required: true },
    observations: { type: [skillMemoryObservationSchema], default: [] },
    firstObservedAt: { type: Date, required: true },
    lastObservedAt: { type: Date, required: true },
    observationCount: { type: Number, required: true, min: 0 },
    latestClassification: {
      type: String,
      enum: {
        values: ['strong_evidence', 'supported', 'limited_evidence', 'missing', 'additional_candidate_skill'],
        message: '{VALUE} is not a valid skill classification',
      },
      required: true,
    },
    latestEvidenceStrengthScore: { type: Number, min: 0, max: 100 },
  },
  {
    timestamps: true,
    collection: 'employer_candidate_skill_memory',
  }
);

// Exactly one memory row per skill per candidate per organization, ever —
// reconciled/upserted in place on every refresh. Never shared across
// organizations (organizationId is always part of the scoping key).
employerCandidateSkillMemorySchema.index({ organizationId: 1, candidateId: 1, skillNodeId: 1 }, { unique: true });
employerCandidateSkillMemorySchema.index({ organizationId: 1, candidateId: 1 });

export default mongoose.model<IEmployerCandidateSkillMemory>('EmployerCandidateSkillMemory', employerCandidateSkillMemorySchema);
