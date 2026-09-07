import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) organization-scoped consolidated talent profile
 * for ONE candidate (32A) — unifies evidence ALREADY persisted across that
 * candidate's own applications/assessments within THIS exact organization.
 * Never a ranking, never a hiring recommendation, never a numeric overall
 * talent score. Employer-internal only — never exposed through any
 * candidate/public API.
 */
export interface ITalentProfileIdentity {
  candidateId: Types.ObjectId;
  displayName?: string;
  primaryEmail?: string;
}

export interface ITalentProfileApplicationSummary {
  totalApplications: number;
  activeApplications: number;
  completedApplications: number;
  hiredApplications: number;
  rejectedApplications: number;
}

export interface ITalentProfileAssessmentSummary {
  interviewCount: number;
  completedInterviewCount: number;
  scenarioAssessmentCount: number;
  codingAssessmentCount: number;
}

export interface ITalentProfileSkill {
  skillName: string;
  evidenceCount: number;
  latestEvidenceAt?: Date;
  sourceTypes: string[];
}

export interface ITalentProfileCompetencyStates {
  strong: number;
  sufficient: number;
  partial: number;
  insufficient: number;
  notObserved: number;
}

export type TalentProfileEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';

export interface ITalentProfileCompetency {
  competencyName: string;
  evidenceCount: number;
  states: ITalentProfileCompetencyStates;
  latestEvidenceState?: TalentProfileEvidenceState;
  latestEvidenceAt?: Date;
  sourceTypes: string[];
}

export interface ITalentProfileAssessmentSources {
  standardInterviewCount: number;
  scenarioCount: number;
  codingCount: number;
  knowledgeGroundedCount: number;
}

export interface ITalentProfileTimeline {
  firstApplicationAt?: Date;
  latestActivityAt?: Date;
}

export interface IEmployerUnifiedTalentProfile extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  profileVersion: string;
  generatedAt: Date;
  identity: ITalentProfileIdentity;
  applicationSummary: ITalentProfileApplicationSummary;
  assessmentSummary: ITalentProfileAssessmentSummary;
  skills: ITalentProfileSkill[];
  competencies: ITalentProfileCompetency[];
  assessmentSources: ITalentProfileAssessmentSources;
  timeline: ITalentProfileTimeline;
  createdAt: Date;
  updatedAt: Date;
}

const identitySchema = new Schema<ITalentProfileIdentity>(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    displayName: { type: String, trim: true, maxlength: [200, 'displayName cannot exceed 200 characters'] },
    primaryEmail: { type: String, trim: true, maxlength: [254, 'primaryEmail cannot exceed 254 characters'] },
  },
  { _id: false }
);

const applicationSummarySchema = new Schema<ITalentProfileApplicationSummary>(
  {
    totalApplications: { type: Number, required: true, min: 0 },
    activeApplications: { type: Number, required: true, min: 0 },
    completedApplications: { type: Number, required: true, min: 0 },
    hiredApplications: { type: Number, required: true, min: 0 },
    rejectedApplications: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const assessmentSummarySchema = new Schema<ITalentProfileAssessmentSummary>(
  {
    interviewCount: { type: Number, required: true, min: 0 },
    completedInterviewCount: { type: Number, required: true, min: 0 },
    scenarioAssessmentCount: { type: Number, required: true, min: 0 },
    codingAssessmentCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const skillSchema = new Schema<ITalentProfileSkill>(
  {
    skillName: { type: String, required: true, trim: true, maxlength: [200, 'skillName cannot exceed 200 characters'] },
    evidenceCount: { type: Number, required: true, min: 0 },
    latestEvidenceAt: { type: Date },
    sourceTypes: { type: [String], default: [] },
  },
  { _id: false }
);

const competencyStatesSchema = new Schema<ITalentProfileCompetencyStates>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    sufficient: { type: Number, required: true, min: 0, default: 0 },
    partial: { type: Number, required: true, min: 0, default: 0 },
    insufficient: { type: Number, required: true, min: 0, default: 0 },
    notObserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const competencySchema = new Schema<ITalentProfileCompetency>(
  {
    competencyName: { type: String, required: true, trim: true, maxlength: [200, 'competencyName cannot exceed 200 characters'] },
    evidenceCount: { type: Number, required: true, min: 0 },
    states: { type: competencyStatesSchema, required: true },
    latestEvidenceState: { type: String, enum: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'] },
    latestEvidenceAt: { type: Date },
    sourceTypes: { type: [String], default: [] },
  },
  { _id: false }
);

const assessmentSourcesSchema = new Schema<ITalentProfileAssessmentSources>(
  {
    standardInterviewCount: { type: Number, required: true, min: 0 },
    scenarioCount: { type: Number, required: true, min: 0 },
    codingCount: { type: Number, required: true, min: 0 },
    knowledgeGroundedCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const timelineSchema = new Schema<ITalentProfileTimeline>(
  {
    firstApplicationAt: { type: Date },
    latestActivityAt: { type: Date },
  },
  { _id: false }
);

const employerUnifiedTalentProfileSchema = new Schema<IEmployerUnifiedTalentProfile>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    profileVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    identity: { type: identitySchema, required: true },
    applicationSummary: { type: applicationSummarySchema, required: true },
    assessmentSummary: { type: assessmentSummarySchema, required: true },
    skills: { type: [skillSchema], default: [] },
    competencies: { type: [competencySchema], default: [] },
    assessmentSources: { type: assessmentSourcesSchema, required: true },
    timeline: { type: timelineSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_unified_talent_profiles',
  }
);

employerUnifiedTalentProfileSchema.index({ organizationId: 1, candidateId: 1 }, { unique: true });

export default mongoose.model<IEmployerUnifiedTalentProfile>('EmployerUnifiedTalentProfile', employerUnifiedTalentProfileSchema);
