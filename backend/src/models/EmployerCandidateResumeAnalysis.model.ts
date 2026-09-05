import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateResumeAnalysisStatus } from '../constants/employerCandidateResumeAnalysis';

/**
 * AI-parsed structured profile extracted from ONE immutable resume source
 * version (18C) — raw extraction only, never an evaluation/score/ranking,
 * and this never feeds back into EmployerCandidate automatically. The full
 * extracted resume text is deliberately NOT persisted here — only the
 * structured `profile` the AI produced.
 */
export interface ICandidateProfileName {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

export interface ICandidateProfileContact {
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

export interface ICandidateProfileExperience {
  company?: string;
  title?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  durationMonths?: number;
  responsibilities: string[];
  achievements: string[];
  technologies: string[];
}

export interface ICandidateProfileEducation {
  institution?: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface ICandidateProfileProject {
  name?: string;
  description?: string;
  technologies: string[];
}

export interface ICandidateProfileConfidence {
  overall: number;
  ambiguousSections: string[];
}

export interface ICandidateResumeProfile {
  name?: ICandidateProfileName;
  contact?: ICandidateProfileContact;
  headline?: string;
  summary?: string;
  totalExperienceYears?: number;
  experience: ICandidateProfileExperience[];
  education: ICandidateProfileEducation[];
  skills: string[];
  toolsTechnologies: string[];
  certifications: string[];
  projects: ICandidateProfileProject[];
  languages: string[];
  confidence: ICandidateProfileConfidence;
}

/** A safe subset of the AI Gateway's normalized usage metadata, plus cost computed via the existing shared pricing config — never a parallel pricing calculator. */
export interface IEmployerCandidateResumeAnalysisUsage {
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

export interface IEmployerCandidateResumeAnalysis extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  resumeSourceId: Types.ObjectId;
  resumeVersion: number;
  status: EmployerCandidateResumeAnalysisStatus;
  profile?: ICandidateResumeProfile;
  aiUsage?: IEmployerCandidateResumeAnalysisUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const nameSchema = new Schema<ICandidateProfileName>(
  {
    fullName: { type: String },
    firstName: { type: String },
    lastName: { type: String },
  },
  { _id: false }
);

const contactSchema = new Schema<ICandidateProfileContact>(
  {
    email: { type: String },
    phone: { type: String },
    location: { type: String },
    linkedinUrl: { type: String },
    githubUrl: { type: String },
    portfolioUrl: { type: String },
  },
  { _id: false }
);

const experienceSchema = new Schema<ICandidateProfileExperience>(
  {
    company: { type: String },
    title: { type: String },
    location: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    isCurrent: { type: Boolean },
    durationMonths: { type: Number },
    responsibilities: { type: [String], default: [] },
    achievements: { type: [String], default: [] },
    technologies: { type: [String], default: [] },
  },
  { _id: false }
);

const educationSchema = new Schema<ICandidateProfileEducation>(
  {
    institution: { type: String },
    degree: { type: String },
    field: { type: String },
    startYear: { type: Number },
    endYear: { type: Number },
  },
  { _id: false }
);

const projectSchema = new Schema<ICandidateProfileProject>(
  {
    name: { type: String },
    description: { type: String },
    technologies: { type: [String], default: [] },
  },
  { _id: false }
);

const confidenceSchema = new Schema<ICandidateProfileConfidence>(
  {
    overall: { type: Number, required: true, min: 0, max: 1 },
    ambiguousSections: { type: [String], default: [] },
  },
  { _id: false }
);

const profileSchema = new Schema<ICandidateResumeProfile>(
  {
    name: { type: nameSchema },
    contact: { type: contactSchema },
    headline: { type: String },
    summary: { type: String },
    totalExperienceYears: { type: Number },
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    skills: { type: [String], default: [] },
    toolsTechnologies: { type: [String], default: [] },
    certifications: { type: [String], default: [] },
    projects: { type: [projectSchema], default: [] },
    languages: { type: [String], default: [] },
    confidence: { type: confidenceSchema, required: true },
  },
  { _id: false }
);

const aiUsageSchema = new Schema<IEmployerCandidateResumeAnalysisUsage>(
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

const employerCandidateResumeAnalysisSchema = new Schema<IEmployerCandidateResumeAnalysis>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    resumeSourceId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateResumeSource',
      required: true,
    },
    resumeVersion: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerCandidateResumeAnalysisStatus), message: '{VALUE} is not a valid analysis status' },
      required: true,
    },
    profile: { type: profileSchema },
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
    collection: 'employer_candidate_resume_analyses',
  }
);

// The resume source version is immutable — exactly one analysis row per
// resume source version. This same unique index doubles as the concurrency
// claim: the FIRST `create()` for a given
// {organizationId, candidateId, resumeSourceId} wins; every concurrent
// duplicate throws E11000, which EmployerCandidateResumeAnalysisService uses
// to detect an in-flight/existing analysis rather than starting a second AI
// call.
employerCandidateResumeAnalysisSchema.index({ organizationId: 1, candidateId: 1, resumeSourceId: 1 }, { unique: true });
employerCandidateResumeAnalysisSchema.index({ organizationId: 1, candidateId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateResumeAnalysis>(
  'EmployerCandidateResumeAnalysis',
  employerCandidateResumeAnalysisSchema
);
