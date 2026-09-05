import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobSkillCategory, EmployerJobSkillRequirement, EmployerJobSkillProficiency, EmployerJobSkillImportance } from '../constants/employerJobDescriptionSkills';
import { EmployerJobCompetencyCategory, EmployerJobCompetencyImportance } from '../constants/employerJobDescriptionCompetencies';
import { IJobDescriptionSkill } from './EmployerJobDescriptionSkills.model';
import { IJobDescriptionCompetency } from './EmployerJobDescriptionCompetencies.model';

/**
 * The final, immutable JD intelligence snapshot for ONE JD source version
 * (17E) — a deterministic integration of the already-completed 17B
 * analysis, 17C skills, and 17D competencies. NO AI call happens here or
 * anywhere in this model's lifecycle; this is persistence/integration only.
 * Once created, a snapshot is never edited or deleted — there is no
 * PUT/update/delete path for it anywhere in this codebase. This is intended
 * as the stable source for LATER modules (candidate screening, ranking,
 * interview blueprint generation, matching) — none of which are
 * implemented in this sprint.
 */
export interface ISnapshotExperience {
  minYears?: number;
  maxYears?: number;
  description?: string;
}

export interface ISnapshotRole {
  jobTitle?: string;
  summary?: string;
  rolePurpose?: string;
  experience?: ISnapshotExperience;
  education: string[];
  domainKnowledge: string[];
  location?: string;
  workplaceType?: string;
  employmentType?: string;
}

export interface ISnapshotMetadata {
  sourceVersion: number;
  analysisConfidence?: number;
  skillCount: number;
  competencyCount: number;
  totalCompetencyWeight: number;
}

export interface IJobIntelligenceSnapshot {
  role: ISnapshotRole;
  /** Copied verbatim from the completed 17C skill set — never re-derived or rewritten here. */
  skills: IJobDescriptionSkill[];
  /** Copied verbatim from the completed 17D competency set — never re-derived or rewritten here. */
  competencies: IJobDescriptionCompetency[];
  metadata: ISnapshotMetadata;
}

export interface IEmployerJobIntelligenceSnapshot extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  jdSourceId: Types.ObjectId;
  jdVersion: number;
  analysisId: Types.ObjectId;
  skillsId: Types.ObjectId;
  competenciesId: Types.ObjectId;
  snapshot: IJobIntelligenceSnapshot;
  finalizedByMembershipId: Types.ObjectId;
  finalizedAt: Date;
  createdAt: Date;
}

const experienceSchema = new Schema<ISnapshotExperience>(
  { minYears: { type: Number }, maxYears: { type: Number }, description: { type: String } },
  { _id: false }
);

const roleSchema = new Schema<ISnapshotRole>(
  {
    jobTitle: { type: String },
    summary: { type: String },
    rolePurpose: { type: String },
    experience: { type: experienceSchema },
    education: { type: [String], default: [] },
    domainKnowledge: { type: [String], default: [] },
    location: { type: String },
    workplaceType: { type: String },
    employmentType: { type: String },
  },
  { _id: false }
);

// Mirrors EmployerJobDescriptionSkills.model.ts's skillSchema exactly — this
// is a COPY of already-validated 17C data, never re-validated/re-derived
// here, but the schema still needs to match the shape being stored.
const snapshotSkillSchema = new Schema<IJobDescriptionSkill>(
  {
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    category: { type: String, enum: Object.values(EmployerJobSkillCategory), required: true },
    requirement: { type: String, enum: Object.values(EmployerJobSkillRequirement), required: true },
    proficiency: { type: String, enum: Object.values(EmployerJobSkillProficiency), required: true },
    importance: { type: String, enum: Object.values(EmployerJobSkillImportance), required: true },
    evidence: { type: [String], default: [] },
    aliases: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

// Mirrors EmployerJobDescriptionCompetencies.model.ts's competencySchema
// exactly — a COPY of already-validated/weight-normalized 17D data.
const snapshotCompetencySchema = new Schema<IJobDescriptionCompetency>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, enum: Object.values(EmployerJobCompetencyCategory), required: true },
    importance: { type: String, enum: Object.values(EmployerJobCompetencyImportance), required: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    skillNames: { type: [String], default: [] },
    evidence: { type: [String], default: [] },
    interviewSignals: { type: [String], default: [] },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

const metadataSchema = new Schema<ISnapshotMetadata>(
  {
    sourceVersion: { type: Number, required: true },
    analysisConfidence: { type: Number },
    skillCount: { type: Number, required: true },
    competencyCount: { type: Number, required: true },
    totalCompetencyWeight: { type: Number, required: true },
  },
  { _id: false }
);

const snapshotSchema = new Schema<IJobIntelligenceSnapshot>(
  {
    role: { type: roleSchema, required: true },
    skills: { type: [snapshotSkillSchema], default: [] },
    competencies: { type: [snapshotCompetencySchema], default: [] },
    metadata: { type: metadataSchema, required: true },
  },
  { _id: false }
);

const employerJobIntelligenceSnapshotSchema = new Schema<IEmployerJobIntelligenceSnapshot>(
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
    competenciesId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobDescriptionCompetencies',
      required: true,
    },
    snapshot: { type: snapshotSchema, required: true },
    finalizedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    finalizedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // No updatedAt — a finalized snapshot is immutable; it is never edited
    // after creation, so there is nothing for updatedAt to ever reflect.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_job_intelligence_snapshots',
  }
);

// The source version is immutable — exactly one snapshot per JD source
// version, ever. This unique index is ALSO the sole concurrency guard: the
// first `create()` for a given {organizationId, jobId, jdSourceId} wins;
// every concurrent duplicate throws E11000, which
// EmployerJobIntelligenceSnapshotService catches to return the
// already-created snapshot instead of erroring or creating a second row.
employerJobIntelligenceSnapshotSchema.index({ organizationId: 1, jobId: 1, jdSourceId: 1 }, { unique: true });
employerJobIntelligenceSnapshotSchema.index({ organizationId: 1, jobId: 1, jdVersion: 1 });
employerJobIntelligenceSnapshotSchema.index({ organizationId: 1, jobId: 1, finalizedAt: -1 });

export default mongoose.model<IEmployerJobIntelligenceSnapshot>(
  'EmployerJobIntelligenceSnapshot',
  employerJobIntelligenceSnapshotSchema
);
