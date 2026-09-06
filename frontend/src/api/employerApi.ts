/**
 * Employer / Company Profile API Service (Sprint 16A)
 *
 * Handles calls to the backend's dedicated company-profile endpoints.
 * Mirrors instituteApi.ts's conventions exactly (auth-token interceptor,
 * per-method try/catch with a fallback message). Maps 1:1 to the existing
 * `GET/PUT /organizations/:organizationId/company-profile` routes — no
 * endpoint is invented, and this is entirely separate from the generic
 * `companyProfile` fragment nested inside organizationApi.ts's
 * OrganizationDetail (that stays read-only/legacy; this is the editable,
 * company/hiring-specific profile surface).
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

export const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-1000', label: '201-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

export interface CompanyProfile {
  industry?: string;
  companySize?: string;
  establishedYear?: number;
  officialName?: string;
  companyCode?: string;
  description?: string;
  website?: string;
  careersUrl?: string;
  headquarters?: string;
  linkedinUrl?: string;
  hiringEmail?: string;
  hiringPhone?: string;
}

export interface CompanyProfileResult {
  organization: { id: string; name: string; slug: string; status: string };
  profile: CompanyProfile;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type GetCompanyProfileResponse = ApiEnvelope<CompanyProfileResult>;
export type UpdateCompanyProfileResponse = ApiEnvelope<CompanyProfileResult>;

// ============================================================================
// Employer Jobs (Sprint 16B) — company-only job postings. Field names/shapes
// confirmed directly from EmployerJobService/EmployerJobController.
// ============================================================================

export type EmployerJobStatus = 'draft' | 'open' | 'paused' | 'closed' | 'archived';
export type EmployerJobWorkplaceType = 'onsite' | 'hybrid' | 'remote';
export type EmployerJobEmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'other';

export const EMPLOYER_JOB_WORKPLACE_TYPES: Array<{ value: EmployerJobWorkplaceType; label: string }> = [
  { value: 'onsite', label: 'Onsite' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];

export const EMPLOYER_JOB_EMPLOYMENT_TYPES: Array<{ value: EmployerJobEmploymentType; label: string }> = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'other', label: 'Other' },
];

/**
 * Mirrors the backend's EMPLOYER_JOB_STATUS_TRANSITIONS exactly — used only
 * to decide which status-action buttons to render. The backend remains the
 * sole authority and re-validates every transition independently; this is
 * never trusted as the actual gate.
 */
export const EMPLOYER_JOB_STATUS_TRANSITIONS: Record<EmployerJobStatus, EmployerJobStatus[]> = {
  draft: ['open', 'archived'],
  open: ['paused', 'closed', 'archived'],
  paused: ['open', 'closed', 'archived'],
  closed: ['archived'],
  archived: [],
};

export interface EmployerJob {
  id: string;
  organizationId: string;
  title: string;
  jobCode?: string;
  department?: string;
  location?: string;
  workplaceType?: EmployerJobWorkplaceType;
  employmentType?: EmployerJobEmploymentType;
  experienceMinYears?: number;
  experienceMaxYears?: number;
  openings?: number;
  description?: string;
  responsibilities?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applicationDeadline?: string;
  status: EmployerJobStatus;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

/** Create/update payload — never includes organizationId/createdByMembershipId/status/timestamps; the backend rejects those fields outright. */
export interface EmployerJobPayload {
  title?: string;
  jobCode?: string;
  department?: string;
  location?: string;
  workplaceType?: EmployerJobWorkplaceType;
  employmentType?: EmployerJobEmploymentType;
  experienceMinYears?: number;
  experienceMaxYears?: number;
  openings?: number;
  description?: string;
  responsibilities?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applicationDeadline?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export type ListJobsResponse = ApiEnvelope<{ jobs: EmployerJob[]; pagination: Pagination }>;
export type GetJobResponse = ApiEnvelope<{ job: EmployerJob }>;
export type CreateJobResponse = ApiEnvelope<{ job: EmployerJob }>;
export type UpdateJobResponse = ApiEnvelope<{ job: EmployerJob }>;
export type UpdateJobStatusResponse = ApiEnvelope<{ job: EmployerJob }>;

// ============================================================================
// Job Status History (Sprint 16C) — audit-only read. Never the source of the
// job's current status (that's always EmployerJob.status itself).
// ============================================================================

export interface EmployerJobStatusHistoryRow {
  id: string;
  fromStatus: EmployerJobStatus;
  toStatus: EmployerJobStatus;
  changedByMembershipId: string;
  changedAt: string;
  note?: string;
}

export type ListJobStatusHistoryResponse = ApiEnvelope<{ history: EmployerJobStatusHistoryRow[]; pagination: Pagination }>;

// ============================================================================
// Job Hiring Team (Sprint 16D) — job-LOCAL role assignments over existing,
// active, same-organization members. Never creates a member and never
// changes the member's organization-wide role/status.
// ============================================================================

export type EmployerJobHiringTeamRole = 'hiring_manager' | 'recruiter' | 'interviewer' | 'viewer';

export const EMPLOYER_JOB_HIRING_TEAM_ROLES: Array<{ value: EmployerJobHiringTeamRole; label: string }> = [
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'interviewer', label: 'Interviewer' },
  { value: 'viewer', label: 'Viewer' },
];

export interface HiringTeamMember {
  id: string;
  membershipId: string;
  role: EmployerJobHiringTeamRole;
  member?: {
    name?: string;
    email?: string;
    organizationRole: string;
    status: string;
  };
  addedByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

/** Minimal, safe row for the add-member dropdown — never broader member metadata. */
export interface AvailableMember {
  id: string;
  name?: string;
  email?: string;
  organizationRole: string;
}

export type ListHiringTeamResponse = ApiEnvelope<{ hiringTeam: HiringTeamMember[] }>;
export type ListAvailableMembersResponse = ApiEnvelope<{ members: AvailableMember[] }>;
export type AddHiringTeamMemberResponse = ApiEnvelope<{ teamMember: HiringTeamMember }>;
export type UpdateHiringTeamMemberResponse = ApiEnvelope<{ teamMember: HiringTeamMember }>;

// ============================================================================
// Job Description Intake (Sprint 17A) — raw JD text + versioning ONLY. No AI
// parsing/skill extraction/competency generation happens anywhere here.
// ============================================================================

export type EmployerJobDescriptionSourceType = 'pasted' | 'manual';

export interface JobDescriptionSource {
  id: string;
  jobId: string;
  rawText: string;
  sourceType: EmployerJobDescriptionSourceType;
  version: number;
  isCurrent: boolean;
  createdByMembershipId: string;
  createdAt: string;
}

export type GetJobDescriptionResponse = ApiEnvelope<{ current: JobDescriptionSource | null; history: JobDescriptionSource[] }>;
export type GetJobDescriptionSourceResponse = ApiEnvelope<{ source: JobDescriptionSource }>;
export type CreateJobDescriptionSourceResponse = ApiEnvelope<{ source: JobDescriptionSource }>;

// ============================================================================
// Job Description Analysis (Sprint 17B) — structured, AI-parsed understanding
// of ONE JD source version. Raw understanding only: `technicalKeywords`/
// `toolsTechnologies`/`softSkillKeywords` are raw parsed concepts, NOT the
// canonical/scored skill taxonomy (later sprint) or competencies.
// ============================================================================

export type EmployerJobDescriptionAnalysisStatus = 'processing' | 'completed' | 'failed';

export interface JobDescriptionAnalysisRequirements {
  mandatory: string[];
  preferred: string[];
}

export interface JobDescriptionAnalysisExperience {
  minYears?: number;
  maxYears?: number;
  description?: string;
}

export interface JobDescriptionAnalysisCompensation {
  min?: number;
  max?: number;
  currency?: string;
  rawText?: string;
}

export interface JobDescriptionAnalysisConfidence {
  overall: number;
  ambiguousSections: string[];
}

export interface JobDescriptionAnalysis {
  jobTitle?: string;
  summary?: string;
  rolePurpose?: string;
  responsibilities: string[];
  requirements: JobDescriptionAnalysisRequirements;
  experience: JobDescriptionAnalysisExperience;
  education: string[];
  domainKnowledge: string[];
  technicalKeywords: string[];
  toolsTechnologies: string[];
  softSkillKeywords: string[];
  location?: string;
  workplaceType?: string;
  employmentType?: string;
  compensation?: JobDescriptionAnalysisCompensation;
  confidence: JobDescriptionAnalysisConfidence;
}

export interface JobDescriptionAnalysisUsage {
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

export interface JobDescriptionAnalysisRecord {
  id: string;
  jobId: string;
  jdSourceId: string;
  jdVersion: number;
  status: EmployerJobDescriptionAnalysisStatus;
  analysis: JobDescriptionAnalysis | null;
  aiUsage: JobDescriptionAnalysisUsage | null;
  errorMessage?: string;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export type AnalyzeJobDescriptionResponse = ApiEnvelope<{ analysis: JobDescriptionAnalysisRecord }>;
export type GetJobDescriptionAnalysisResponse = ApiEnvelope<{ analysis: JobDescriptionAnalysisRecord | null }>;

// ============================================================================
// Job Description Skill Extraction (Sprint 17C) — normalized, JD-version-
// local skill set derived from an already-COMPLETED 17B analysis. This is
// NOT a global/cross-company skill catalog and never feeds interview
// competency weights (17D).
// ============================================================================

export type EmployerJobDescriptionSkillsStatus = 'processing' | 'completed' | 'failed';
export type EmployerJobSkillCategory = 'technical' | 'tool' | 'domain' | 'soft_skill' | 'methodology' | 'other';
export type EmployerJobSkillRequirement = 'mandatory' | 'preferred' | 'inferred';
export type EmployerJobSkillProficiency = 'foundational' | 'intermediate' | 'advanced' | 'expert' | 'unspecified';
export type EmployerJobSkillImportance = 'critical' | 'high' | 'medium' | 'low';

export interface JobDescriptionSkill {
  name: string;
  normalizedName: string;
  category: EmployerJobSkillCategory;
  requirement: EmployerJobSkillRequirement;
  proficiency: EmployerJobSkillProficiency;
  importance: EmployerJobSkillImportance;
  evidence: string[];
  aliases: string[];
  confidence: number;
}

/** Same shape as JobDescriptionAnalysisUsage (17B) — one AI call per extraction. */
export type JobDescriptionSkillsUsage = JobDescriptionAnalysisUsage;

export interface JobDescriptionSkillsRecord {
  id: string;
  jdSourceId: string;
  jdVersion: number;
  analysisId: string;
  status: EmployerJobDescriptionSkillsStatus;
  skills: JobDescriptionSkill[];
  aiUsage: JobDescriptionSkillsUsage | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExtractJobDescriptionSkillsResponse = ApiEnvelope<{ skills: JobDescriptionSkillsRecord }>;
export type GetJobDescriptionSkillsResponse = ApiEnvelope<{ skills: JobDescriptionSkillsRecord | null }>;

// ============================================================================
// Job Description Competency Generation (Sprint 17D) — job/JD-version
// competency blueprint derived from an already-COMPLETED 17B analysis + 17C
// skills. NOT an interview-question/assessment blueprint, NOT candidate
// scoring, and NOT a global/cross-company competency catalog.
// ============================================================================

export type EmployerJobDescriptionCompetenciesStatus = 'processing' | 'completed' | 'failed';
export type EmployerJobCompetencyCategory =
  | 'technical'
  | 'problem_solving'
  | 'system_design'
  | 'communication'
  | 'leadership'
  | 'domain'
  | 'execution'
  | 'collaboration'
  | 'other';
export type EmployerJobCompetencyImportance = 'critical' | 'high' | 'medium' | 'low';

export interface JobDescriptionCompetency {
  name: string;
  description: string;
  category: EmployerJobCompetencyCategory;
  importance: EmployerJobCompetencyImportance;
  /** 0-100; the full completed competency set always sums to exactly 100 (backend-normalized). */
  weight: number;
  skillNames: string[];
  evidence: string[];
  /** Observable evidence an interviewer should look for — NOT interview questions. */
  interviewSignals: string[];
  confidence: number;
}

/** Same shape as JobDescriptionAnalysisUsage (17B/17C) — one AI call per generation. */
export type JobDescriptionCompetenciesUsage = JobDescriptionAnalysisUsage;

export interface JobDescriptionCompetenciesRecord {
  id: string;
  jdSourceId: string;
  jdVersion: number;
  analysisId: string;
  skillsId: string;
  status: EmployerJobDescriptionCompetenciesStatus;
  competencies: JobDescriptionCompetency[];
  aiUsage: JobDescriptionCompetenciesUsage | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type GenerateJobDescriptionCompetenciesResponse = ApiEnvelope<{ competencies: JobDescriptionCompetenciesRecord }>;
export type GetJobDescriptionCompetenciesResponse = ApiEnvelope<{ competencies: JobDescriptionCompetenciesRecord | null }>;

// ============================================================================
// Job Intelligence Finalization (Sprint 17E) — deterministic, NO-AI
// persistence of an immutable snapshot integrating the already-completed
// 17B analysis + 17C skills + 17D competencies for one JD version. Intended
// as the future stable read source for candidate screening/ranking/
// interview-blueprint generation/matching — none of which exist yet.
// ============================================================================

export interface JobIntelligenceSnapshotExperience {
  minYears?: number;
  maxYears?: number;
  description?: string;
}

export interface JobIntelligenceSnapshotRole {
  jobTitle?: string;
  summary?: string;
  rolePurpose?: string;
  experience?: JobIntelligenceSnapshotExperience;
  education: string[];
  domainKnowledge: string[];
  location?: string;
  workplaceType?: string;
  employmentType?: string;
}

export interface JobIntelligenceSnapshotMetadata {
  sourceVersion: number;
  analysisConfidence?: number;
  skillCount: number;
  competencyCount: number;
  totalCompetencyWeight: number;
}

export interface JobIntelligenceSnapshotContent {
  role: JobIntelligenceSnapshotRole;
  /** Copied verbatim from the completed 17C skill set. */
  skills: JobDescriptionSkill[];
  /** Copied verbatim from the completed 17D competency set. */
  competencies: JobDescriptionCompetency[];
  metadata: JobIntelligenceSnapshotMetadata;
}

export interface JobIntelligenceSnapshotRecord {
  id: string;
  jobId: string;
  jdSourceId: string;
  jdVersion: number;
  analysisId: string;
  skillsId: string;
  competenciesId: string;
  snapshot: JobIntelligenceSnapshotContent;
  finalizedByMembershipId: string;
  finalizedAt: string;
  createdAt: string;
}

/** DB-derived only — never a client-side guess. */
export interface JobIntelligenceReadiness {
  jdExists: boolean;
  analysisCompleted: boolean;
  skillsCompleted: boolean;
  competenciesCompleted: boolean;
  finalized: boolean;
}

export type GetCurrentJobIntelligenceResponse = ApiEnvelope<{
  snapshot: JobIntelligenceSnapshotRecord | null;
  readiness: JobIntelligenceReadiness;
}>;
export type GetJobIntelligenceResponse = ApiEnvelope<{ snapshot: JobIntelligenceSnapshotRecord | null }>;
export type FinalizeJobIntelligenceResponse = ApiEnvelope<{ snapshot: JobIntelligenceSnapshotRecord }>;

// ============================================================================
// Employer Candidates (Sprint 18A) — company-only, manually-entered
// candidate metadata. No resume upload/parsing (18B/18C), no job/
// application linkage (18D), no screening/ranking, no AI.
// ============================================================================

export type EmployerCandidateSource = 'manual' | 'referral' | 'careers' | 'agency' | 'job_portal' | 'import' | 'other';
export type EmployerCandidateStatus = 'active' | 'inactive' | 'archived';

export const EMPLOYER_CANDIDATE_SOURCES: Array<{ value: EmployerCandidateSource; label: string }> = [
  { value: 'manual', label: 'Manual Entry' },
  { value: 'referral', label: 'Referral' },
  { value: 'careers', label: 'Careers Page' },
  { value: 'agency', label: 'Agency' },
  { value: 'job_portal', label: 'Job Portal' },
  { value: 'import', label: 'Import' },
  { value: 'other', label: 'Other' },
];

/**
 * Mirrors the backend's EMPLOYER_CANDIDATE_STATUS_TRANSITIONS exactly —
 * used only to decide which status-action buttons to render. The backend
 * remains the sole authority and re-validates every transition
 * independently; this is never trusted as the actual gate.
 */
export const EMPLOYER_CANDIDATE_STATUS_TRANSITIONS: Record<EmployerCandidateStatus, EmployerCandidateStatus[]> = {
  active: ['inactive', 'archived'],
  inactive: ['active', 'archived'],
  archived: ['active'],
};

export interface EmployerCandidate {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  location?: string;
  totalExperienceYears?: number;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  noticePeriodDays?: number;
  currentSalary?: number;
  expectedSalary?: number;
  salaryCurrency?: string;
  source: EmployerCandidateSource;
  status: EmployerCandidateStatus;
  notes?: string;
  tags?: string[];
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

/** Create/update payload — never includes organizationId/createdByMembershipId/status/timestamps; the backend rejects those fields outright. */
export interface EmployerCandidatePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  currentCompany?: string;
  currentTitle?: string;
  location?: string;
  totalExperienceYears?: number;
  linkedinUrl?: string;
  portfolioUrl?: string;
  githubUrl?: string;
  noticePeriodDays?: number;
  currentSalary?: number;
  expectedSalary?: number;
  salaryCurrency?: string;
  source?: EmployerCandidateSource;
  notes?: string;
  tags?: string[];
}

/** Optional, create-only (18E) — if supplied, the backend appends ONE source-attribution record for the same `source` the candidate is created with. Never accepted on update. */
export interface CandidateSourceDetails {
  sourceName?: string;
  externalReferenceId?: string;
  referrerName?: string;
  referrerEmail?: string;
  agencyName?: string;
  jobPortalName?: string;
  campaignName?: string;
  sourceUrl?: string;
}

export interface EmployerCandidateCreatePayload extends EmployerCandidatePayload {
  sourceDetails?: CandidateSourceDetails;
}

export type ListCandidatesResponse = ApiEnvelope<{ candidates: EmployerCandidate[]; pagination: Pagination }>;
export type GetCandidateResponse = ApiEnvelope<{ candidate: EmployerCandidate }>;
export type CreateCandidateResponse = ApiEnvelope<{ candidate: EmployerCandidate }>;
export type UpdateCandidateResponse = ApiEnvelope<{ candidate: EmployerCandidate }>;
export type UpdateCandidateStatusResponse = ApiEnvelope<{ candidate: EmployerCandidate }>;

// ============================================================================
// Employer Candidate Resumes (Sprint 18B) — resume FILE storage and
// versioning only. No AI parsing/text extraction (18C), no application/job
// linkage, no screening/ranking.
// ============================================================================

export type EmployerCandidateResumeSourceType = 'upload';

/** UX-only convenience — the backend remains the sole authority on what it actually accepts. */
export const CANDIDATE_RESUME_ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];
export const CANDIDATE_RESUME_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface CandidateResume {
  id: string;
  candidateId: string;
  version: number;
  isCurrent: boolean;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  sourceType: EmployerCandidateResumeSourceType;
  uploadedByMembershipId: string;
  createdAt: string;
}

export type GetCandidateResumesResponse = ApiEnvelope<{ current: CandidateResume | null; history: CandidateResume[] }>;
export type GetCandidateResumeResponse = ApiEnvelope<{ resume: CandidateResume }>;
export type UploadCandidateResumeResponse = ApiEnvelope<{ resume: CandidateResume }>;

// ============================================================================
// Employer Candidate Resume Analysis (Sprint 18C) — AI-parsed structured
// profile extracted from one resume version. Raw extraction only — no
// evaluation/scoring/ranking, and this is never auto-synced into the
// candidate's own fields.
// ============================================================================

export type EmployerCandidateResumeAnalysisStatus = 'processing' | 'completed' | 'failed';

export interface CandidateProfileName {
  fullName?: string;
  firstName?: string;
  lastName?: string;
}

export interface CandidateProfileContact {
  email?: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
}

export interface CandidateProfileExperience {
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

export interface CandidateProfileEducation {
  institution?: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CandidateProfileProject {
  name?: string;
  description?: string;
  technologies: string[];
}

export interface CandidateProfileConfidence {
  overall: number;
  ambiguousSections: string[];
}

export interface CandidateResumeProfile {
  name?: CandidateProfileName;
  contact?: CandidateProfileContact;
  headline?: string;
  summary?: string;
  totalExperienceYears?: number;
  experience: CandidateProfileExperience[];
  education: CandidateProfileEducation[];
  skills: string[];
  toolsTechnologies: string[];
  certifications: string[];
  projects: CandidateProfileProject[];
  languages: string[];
  confidence: CandidateProfileConfidence;
}

export interface CandidateResumeAiUsage {
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

export interface CandidateResumeAnalysis {
  id: string;
  candidateId: string;
  resumeSourceId: string;
  resumeVersion: number;
  status: EmployerCandidateResumeAnalysisStatus;
  profile: CandidateResumeProfile | null;
  aiUsage: CandidateResumeAiUsage | null;
  errorMessage?: string;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export type AnalyzeCandidateResumeResponse = ApiEnvelope<{ analysis: CandidateResumeAnalysis }>;
export type GetCurrentCandidateResumeAnalysisResponse = ApiEnvelope<{ analysis: CandidateResumeAnalysis | null }>;
export type GetCandidateResumeAnalysisResponse = ApiEnvelope<{ analysis: CandidateResumeAnalysis | null }>;

// ============================================================================
// Employer Job Applications (Sprint 18D) — links an existing candidate to
// an existing job within one organization. No screening/ranking (19), no
// interview blueprint/invitations (20), no AI.
// ============================================================================

export type EmployerJobApplicationSource = 'manual' | 'careers' | 'referral' | 'agency' | 'job_portal' | 'import' | 'other';
export type EmployerJobApplicationStatus =
  | 'applied'
  | 'screening'
  | 'shortlisted'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export const EMPLOYER_JOB_APPLICATION_SOURCES: Array<{ value: EmployerJobApplicationSource; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'careers', label: 'Careers Page' },
  { value: 'referral', label: 'Referral' },
  { value: 'agency', label: 'Agency' },
  { value: 'job_portal', label: 'Job Portal' },
  { value: 'import', label: 'Import' },
  { value: 'other', label: 'Other' },
];

/** Mirrors the backend's EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS exactly — used only to decide which status-action buttons to render. The backend remains the sole authority and re-validates every transition independently. */
export const EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS: Record<EmployerJobApplicationStatus, EmployerJobApplicationStatus[]> = {
  applied: ['screening', 'rejected', 'withdrawn', 'archived'],
  screening: ['shortlisted', 'rejected', 'withdrawn', 'archived'],
  shortlisted: ['interview', 'rejected', 'withdrawn', 'archived'],
  interview: ['offer', 'rejected', 'withdrawn', 'archived'],
  offer: ['hired', 'rejected', 'withdrawn', 'archived'],
  hired: ['archived'],
  rejected: ['archived'],
  withdrawn: ['archived'],
  archived: [],
};

export interface EmployerJobApplicationJobRef {
  id: string;
  title: string;
  jobCode?: string;
  status: string;
}

export interface EmployerJobApplicationCandidateRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
}

export interface EmployerJobApplication {
  id: string;
  organizationId: string;
  jobId: string;
  candidateId: string;
  job: EmployerJobApplicationJobRef | null;
  candidate: EmployerJobApplicationCandidateRef | null;
  status: EmployerJobApplicationStatus;
  source: EmployerJobApplicationSource;
  appliedAt: string;
  notes?: string;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerJobApplicationCreatePayload {
  jobId: string;
  candidateId: string;
  source?: EmployerJobApplicationSource;
  notes?: string;
}

/** Never includes jobId/candidateId/status/organizationId/createdByMembershipId/timestamps — those aren't part of this form at all. */
export interface EmployerJobApplicationUpdatePayload {
  notes?: string;
  source?: EmployerJobApplicationSource;
}

export type ListApplicationsResponse = ApiEnvelope<{ applications: EmployerJobApplication[]; pagination: Pagination }>;
export type GetApplicationResponse = ApiEnvelope<{ application: EmployerJobApplication }>;
export type CreateApplicationResponse = ApiEnvelope<{ application: EmployerJobApplication }>;
export type UpdateApplicationResponse = ApiEnvelope<{ application: EmployerJobApplication }>;
export type UpdateApplicationStatusResponse = ApiEnvelope<{ application: EmployerJobApplication }>;

// ============================================================================
// Employer Candidate Source Attribution (Sprint 18E) — historical
// provenance evidence for how a candidate entered the company's talent
// pool. NEVER a replacement for EmployerCandidate.source (the candidate's
// own current PRIMARY source) and NEVER the same thing as
// EmployerJobApplication.source (which describes one specific job
// application). Append-only — there is no update/delete endpoint.
// ============================================================================

export interface CandidateSourceAttribution {
  id: string;
  candidateId: string;
  source: EmployerCandidateSource;
  sourceName?: string;
  externalReferenceId?: string;
  referrerName?: string;
  referrerEmail?: string;
  agencyName?: string;
  jobPortalName?: string;
  campaignName?: string;
  sourceUrl?: string;
  notes?: string;
  recordedByMembershipId: string;
  createdAt: string;
}

/** Never includes organizationId/candidateId/recordedByMembershipId/createdAt — those aren't part of this form at all. */
export interface CandidateSourceAttributionCreatePayload {
  source: EmployerCandidateSource;
  sourceName?: string;
  externalReferenceId?: string;
  referrerName?: string;
  referrerEmail?: string;
  agencyName?: string;
  jobPortalName?: string;
  campaignName?: string;
  sourceUrl?: string;
  notes?: string;
}

export type ListCandidateSourceAttributionsResponse = ApiEnvelope<{ attributions: CandidateSourceAttribution[] }>;
export type GetCandidateSourceAttributionResponse = ApiEnvelope<{ attribution: CandidateSourceAttribution }>;
export type CreateCandidateSourceAttributionResponse = ApiEnvelope<{ attribution: CandidateSourceAttribution }>;

// ============================================================================
// Employer Candidate Screening (Sprint 19A) — compares one job
// application's candidate resume analysis against the job's FINALIZED JD
// Intelligence Snapshot (17E). No ranking across candidates (19D), no
// shortlist automation (19E), no interview generation.
// ============================================================================

export type EmployerCandidateScreeningStatus = 'processing' | 'completed' | 'failed';
export type EmployerCandidateScreeningRecommendation = 'strong_match' | 'match' | 'borderline' | 'weak_match';

export interface ScreeningSkillMatch {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  partialSkills: string[];
}

export interface ScreeningCompetencyMatch {
  competencyName: string;
  score: number;
  evidence: string[];
}

export interface ScreeningExperienceMatch {
  score: number;
  summary?: string;
}

export interface ScreeningEducationMatch {
  score: number;
  summary?: string;
}

export interface ScreeningResult {
  overallScore: number;
  recommendation: EmployerCandidateScreeningRecommendation;
  skillMatch: ScreeningSkillMatch;
  competencyMatch: ScreeningCompetencyMatch[];
  experienceMatch: ScreeningExperienceMatch;
  educationMatch: ScreeningEducationMatch;
  strengths: string[];
  concerns: string[];
  confidence: number;
}

export interface ApplicationScreening {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  jdSnapshotId: string;
  resumeAnalysisId: string;
  status: EmployerCandidateScreeningStatus;
  result: ScreeningResult | null;
  /** Same shape as a resume analysis's aiUsage — reused rather than redefined. */
  aiUsage: CandidateResumeAiUsage | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScreenApplicationResponse = ApiEnvelope<{ screening: ApplicationScreening }>;
export type GetApplicationScreeningResponse = ApiEnvelope<{ screening: ApplicationScreening | null }>;

// ============================================================================
// Explainable Candidate Score (Sprint 19B) — a deterministic, fixed-formula
// breakdown of an already-COMPLETED screening. This is a SEPARATE, distinct
// number from `ApplicationScreening.result.overallScore` (the AI screening
// score) — never a replacement for it. No ranking (19D), no gap engine
// beyond this breakdown (19C), no shortlist automation (19E).
// ============================================================================

export interface ScreeningScoreComponent {
  score: number;
  weight: number;
  contribution: number;
}

export interface ScreeningScoreCompetencyBreakdown {
  name: string;
  jdWeight: number;
  matchScore: number;
  weightedContribution: number;
  evidence: string[];
}

export interface ScreeningScore {
  overallScore: number;
  components: {
    skills: ScreeningScoreComponent;
    competencies: ScreeningScoreComponent;
    experience: ScreeningScoreComponent;
    education: ScreeningScoreComponent;
  };
  competencyBreakdown: ScreeningScoreCompetencyBreakdown[];
  calculationVersion: string;
}

export interface ApplicationScreeningScore {
  id: string;
  screeningId: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  jdSnapshotId: string;
  resumeAnalysisId: string;
  score: ScreeningScore;
  createdAt: string;
}

export type CalculateApplicationScreeningScoreResponse = ApiEnvelope<{ score: ApplicationScreeningScore }>;
export type GetApplicationScreeningScoreResponse = ApiEnvelope<{ score: ApplicationScreeningScore | null }>;

// ============================================================================
// Candidate Skill & Requirement Gap Analysis (Sprint 19C) — a deterministic
// breakdown derived from an already-COMPLETED screening's own result, its
// 19B explainable score, and the exact finalized JD snapshot. Informational
// only. No ranking (19D), no shortlist automation (19E).
// ============================================================================

export type EmployerCandidateGapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type EmployerCandidateSkillGapStatus = 'missing' | 'partial';
// EmployerJobSkillRequirement / EmployerJobSkillImportance are already defined above (Sprint 17C) — reused, not duplicated.

export interface ScreeningSkillGap {
  skillName: string;
  requirement: EmployerJobSkillRequirement;
  importance: EmployerJobSkillImportance;
  status: EmployerCandidateSkillGapStatus;
  severity: EmployerCandidateGapSeverity;
}

export interface ScreeningCompetencyGap {
  competencyName: string;
  jdWeight: number;
  matchScore: number;
  severity: EmployerCandidateGapSeverity;
  evidence: string[];
}

export interface ScreeningExperienceGap {
  required?: string;
  candidate?: string;
  score: number;
  severity: EmployerCandidateGapSeverity;
  summary?: string;
}

export interface ScreeningEducationGap {
  score: number;
  severity: EmployerCandidateGapSeverity;
  summary?: string;
}

export interface ScreeningGapSummary {
  criticalGapCount: number;
  highGapCount: number;
  mediumGapCount: number;
  lowGapCount: number;
  matchedSkillCount: number;
  partialSkillCount: number;
  missingSkillCount: number;
}

export interface ScreeningGap {
  summary: ScreeningGapSummary;
  skillGaps: ScreeningSkillGap[];
  competencyGaps: ScreeningCompetencyGap[];
  experienceGap?: ScreeningExperienceGap;
  educationGap?: ScreeningEducationGap;
  strengths: string[];
  calculationVersion: string;
}

export interface ApplicationScreeningGap {
  id: string;
  screeningId: string;
  screeningScoreId: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  jdSnapshotId: string;
  resumeAnalysisId: string;
  gap: ScreeningGap;
  createdAt: string;
}

export type GenerateApplicationScreeningGapsResponse = ApiEnvelope<{ gap: ApplicationScreeningGap }>;
export type GetApplicationScreeningGapsResponse = ApiEnvelope<{ gap: ApplicationScreeningGap | null }>;

// ============================================================================
// Candidate Ranking (Sprint 19D) — a live, deterministic, job-level read.
// Ranking uses ONLY the 19B explainable score — the AI screening score is
// informational only. No persisted ranking, no manual reordering.
// ============================================================================

export type EmployerCandidateRankingUnrankedReason = 'screening_required' | 'explainable_score_required';

export interface RankingCandidateRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface RankedApplicationRow {
  rank: number;
  applicationId: string;
  candidate: RankingCandidateRef;
  applicationStatus: EmployerJobApplicationStatus;
  explainableScore: number;
  aiScreeningScore: number;
  recommendation: EmployerCandidateScreeningRecommendation;
  gapSummary?: { criticalGapCount: number; highGapCount: number };
  scoredAt: string;
}

export interface UnrankedApplicationRow {
  applicationId: string;
  candidate: RankingCandidateRef;
  applicationStatus: EmployerJobApplicationStatus;
  reason: EmployerCandidateRankingUnrankedReason;
}

export interface JobRanking {
  job: { id: string; title: string; jobCode?: string; status: EmployerJobStatus };
  ranked: RankedApplicationRow[];
  unranked: UnrankedApplicationRow[];
  summary: {
    totalApplications: number;
    rankedCount: number;
    unrankedCount: number;
    averageScore?: number;
    highestScore?: number;
    lowestScore?: number;
  };
}

export interface JobRankingFilters {
  status?: EmployerJobApplicationStatus;
  minScore?: number;
  search?: string;
}

export type GetEmployerJobRankingResponse = ApiEnvelope<JobRanking>;

// ============================================================================
// Job Candidate Comparison (Sprint 23A) — a live, deterministic, job-level
// read across candidates with a COMPLETED 22E finalization. Distinct from
// 19D screening ranking above: orders ONLY by finalized post-assessment
// evidence metrics (`comparisonPosition`), never resume/screening scores.
// No persisted comparison, no recommendation.
// ============================================================================

export interface ComparisonCandidateRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ComparisonEvidenceSummary {
  strongCount: number;
  sufficientCount: number;
  partialCount: number;
  insufficientCount: number;
  followUpCompetencyCount: number;
  criticalFollowUpCount: number;
}

export interface ComparisonCompetencyRow {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number;
  evidenceStatus: string;
}

export interface ComparisonApplicationRow {
  comparisonPosition: number;
  applicationId: string;
  candidate: ComparisonCandidateRef;
  applicationStatus: EmployerJobApplicationStatus;
  assessment: {
    overallScore: number;
    averageRubricScore: number;
    competencyCoveragePercent: number;
    assessedWeight: number;
    evidenceSummary: ComparisonEvidenceSummary;
    followUpQuestionCount: number;
    reviewedCount: number;
    finalizedAt: string;
  };
  competencies: ComparisonCompetencyRow[];
}

export type ComparisonNotReadyReason = 'assessment_not_finalized';

export interface ComparisonNotReadyRow {
  applicationId: string;
  candidate: ComparisonCandidateRef;
  applicationStatus: EmployerJobApplicationStatus;
  reason: ComparisonNotReadyReason;
}

export interface JobCandidateComparison {
  job: { id: string; title: string; jobCode?: string; status: EmployerJobStatus };
  comparison: ComparisonApplicationRow[];
  notReady: ComparisonNotReadyRow[];
  summary: {
    totalApplications: number;
    finalizedCount: number;
    notReadyCount: number;
    averageOverallScore?: number;
    highestOverallScore?: number;
    lowestOverallScore?: number;
  };
}

export interface JobCandidateComparisonFilters {
  status?: EmployerJobApplicationStatus;
  minOverallScore?: number;
  search?: string;
  finalizedOnly?: boolean;
}

export type GetJobCandidateComparisonResponse = ApiEnvelope<JobCandidateComparison>;

// ============================================================================
// Hiring Pipeline Board (Sprint 23B) — a live, deterministic read grouping
// the EXISTING EmployerJobApplication.status values into columns. No new
// status model; finalized 22E assessment metadata shown for context only.
// Distinct from 19D screening ranking and 23A assessment comparison above.
// ============================================================================

export interface PipelineCandidateRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface PipelineAssessmentSummary {
  finalized: boolean;
  overallScore?: number;
  competencyCoveragePercent?: number;
  criticalFollowUpCount?: number;
  finalizedAt?: string;
}

export interface PipelineApplicationRow {
  applicationId: string;
  candidate: PipelineCandidateRef;
  status: EmployerJobApplicationStatus;
  appliedAt: string;
  assessment: PipelineAssessmentSummary;
}

export interface PipelineColumn {
  status: EmployerJobApplicationStatus;
  count: number;
  applications: PipelineApplicationRow[];
}

export interface JobHiringPipeline {
  job: { id: string; title: string; jobCode?: string; status: EmployerJobStatus };
  columns: PipelineColumn[];
  summary: {
    totalActiveApplications: number;
    finalizedAssessmentCount: number;
    offerCount: number;
    hiredCount: number;
    rejectedCount: number;
  };
}

export type GetJobHiringPipelineResponse = ApiEnvelope<JobHiringPipeline>;
export type MoveApplicationPipelineStageResponse = ApiEnvelope<{ application: Record<string, unknown> }>;

// ============================================================================
// Job Pipeline Funnel & Conversion Analytics (Sprint 23D) — deterministic,
// live, never persisted. `currentPipeline` is authoritative current-state
// counts; `observedFunnel`/`transitionTiming` use ONLY stored 23C activity
// — never inferred from current status. `dataCoverage` tells the truth
// about whether historical tracking is complete.
// ============================================================================

export interface PipelineAnalyticsCurrentStage {
  status: EmployerJobApplicationStatus;
  count: number;
}

export interface PipelineAnalyticsFunnelStage {
  stage: EmployerJobApplicationStatus;
  observedReachedCount: number;
  conversionFromPreviousPercent: number | null;
}

export interface PipelineAnalyticsOutcomes {
  offerCount: number;
  hiredCount: number;
  rejectedCount: number;
  withdrawnCount: number;
  openPipelineCount: number;
}

export interface PipelineAnalyticsTransitionTiming {
  transition: string;
  observedSampleCount: number;
  averageHours?: number;
  medianHours?: number;
}

export interface PipelineAnalyticsDataCoverage {
  trackedApplications: number;
  totalApplications: number;
  trackingCoveragePercent: number;
  historicalTrackingComplete: boolean;
}

export interface JobPipelineAnalytics {
  job: { id: string; title: string; jobCode?: string; status: EmployerJobStatus };
  currentPipeline: {
    totalActiveApplications: number;
    stages: PipelineAnalyticsCurrentStage[];
  };
  observedFunnel: PipelineAnalyticsFunnelStage[];
  outcomes: PipelineAnalyticsOutcomes;
  transitionTiming: PipelineAnalyticsTransitionTiming[];
  dataCoverage: PipelineAnalyticsDataCoverage;
}

export type GetJobPipelineAnalyticsResponse = ApiEnvelope<JobPipelineAnalytics>;

// ============================================================================
// Job Collaboration & Communication Analytics (Sprint 24E) — deterministic,
// live, never persisted. Activity-frequency aggregates only — no recruiter
// ranking/scoring, no recommendation. Distinct from 23D pipeline analytics.
// ============================================================================

export interface CollaborationAnalyticsCoverage {
  totalApplications: number;
  applicationsWithCollaborators: number;
  applicationsWithInternalNotes: number;
  applicationsWithCommunications: number;
  applicationsWithDecisions: number;
}

export interface CollaborationAnalyticsCollaboration {
  totalInternalNotes: number;
  totalMentions: number;
  totalCollaboratorAssignments: number;
  uniqueCollaborators: number;
  collaborationRoleCounts: Record<EmployerJobApplicationCollaborationRole, number>;
}

export interface CollaborationAnalyticsNotifications {
  totalNotifications: number;
  unreadNotifications: number;
  notificationTypeCounts: Record<EmployerCollaborationNotificationType, number>;
}

export interface CollaborationAnalyticsCommunication {
  totalCommunications: number;
  outboundCount: number;
  inboundCount: number;
  channelCounts: Record<EmployerCandidateCommunicationChannel, number>;
  typeCounts: Record<EmployerCandidateCommunicationType, number>;
  observedResponseSamples: number;
  averageResponseHours?: number;
  medianResponseHours?: number;
}

export interface CollaborationAnalyticsDecisionActivity {
  totalDecisionLogs: number;
  decisionTypeCounts: Record<EmployerJobApplicationDecisionType, number>;
}

export interface CollaborationAnalyticsTrendDay {
  date: string;
  notes: number;
  communications: number;
  decisions: number;
}

export interface JobCollaborationAnalytics {
  job: { id: string; title: string; jobCode?: string; status: EmployerJobStatus };
  coverage: CollaborationAnalyticsCoverage;
  collaboration: CollaborationAnalyticsCollaboration;
  notifications: CollaborationAnalyticsNotifications;
  communication: CollaborationAnalyticsCommunication;
  decisionActivity: CollaborationAnalyticsDecisionActivity;
  activityTrend: CollaborationAnalyticsTrendDay[];
}

export type GetJobCollaborationAnalyticsResponse = ApiEnvelope<JobCollaborationAnalytics>;

// ============================================================================
// Employer Shortlist Workflow (Sprint 19E) — an explicit recruiter action
// only, never automatic. Reuses the existing 18D application status
// transition (screening -> shortlisted) under the hood; this is purely an
// audit trail of which screening/score supported the decision.
// ============================================================================

export type EmployerCandidateShortlistDecisionValue = 'shortlisted';

export interface ApplicationShortlistDecision {
  id: string;
  jobId: string;
  applicationId: string;
  candidateId: string;
  screeningId: string;
  screeningScoreId: string;
  explainableScore: number;
  decision: EmployerCandidateShortlistDecisionValue;
  decidedByMembershipId: string;
  decidedAt: string;
  createdAt: string;
}

export interface JobShortlistCandidateRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface JobShortlistRow {
  applicationId: string;
  candidate: JobShortlistCandidateRef | null;
  explainableScore: number | null;
  shortlistedAt: string | null;
  applicationStatus: EmployerJobApplicationStatus;
}

export type ShortlistApplicationResponse = ApiEnvelope<{ decision: ApplicationShortlistDecision }>;
export type GetApplicationShortlistResponse = ApiEnvelope<{ decision: ApplicationShortlistDecision | null }>;
export type GetEmployerJobShortlistResponse = ApiEnvelope<{ shortlisted: JobShortlistRow[] }>;

// ============================================================================
// Employer Interview Blueprint (Sprint 20A) — a structured interview PLAN
// (question intents / planning slots only, NEVER final candidate-facing
// questions) for a shortlisted application. No interview session/
// invitation is created here (20B/20C/20D).
// ============================================================================

export type EmployerInterviewBlueprintStatus = 'processing' | 'completed' | 'failed';
export type EmployerInterviewBlueprintSectionCategory =
  | 'technical'
  | 'problem_solving'
  | 'system_design'
  | 'domain'
  | 'behavioral'
  | 'leadership'
  | 'communication'
  | 'experience';
export type EmployerInterviewBlueprintDifficulty = 'easy' | 'medium' | 'hard';

export interface BlueprintQuestionPlanItem {
  intent: string;
  difficulty: EmployerInterviewBlueprintDifficulty;
  evidenceExpected: string[];
  followUpFocus: string[];
}

export interface BlueprintSection {
  id: string;
  title: string;
  objective: string;
  order: number;
  durationMinutes: number;
  category: EmployerInterviewBlueprintSectionCategory;
  competencies: string[];
  skills: string[];
  questionPlan: BlueprintQuestionPlanItem[];
}

export interface BlueprintMetadata {
  totalSections: number;
  totalPlannedQuestions: number;
  sourceCompetencyCount: number;
  sourceSkillCount: number;
}

export interface InterviewBlueprint {
  title: string;
  estimatedDurationMinutes: number;
  sections: BlueprintSection[];
  focusAreas: string[];
  avoidAreas: string[];
  metadata: BlueprintMetadata;
}

export interface ApplicationInterviewBlueprint {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  shortlistDecisionId: string;
  jdSnapshotId: string;
  screeningId: string;
  screeningScoreId: string;
  screeningGapId?: string;
  status: EmployerInterviewBlueprintStatus;
  blueprint: InterviewBlueprint | null;
  /** Same shape as a resume analysis's aiUsage — reused rather than redefined. */
  aiUsage: CandidateResumeAiUsage | null;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type GenerateEmployerInterviewBlueprintResponse = ApiEnvelope<{ blueprint: ApplicationInterviewBlueprint }>;
export type GetEmployerInterviewBlueprintResponse = ApiEnvelope<{ blueprint: ApplicationInterviewBlueprint | null }>;

// ============================================================================
// Interview Competency Coverage / Evaluation Rubric (Sprint 20B) — a
// DETERMINISTIC (no AI) interviewer evaluation rubric built from a
// COMPLETED 20A blueprint + the exact finalized JD competencies. Guides
// interviewer evaluation only — never a candidate score.
// ============================================================================

export interface RubricScoringAnchors {
  score1: string;
  score2: string;
  score3: string;
  score4: string;
  score5: string;
}

export interface RubricCompetency {
  competencyName: string;
  description?: string;
  jdWeight: number;
  importance: EmployerJobCompetencyImportance;
  sectionIds: string[];
  plannedIntentCount: number;
  evidenceSignals: string[];
  scoringAnchors: RubricScoringAnchors;
}

export interface RubricCoverage {
  totalCompetencies: number;
  coveredCompetencies: number;
  uncoveredCompetencies: string[];
  criticalCovered: number;
  criticalTotal: number;
  highCovered: number;
  highTotal: number;
  coveragePercent: number;
}

export interface InterviewCompetencyRubric {
  competencies: RubricCompetency[];
  coverage: RubricCoverage;
  calculationVersion: string;
}

export interface ApplicationInterviewRubric {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  blueprintId: string;
  screeningId: string;
  jdSnapshotId: string;
  rubric: InterviewCompetencyRubric;
  createdByMembershipId: string;
  createdAt: string;
}

export type GenerateEmployerInterviewRubricResponse = ApiEnvelope<{ rubric: ApplicationInterviewRubric }>;
export type GetEmployerInterviewRubricResponse = ApiEnvelope<{ rubric: ApplicationInterviewRubric | null }>;

// ============================================================================
// Employer Interview Invitation (Sprint 20C) — a secure, hashed-token
// invitation for a shortlisted application with a completed 20A blueprint
// + 20B rubric. No email is sent, no candidate-facing consumption page
// yet (20D). The raw token is returned ONLY from create/regenerate — it
// is never persisted server-side and never returned again afterward.
// ============================================================================

export type EmployerInterviewInvitationStatus = 'draft' | 'active' | 'accepted' | 'expired' | 'revoked';

export interface ApplicationInterviewInvitation {
  id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  blueprintId: string;
  rubricId: string;
  status: EmployerInterviewInvitationStatus;
  invitedEmail: string;
  invitedName?: string;
  message?: string;
  expiresAt: string;
  sentAt?: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

/** Never includes invitedEmail/invitedName/candidateId/jobId/blueprintId/rubricId/status/tokenHash/expiresAt — those are all derived/rejected server-side. */
export interface CreateEmployerInterviewInvitationPayload {
  expiresInDays?: number;
  message?: string;
}

export type CreateEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: ApplicationInterviewInvitation; token: string }>;
export type GetEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: ApplicationInterviewInvitation | null }>;
export type RegenerateEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: ApplicationInterviewInvitation; token: string }>;
export type RevokeEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: ApplicationInterviewInvitation }>;

// ============================================================================
// Employer Interview Session — authenticated recruiter READ only (Sprint
// 20E). The session itself is only ever created through the public
// candidate handoff; no create/mutate method exists here.
// ============================================================================

export interface EmployerInterviewSessionSummary {
  id: string;
  status: string;
  candidateId?: string;
  jobId?: string;
  blueprintId?: string;
  rubricId?: string;
  createdAt: string;
  completedAt?: string;
  updatedAt: string;
}

export type GetEmployerInterviewSessionResponse = ApiEnvelope<{ session: EmployerInterviewSessionSummary | null }>;

// ============================================================================
// Employer Interview Session Questions — authenticated recruiter READ only
// (Sprint 21A). Materialization itself only ever happens through the
// public candidate handoff; there is no create/mutate method here.
// ============================================================================

export interface EmployerInterviewQuestionDetail {
  id: string;
  question: string;
  category?: string;
  difficulty?: string;
  blueprintSectionId?: string;
  competencyNames: string[];
  skillNames: string[];
  evaluationIntent?: string;
  evidenceExpected: string[];
  followUpFocus: string[];
}

export type EmployerInterviewQuestionMaterializationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EmployerInterviewSessionQuestions {
  sessionId: string;
  status: string;
  materializationStatus: EmployerInterviewQuestionMaterializationStatus;
  totalQuestions: number;
  questions: EmployerInterviewQuestionDetail[];
}

export type GetEmployerInterviewSessionQuestionsResponse = ApiEnvelope<{ session: EmployerInterviewSessionQuestions | null }>;

// ============================================================================
// Employer Interview Session Answers — authenticated recruiter READ only
// (Sprint 21B, evaluation extended in 21D). Employer-only; never exposed to
// the candidate.
// ============================================================================

export interface EmployerInterviewCompetencyScore {
  competencyName: string;
  score: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface EmployerInterviewQuestionEvaluation {
  overallScore?: number;
  competencyScores: EmployerInterviewCompetencyScore[];
  strengths: string[];
  concerns: string[];
  evidenceSummary?: string;
}

export interface EmployerInterviewAnswerDetail {
  id: string;
  question: string;
  category?: string;
  difficulty?: string;
  blueprintSectionId?: string;
  answerText?: string;
  answeredAt?: string;
  duration?: number;
  evaluation?: EmployerInterviewQuestionEvaluation;
}

export type EmployerInterviewEvaluationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface EmployerInterviewSessionAnswers {
  sessionId: string;
  status: string;
  hiringEvaluationStatus: EmployerInterviewEvaluationStatus;
  totalQuestions: number;
  answeredQuestions: number;
  questions: EmployerInterviewAnswerDetail[];
}

export type GetEmployerInterviewSessionAnswersResponse = ApiEnvelope<{ session: EmployerInterviewSessionAnswers | null }>;
export type EvaluateEmployerInterviewSessionResponse = ApiEnvelope<{ session: EmployerInterviewSessionAnswers }>;

// ============================================================================
// Answer Reasoning Evidence (Sprint 26A) — deterministic AI analysis of
// OBSERVABLE reasoning expressed in one hiring-assessment answer. Never
// chain-of-thought, never intelligence/personality/psychological-state
// inference, never a hiring recommendation.
// ============================================================================

export type EmployerHiringReasoningSignalType =
  | 'problem_decomposition'
  | 'tradeoff_awareness'
  | 'assumption_awareness'
  | 'evidence_usage'
  | 'causal_reasoning'
  | 'alternative_consideration'
  | 'decision_clarity';
export type EmployerHiringReasoningSignalLevel = 'strong' | 'present' | 'limited' | 'not_observed';
export type EmployerHiringOverallReasoningEvidence = 'strong' | 'sufficient' | 'limited' | 'insufficient';

export interface EmployerHiringReasoningSignal {
  type: EmployerHiringReasoningSignalType;
  level: EmployerHiringReasoningSignalLevel;
  evidenceSummary: string;
}

export interface EmployerHiringAnswerReasoningSignals {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  overallReasoningEvidence?: EmployerHiringOverallReasoningEvidence;
  signals?: EmployerHiringReasoningSignal[];
  limitations?: string[];
  generatedAt?: string;
}

export type GetEmployerHiringAnswerReasoningSignalsResponse = ApiEnvelope<EmployerHiringAnswerReasoningSignals>;
export type GenerateEmployerHiringAnswerReasoningSignalsResponse = ApiEnvelope<EmployerHiringAnswerReasoningSignals>;

// ============================================================================
// Confidence & Uncertainty Intelligence (Sprint 26B) — deterministic AI
// analysis of OBSERVABLE claim confidence/uncertainty handling in one
// hiring-assessment answer. NOT lie detection, NOT truth verification, NOT
// a personality assessment.
// ============================================================================

export type EmployerHiringExpressionConfidence = 'high' | 'moderate' | 'low' | 'mixed';
export type EmployerHiringUncertaintyAwareness = 'strong' | 'present' | 'limited' | 'not_observed';
export type EmployerHiringCalibration = 'well_calibrated' | 'possibly_overconfident' | 'possibly_underconfident' | 'insufficient_evidence';
export type EmployerHiringClaimConfidenceExpression = 'high' | 'moderate' | 'low' | 'uncertain';
export type EmployerHiringClaimSupportLevel = 'supported_by_answer' | 'partially_supported' | 'unsupported';

export interface EmployerHiringConfidenceClaim {
  claimSummary: string;
  confidenceExpression: EmployerHiringClaimConfidenceExpression;
  supportLevel: EmployerHiringClaimSupportLevel;
  uncertaintyAcknowledged: boolean;
}

export interface EmployerHiringAnswerConfidenceSignals {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  expressionConfidence?: EmployerHiringExpressionConfidence;
  uncertaintyAwareness?: EmployerHiringUncertaintyAwareness;
  calibration?: EmployerHiringCalibration;
  claims?: EmployerHiringConfidenceClaim[];
  strengths?: string[];
  concerns?: string[];
  limitations?: string[];
  generatedAt?: string;
}

export type GetEmployerHiringAnswerConfidenceSignalsResponse = ApiEnvelope<EmployerHiringAnswerConfidenceSignals>;
export type GenerateEmployerHiringAnswerConfidenceSignalsResponse = ApiEnvelope<EmployerHiringAnswerConfidenceSignals>;

// ============================================================================
// Answer Consistency (Sprint 26C) — deterministic AI analysis of OBSERVABLE
// answer-to-answer consistency across one hiring assessment. NOT deception/
// lie detection.
// ============================================================================

export type EmployerHiringConsistencyFindingType =
  | 'direct_contradiction'
  | 'factual_inconsistency'
  | 'scope_change'
  | 'timeline_inconsistency'
  | 'terminology_inconsistency'
  | 'unsupported_change';
export type EmployerHiringConsistencyFindingSeverity = 'high' | 'medium' | 'low';
export type EmployerHiringOverallConsistency = 'consistent' | 'mostly_consistent' | 'mixed' | 'inconsistent' | 'insufficient_evidence';

export interface EmployerHiringConsistencyFindingEvidence {
  questionIndex: number;
  answerExcerptOrSummary: string;
}

export interface EmployerHiringConsistencyFinding {
  type: EmployerHiringConsistencyFindingType;
  severity: EmployerHiringConsistencyFindingSeverity;
  questionIndexes: number[];
  summary: string;
  evidence: EmployerHiringConsistencyFindingEvidence[];
}

export interface EmployerHiringAssessmentConsistency {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  overallConsistency?: EmployerHiringOverallConsistency;
  findings?: EmployerHiringConsistencyFinding[];
  consistentThemes?: string[];
  limitations?: string[];
  generatedAt?: string;
}

export type GetEmployerHiringAssessmentConsistencyResponse = ApiEnvelope<EmployerHiringAssessmentConsistency>;
export type GenerateEmployerHiringAssessmentConsistencyResponse = ApiEnvelope<EmployerHiringAssessmentConsistency>;

// ============================================================================
// Claim Evidence Alignment (Sprint 26D) — internal alignment of assessment
// claims against structured evidence already available in this hiring
// chain. NOT external fact-checking, NOT lie/deception detection.
// ============================================================================

export type EmployerHiringClaimCategory = 'experience' | 'skill' | 'project' | 'responsibility' | 'achievement' | 'education' | 'domain' | 'other';
export type EmployerHiringClaimAlignment = 'supported' | 'partially_supported' | 'unsupported' | 'conflicting' | 'unverifiable';
export type EmployerHiringClaimEvidenceSourceType = 'resume' | 'screening' | 'assessment' | 'evidence_matrix' | 'consistency';

export interface EmployerHiringClaimEvidenceSource {
  type: EmployerHiringClaimEvidenceSourceType;
  sourceArtifactId: string;
  evidenceSummary: string;
}

export interface EmployerHiringVerifiedClaim {
  claimId: string;
  questionIndex: number;
  claimSummary: string;
  category: EmployerHiringClaimCategory;
  alignment: EmployerHiringClaimAlignment;
  evidenceSources: EmployerHiringClaimEvidenceSource[];
  limitation?: string;
}

export interface EmployerHiringClaimVerificationSummary {
  totalClaims: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  conflicting: number;
  unverifiable: number;
}

export interface EmployerHiringClaimVerification {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  claims?: EmployerHiringVerifiedClaim[];
  summary?: EmployerHiringClaimVerificationSummary;
  limitations?: string[];
  generatedAt?: string;
}

export type GetEmployerHiringClaimVerificationResponse = ApiEnvelope<EmployerHiringClaimVerification>;
export type GenerateEmployerHiringClaimVerificationResponse = ApiEnvelope<EmployerHiringClaimVerification>;

// ============================================================================
// Reasoning & Confidence Aggregate (Sprint 26E) — deterministic (NO AI)
// assessment-level aggregate over already-completed 26A-26D artifacts. Pure
// counts/copies of existing structured values only.
// ============================================================================

export interface EmployerHiringSignalLevelCounts {
  strong: number;
  present: number;
  limited: number;
  notObserved: number;
}

export interface EmployerHiringReasoningAggregate {
  analyzedAnswerCount: number;
  strongAnswerCount: number;
  sufficientAnswerCount: number;
  limitedAnswerCount: number;
  insufficientAnswerCount: number;
  signalCounts: {
    problem_decomposition: EmployerHiringSignalLevelCounts;
    tradeoff_awareness: EmployerHiringSignalLevelCounts;
    assumption_awareness: EmployerHiringSignalLevelCounts;
    evidence_usage: EmployerHiringSignalLevelCounts;
    causal_reasoning: EmployerHiringSignalLevelCounts;
    alternative_consideration: EmployerHiringSignalLevelCounts;
    decision_clarity: EmployerHiringSignalLevelCounts;
  };
}

export interface EmployerHiringConfidenceAggregate {
  analyzedAnswerCount: number;
  expressionConfidenceCounts: { high: number; moderate: number; low: number; mixed: number };
  uncertaintyAwarenessCounts: { strong: number; present: number; limited: number; notObserved: number };
  calibrationCounts: {
    wellCalibrated: number;
    possiblyOverconfident: number;
    possiblyUnderconfident: number;
    insufficientEvidence: number;
  };
}

export interface EmployerHiringConsistencyAggregate {
  available: boolean;
  overallConsistency?: string;
  findingCount: number;
  highSeverityFindingCount: number;
  mediumSeverityFindingCount: number;
  lowSeverityFindingCount: number;
}

export interface EmployerHiringClaimAlignmentAggregate {
  available: boolean;
  totalClaims: number;
  supported: number;
  partiallySupported: number;
  unsupported: number;
  conflicting: number;
  unverifiable: number;
}

export interface EmployerHiringAggregateCoverage {
  totalAnsweredQuestions: number;
  reasoningAnalyzedQuestions: number;
  confidenceAnalyzedQuestions: number;
  reasoningCoveragePercent: number;
  confidenceCoveragePercent: number;
  consistencyAvailable: boolean;
  claimVerificationAvailable: boolean;
}

export interface EmployerHiringReasoningConfidenceAggregate {
  built: boolean;
  calculationVersion?: string;
  generatedAt?: string;
  reasoning?: EmployerHiringReasoningAggregate;
  confidence?: EmployerHiringConfidenceAggregate;
  consistency?: EmployerHiringConsistencyAggregate;
  claimAlignment?: EmployerHiringClaimAlignmentAggregate;
  coverage?: EmployerHiringAggregateCoverage;
}

export type GetEmployerHiringReasoningConfidenceAggregateResponse = ApiEnvelope<EmployerHiringReasoningConfidenceAggregate>;
export type BuildEmployerHiringReasoningConfidenceAggregateResponse = ApiEnvelope<EmployerHiringReasoningConfidenceAggregate>;

// ============================================================================
// Interview Graph (Sprint 27A) — deterministic (NO AI) structural graph of
// one hiring-assessment interview's competencies/questions, built from the
// existing 20A blueprint/20B rubric/21A materialized questions. Stored
// structure only — never adapts the running interview.
// ============================================================================

export type EmployerInterviewGraphNodeType = 'competency' | 'question';
export type EmployerInterviewGraphEdgeType = 'competency_to_question' | 'question_to_competency' | 'possible_followup';

export interface EmployerInterviewGraphNodeMetadata {
  difficulty?: string;
  questionType?: string;
  importance?: string;
  weight?: number;
}

export interface EmployerInterviewGraphNode {
  nodeId: string;
  type: EmployerInterviewGraphNodeType;
  competencyName?: string;
  questionIndex?: number;
  label: string;
  metadata?: EmployerInterviewGraphNodeMetadata;
}

export interface EmployerInterviewGraphEdgeMetadata {
  reason?: string;
}

export interface EmployerInterviewGraphEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  type: EmployerInterviewGraphEdgeType;
  metadata?: EmployerInterviewGraphEdgeMetadata;
}

export interface EmployerInterviewGraphSummary {
  competencyNodeCount: number;
  questionNodeCount: number;
  edgeCount: number;
  coveredCompetencyCount: number;
}

export interface EmployerInterviewGraph {
  built: boolean;
  graphVersion?: string;
  generatedAt?: string;
  summary?: EmployerInterviewGraphSummary;
  uncoveredCompetencies?: string[];
  nodes?: EmployerInterviewGraphNode[];
  edges?: EmployerInterviewGraphEdge[];
}

export type GetEmployerInterviewGraphResponse = ApiEnvelope<EmployerInterviewGraph>;
export type BuildEmployerInterviewGraphResponse = ApiEnvelope<EmployerInterviewGraph>;

// ============================================================================
// Dynamic Follow-up Routing (Sprint 27B) — hiring-assessment ROUTING, not
// coaching. At most one generated follow-up per source question.
// ============================================================================

export type EmployerInterviewFollowUpDecision = 'follow_up' | 'continue';
export type EmployerInterviewFollowUpReasonType =
  | 'insufficient_evidence'
  | 'partial_answer'
  | 'competency_gap'
  | 'clarification_needed';

export interface EmployerInterviewFollowUpRoute {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  decision?: EmployerInterviewFollowUpDecision;
  reasonType?: EmployerInterviewFollowUpReasonType;
  targetCompetencyName?: string;
  generatedQuestionIndex?: number;
  generatedQuestionText?: string;
  generatedAt?: string;
}

export type GetEmployerInterviewFollowUpRouteResponse = ApiEnvelope<EmployerInterviewFollowUpRoute>;
export type GenerateEmployerInterviewFollowUpRouteResponse = ApiEnvelope<EmployerInterviewFollowUpRoute>;

// ============================================================================
// Competency Coverage Graph Intelligence (Sprint 27C) — deterministic (NO
// AI) LIVE coverage overlay for the 27A graph.
// ============================================================================

export type EmployerInterviewCompetencyEvidenceState = 'not_started' | 'partial' | 'covered';

export interface EmployerInterviewCompetencyCoverageEntry {
  competencyNodeId: string;
  competencyName: string;
  plannedQuestionCount: number;
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  evidenceState: EmployerInterviewCompetencyEvidenceState;
  questionIndexes: number[];
  answeredQuestionIndexes: number[];
  evaluatedQuestionIndexes: number[];
  dynamicFollowUpCount: number;
}

export interface EmployerInterviewCompetencyCoverageDynamicEdge {
  competencyNodeId: string;
  questionIndex: number;
  sourceQuestionIndex: number;
}

export interface EmployerInterviewCompetencyCoverageSummary {
  competencyCount: number;
  coveredCount: number;
  partialCount: number;
  notStartedCount: number;
  totalQuestionCount: number;
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  coveragePercent: number;
}

export interface EmployerInterviewCompetencyCoverage {
  built: boolean;
  calculationVersion?: string;
  generatedAt?: string;
  summary?: EmployerInterviewCompetencyCoverageSummary;
  competencies?: EmployerInterviewCompetencyCoverageEntry[];
  dynamicEdges?: EmployerInterviewCompetencyCoverageDynamicEdge[];
}

export type GetEmployerInterviewCompetencyCoverageResponse = ApiEnvelope<EmployerInterviewCompetencyCoverage>;
export type BuildEmployerInterviewCompetencyCoverageResponse = ApiEnvelope<EmployerInterviewCompetencyCoverage>;

// ============================================================================
// Adaptive Difficulty & Question Selection (Sprint 27D) — deterministic (NO
// AI) selection among EXISTING unanswered questions. Never generates a new
// question, never creates a candidate score.
// ============================================================================

export type EmployerInterviewAdaptiveDecision = 'select_question' | 'complete' | 'wait_for_evaluation';
export type EmployerInterviewAdaptiveReasonType =
  | 'uncovered_competency'
  | 'partial_coverage'
  | 'difficulty_progression'
  | 'difficulty_recovery'
  | 'remaining_question'
  | 'follow_up_priority';

export interface EmployerInterviewAdaptiveConsideredQuestion {
  questionIndex: number;
  competencyNames: string[];
  difficulty?: string;
  eligible: boolean;
  priority: number;
  reasons: string[];
}

export interface EmployerInterviewAdaptiveRoute {
  id: string;
  routeVersion: string;
  generatedAt: string;
  sourceQuestionIndex?: number;
  selectedQuestionIndex?: number;
  selectedCompetencyNames: string[];
  selectedDifficulty?: string;
  decision: EmployerInterviewAdaptiveDecision;
  reasonType?: EmployerInterviewAdaptiveReasonType;
  consideredQuestions: EmployerInterviewAdaptiveConsideredQuestion[];
  createdAt: string;
}

export type SelectEmployerInterviewAdaptiveRouteResponse = ApiEnvelope<EmployerInterviewAdaptiveRoute>;
export type GetEmployerInterviewAdaptiveRouteHistoryResponse = ApiEnvelope<{ routes: EmployerInterviewAdaptiveRoute[] }>;

// ============================================================================
// Dynamic Interview Graph Analytics (Sprint 27E) — deterministic (NO AI)
// analytics over 27A-27D. Routing/traversal behavior only — never a
// candidate performance score or hiring recommendation.
// ============================================================================

export interface EmployerInterviewGraphAnalyticsGraphSummary {
  competencyCount: number;
  plannedQuestionCount: number;
  dynamicFollowUpCount: number;
  totalCurrentQuestionCount: number;
}

export interface EmployerInterviewGraphAnalyticsExecutionSummary {
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  unansweredQuestionCount: number;
  adaptiveRouteCount: number;
  completedRouteCount: number;
}

export interface EmployerInterviewGraphAnalyticsFollowUpSummary {
  analyzedSourceQuestionCount: number;
  followUpGeneratedCount: number;
  continueDecisionCount: number;
  followUpRatePercent: number;
}

export interface EmployerInterviewGraphAnalyticsCoverageSummary {
  available: boolean;
  competencyCount?: number;
  coveredCount?: number;
  partialCount?: number;
  notStartedCount?: number;
  coveragePercent?: number;
}

export interface EmployerInterviewGraphAnalyticsAdaptiveRoutingSummary {
  selectionCount: number;
  followUpPrioritySelections: number;
  uncoveredCompetencySelections: number;
  partialCoverageSelections: number;
  difficultyProgressionSelections: number;
  difficultyRecoverySelections: number;
  remainingQuestionSelections: number;
}

export interface EmployerInterviewGraphAnalyticsDifficultyTransitions {
  easyToMedium: number;
  mediumToHard: number;
  hardToMedium: number;
  mediumToEasy: number;
  sameDifficulty: number;
  unknown: number;
}

export interface EmployerInterviewGraphAnalyticsDifficultySummary {
  selectedEasyCount: number;
  selectedMediumCount: number;
  selectedHardCount: number;
  transitions: EmployerInterviewGraphAnalyticsDifficultyTransitions;
}

export interface EmployerInterviewGraphAnalytics {
  built: boolean;
  calculationVersion?: string;
  generatedAt?: string;
  graph?: EmployerInterviewGraphAnalyticsGraphSummary;
  execution?: EmployerInterviewGraphAnalyticsExecutionSummary;
  followUps?: EmployerInterviewGraphAnalyticsFollowUpSummary;
  coverage?: EmployerInterviewGraphAnalyticsCoverageSummary;
  adaptiveRouting?: EmployerInterviewGraphAnalyticsAdaptiveRoutingSummary;
  difficulty?: EmployerInterviewGraphAnalyticsDifficultySummary;
}

export type GetEmployerInterviewGraphAnalyticsResponse = ApiEnvelope<EmployerInterviewGraphAnalytics>;
export type BuildEmployerInterviewGraphAnalyticsResponse = ApiEnvelope<EmployerInterviewGraphAnalytics>;

// ============================================================================
// Scenario Definitions (Sprint 28A) — structured, JOB-RELEVANT workplace
// scenario definitions. Manual employer input only, no AI in this sprint.
// ============================================================================

export type EmployerInterviewScenarioStatus = 'draft' | 'ready' | 'archived';
export type EmployerInterviewScenarioCategory =
  | 'technical'
  | 'system_design'
  | 'debugging'
  | 'incident'
  | 'architecture'
  | 'leadership'
  | 'stakeholder'
  | 'prioritization'
  | 'communication'
  | 'domain'
  | 'other';
export type EmployerInterviewScenarioDifficulty = 'easy' | 'medium' | 'hard';

export interface EmployerInterviewScenarioContext {
  situation: string;
  candidateRole: string;
  constraints: string[];
  availableInformation: string[];
}

export interface EmployerInterviewScenario {
  id: string;
  interviewId: string;
  applicationId: string;
  jobId: string;
  blueprintId: string;
  rubricId: string;
  scenarioVersion: string;
  status: EmployerInterviewScenarioStatus;
  title: string;
  description: string;
  category: EmployerInterviewScenarioCategory;
  context: EmployerInterviewScenarioContext;
  targetCompetencies: string[];
  difficulty: EmployerInterviewScenarioDifficulty;
  objectives: string[];
  successEvidence: string[];
  failureSignals: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EmployerInterviewScenarioInput {
  title: string;
  description: string;
  category: EmployerInterviewScenarioCategory;
  context: {
    situation: string;
    candidateRole: string;
    constraints?: string[];
    availableInformation?: string[];
  };
  targetCompetencies: string[];
  difficulty: EmployerInterviewScenarioDifficulty;
  objectives?: string[];
  successEvidence?: string[];
  failureSignals?: string[];
}

export type CreateEmployerInterviewScenarioResponse = ApiEnvelope<EmployerInterviewScenario>;
export type UpdateEmployerInterviewScenarioResponse = ApiEnvelope<EmployerInterviewScenario>;
export type ArchiveEmployerInterviewScenarioResponse = ApiEnvelope<EmployerInterviewScenario>;
export type GetEmployerInterviewScenarioResponse = ApiEnvelope<EmployerInterviewScenario>;
export type ListEmployerInterviewScenariosResponse = ApiEnvelope<{ scenarios: EmployerInterviewScenario[] }>;

// ============================================================================
// Scenario Question Generation (Sprint 28B) — AI-generated multi-step
// question PLAN for a READY scenario. No candidate execution, no response
// evaluation yet.
// ============================================================================

export type EmployerScenarioQuestionType = 'opening' | 'probe' | 'complication' | 'decision' | 'reflection';
export type EmployerScenarioQuestionDifficulty = 'easy' | 'medium' | 'hard';

export interface EmployerScenarioQuestion {
  sequence: number;
  type: EmployerScenarioQuestionType;
  questionText: string;
  targetCompetencies: string[];
  evidenceExpected: string[];
  difficulty: EmployerScenarioQuestionDifficulty;
  scenarioUpdate?: string;
}

export interface EmployerScenarioQuestionSetSummary {
  questionCount: number;
  competencyCount: number;
}

export interface EmployerInterviewScenarioQuestionSet {
  generated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  generationVersion?: string;
  generatedAt?: string;
  questions?: EmployerScenarioQuestion[];
  summary?: EmployerScenarioQuestionSetSummary;
}

export type GetEmployerInterviewScenarioQuestionsResponse = ApiEnvelope<EmployerInterviewScenarioQuestionSet>;
export type GenerateEmployerInterviewScenarioQuestionsResponse = ApiEnvelope<EmployerInterviewScenarioQuestionSet>;

// ============================================================================
// Scenario Response Evaluation (Sprint 28C) — evidence-based evaluation of
// one candidate response to one scenario question. Employer-only, never
// exposed to the candidate.
// ============================================================================

export type EmployerScenarioEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';
export type EmployerScenarioAssessmentLevel = 'strong' | 'sufficient' | 'limited' | 'insufficient';

export interface EmployerScenarioCompetencyEvidence {
  competencyName: string;
  evidenceState: EmployerScenarioEvidenceState;
  evidence: string[];
  missingEvidence: string[];
}

export interface EmployerScenarioResponseAssessment {
  relevance: EmployerScenarioAssessmentLevel;
  reasoningQuality: EmployerScenarioAssessmentLevel;
  decisionClarity: EmployerScenarioAssessmentLevel;
  constraintAwareness: EmployerScenarioAssessmentLevel;
}

export interface EmployerInterviewScenarioResponseEvaluation {
  evaluated: boolean;
  status?: 'processing' | 'failed';
  errorMessage?: string;
  evaluationVersion?: string;
  targetedCompetencies?: string[];
  competencyEvidence?: EmployerScenarioCompetencyEvidence[];
  responseAssessment?: EmployerScenarioResponseAssessment;
  evidenceSummary?: string;
  followUpUseful?: boolean;
  followUpReason?: string;
  evaluatedAt?: string;
}

export type GetEmployerScenarioResponseEvaluationResponse = ApiEnvelope<EmployerInterviewScenarioResponseEvaluation>;
export type GenerateEmployerScenarioResponseEvaluationResponse = ApiEnvelope<EmployerInterviewScenarioResponseEvaluation>;

// ============================================================================
// Scenario Session (Sprint 28D) — employer-internal, read-only view of the
// candidate's multi-step scenario execution progress + responses.
// ============================================================================

export type EmployerScenarioSessionStatus = 'not_started' | 'in_progress' | 'completed';

export interface EmployerScenarioSessionResponse {
  questionSequence: number;
  questionTextSnapshot: string;
  scenarioUpdateSnapshot?: string;
  answerText: string;
  answeredAt?: string;
  durationSeconds?: number;
}

export interface EmployerInterviewScenarioSessionDetail {
  started: boolean;
  status: EmployerScenarioSessionStatus;
  progress: { current: number; total: number };
  responses: EmployerScenarioSessionResponse[];
  startedAt?: string;
  completedAt?: string;
}

export type GetEmployerInterviewScenarioSessionResponse = ApiEnvelope<EmployerInterviewScenarioSessionDetail>;

// ============================================================================
// Scenario Performance Report (Sprint 28E) — deterministic (NO AI)
// aggregate over completed 28C evaluations for a completed 28D session.
// Evidence aggregation/coverage only — never a hiring recommendation,
// candidate ranking, or numeric performance score.
// ============================================================================

export interface EmployerScenarioReportSnapshot {
  title: string;
  category: string;
  difficulty: string;
  targetCompetencies: string[];
}

export interface EmployerScenarioReportExecution {
  totalSteps: number;
  answeredSteps: number;
  evaluatedSteps: number;
  durationSeconds?: number;
  completed: boolean;
}

export interface EmployerScenarioReportEvidenceStateCounts {
  strong: number;
  sufficient: number;
  partial: number;
  insufficient: number;
  notObserved: number;
}

export interface EmployerScenarioReportCompetencyEvidence {
  competencyName: string;
  evaluatedStepCount: number;
  states: EmployerScenarioReportEvidenceStateCounts;
  overallEvidenceState: EmployerScenarioEvidenceState;
  evidence: string[];
  missingEvidence: string[];
}

export interface EmployerScenarioReportAssessmentLevelCounts {
  strong: number;
  sufficient: number;
  limited: number;
  insufficient: number;
}

export interface EmployerScenarioReportResponseSignals {
  relevance: EmployerScenarioReportAssessmentLevelCounts;
  reasoningQuality: EmployerScenarioReportAssessmentLevelCounts;
  decisionClarity: EmployerScenarioReportAssessmentLevelCounts;
  constraintAwareness: EmployerScenarioReportAssessmentLevelCounts;
}

export interface EmployerScenarioReportFollowUp {
  usefulCount: number;
  notUsefulCount: number;
  reasons: string[];
}

export interface EmployerScenarioReportCoverage {
  targetCompetencyCount: number;
  observedCompetencyCount: number;
  missingCompetencyCount: number;
  coveragePercent: number;
}

export interface EmployerScenarioReportSummary {
  strengths: string[];
  evidenceGaps: string[];
}

export interface EmployerInterviewScenarioReport {
  built: boolean;
  reportVersion?: string;
  generatedAt?: string;
  scenarioSnapshot?: EmployerScenarioReportSnapshot;
  execution?: EmployerScenarioReportExecution;
  competencyEvidence?: EmployerScenarioReportCompetencyEvidence[];
  responseSignals?: EmployerScenarioReportResponseSignals;
  followUp?: EmployerScenarioReportFollowUp;
  coverage?: EmployerScenarioReportCoverage;
  summary?: EmployerScenarioReportSummary;
}

export type GetEmployerInterviewScenarioReportResponse = ApiEnvelope<EmployerInterviewScenarioReport>;
export type BuildEmployerInterviewScenarioReportResponse = ApiEnvelope<EmployerInterviewScenarioReport>;

// ============================================================================
// Organization Knowledge Base (Sprint 29A) + document upload/parsing
// (Sprint 29B) — organization-scoped internal knowledge. NO embeddings, NO
// vector search, NO AI (that is 29C+). `rawText`/full content is
// employer-internal only.
// ============================================================================

export type OrganizationKnowledgeBaseStatus = 'active' | 'archived';

export interface OrganizationKnowledgeBase {
  id: string;
  name: string;
  description?: string;
  status: OrganizationKnowledgeBaseStatus;
  knowledgeVersion: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationKnowledgeBaseInput {
  name: string;
  description?: string;
}

export type CreateOrganizationKnowledgeBaseResponse = ApiEnvelope<OrganizationKnowledgeBase>;
export type UpdateOrganizationKnowledgeBaseResponse = ApiEnvelope<OrganizationKnowledgeBase>;
export type ArchiveOrganizationKnowledgeBaseResponse = ApiEnvelope<OrganizationKnowledgeBase>;
export type GetOrganizationKnowledgeBaseResponse = ApiEnvelope<OrganizationKnowledgeBase>;
export type ListOrganizationKnowledgeBasesResponse = ApiEnvelope<{ knowledgeBases: OrganizationKnowledgeBase[] }>;

export type OrganizationKnowledgeDocumentSourceType = 'file' | 'text';
export type OrganizationKnowledgeDocumentStatus = 'draft' | 'processing' | 'ready' | 'failed' | 'archived';

export interface OrganizationKnowledgeDocument {
  id: string;
  title: string;
  description?: string;
  sourceType: OrganizationKnowledgeDocumentSourceType;
  originalFileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  status: OrganizationKnowledgeDocumentStatus;
  parsingVersion?: string;
  characterCount?: number;
  wordCount?: number;
  parseError?: string;
  createdAt: string;
  updatedAt: string;
  parsedTextPreview?: string;
}

export type ListOrganizationKnowledgeDocumentsResponse = ApiEnvelope<{ documents: OrganizationKnowledgeDocument[] }>;
export type GetOrganizationKnowledgeDocumentResponse = ApiEnvelope<OrganizationKnowledgeDocument>;
export type GetOrganizationKnowledgeDocumentContentResponse = ApiEnvelope<{ id: string; rawText: string }>;
export type UploadOrganizationKnowledgeDocumentResponse = ApiEnvelope<OrganizationKnowledgeDocument>;
export type CreateOrganizationKnowledgeTextDocumentResponse = ApiEnvelope<OrganizationKnowledgeDocument>;
export type ReprocessOrganizationKnowledgeDocumentResponse = ApiEnvelope<OrganizationKnowledgeDocument>;
export type ArchiveOrganizationKnowledgeDocumentResponse = ApiEnvelope<OrganizationKnowledgeDocument>;

// ============================================================================
// Employer Hiring Assessment Result — deterministic (no AI) competency
// aggregate of 21D evaluations (Sprint 21E). Employer-only; never exposed
// to the candidate.
// ============================================================================

export interface HiringAssessmentCompetencyResult {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number;
  questionCount: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface HiringAssessmentResult {
  overallScore: number;
  averageRubricScore: number;
  assessedWeight: number;
  competencyCoveragePercent: number;
  competencies: HiringAssessmentCompetencyResult[];
  strengths: string[];
  concerns: string[];
  calculationVersion: string;
}

export interface EmployerHiringAssessmentResult {
  id: string;
  interviewId: string;
  blueprintId: string;
  rubricId: string;
  result: HiringAssessmentResult;
  createdAt: string;
}

export type CreateEmployerHiringAssessmentResultResponse = ApiEnvelope<{ result: EmployerHiringAssessmentResult }>;
export type GetEmployerHiringAssessmentResultResponse = ApiEnvelope<{ result: EmployerHiringAssessmentResult | null }>;

// ============================================================================
// Employer Hiring Evidence Matrix — deterministic (no AI) evidence
// intelligence built from 21D evaluations + 21E result (Sprint 22A).
// Employer-only; never exposed to the candidate.
// ============================================================================

export type EvidenceStatus = 'strong' | 'sufficient' | 'partial' | 'insufficient';

export interface EvidenceSourceQuestion {
  questionIndex: number;
  questionText: string;
  rubricScore: number;
  evidence: string[];
  missingEvidence: string[];
}

export interface EvidenceCompetency {
  competencyName: string;
  importance: string;
  jdWeight: number;
  score: number;
  evidenceStatus: EvidenceStatus;
  supportingEvidence: string[];
  missingEvidence: string[];
  sourceQuestions: EvidenceSourceQuestion[];
  requiresFollowUp: boolean;
  followUpReasons: string[];
}

export interface EvidenceSummary {
  strongCount: number;
  sufficientCount: number;
  partialCount: number;
  insufficientCount: number;
  followUpCompetencyCount: number;
  criticalFollowUpCount: number;
}

export interface HiringEvidenceMatrix {
  competencies: EvidenceCompetency[];
  summary: EvidenceSummary;
  calculationVersion: string;
}

export interface EmployerHiringEvidenceMatrix {
  id: string;
  interviewId: string;
  blueprintId: string;
  rubricId: string;
  assessmentResultId: string;
  matrix: HiringEvidenceMatrix;
  createdAt: string;
}

export type CreateEmployerHiringEvidenceMatrixResponse = ApiEnvelope<{ evidence: EmployerHiringEvidenceMatrix }>;
export type GetEmployerHiringEvidenceMatrixResponse = ApiEnvelope<{ evidence: EmployerHiringEvidenceMatrix | null }>;

// ============================================================================
// Employer Hiring Follow-Up Plan — employer-only follow-up question
// SUGGESTIONS for competencies the 22A evidence matrix marked
// requiresFollowUp (Sprint 22B). Never appended to the candidate's
// completed interview; never exposed to the candidate.
// ============================================================================

export type FollowUpPlanStatus = 'processing' | 'completed' | 'failed';

export interface FollowUpQuestion {
  question: string;
  objective: string;
  evidenceToValidate: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface FollowUpCompetency {
  competencyName: string;
  importance: string;
  currentScore: number;
  evidenceStatus: string;
  reasons: string[];
  questions: FollowUpQuestion[];
}

export interface FollowUpPlan {
  competencies: FollowUpCompetency[];
  totalQuestions: number;
  generationVersion: string;
}

export interface EmployerHiringFollowUpPlan {
  id: string;
  interviewId: string;
  blueprintId: string;
  rubricId: string;
  assessmentResultId: string;
  evidenceMatrixId: string;
  status: FollowUpPlanStatus;
  plan?: FollowUpPlan;
  createdAt: string;
  updatedAt: string;
}

export type CreateEmployerHiringFollowUpPlanResponse = ApiEnvelope<{ followUpPlan: EmployerHiringFollowUpPlan }>;
export type GetEmployerHiringFollowUpPlanResponse = ApiEnvelope<{ followUpPlan: EmployerHiringFollowUpPlan | null }>;

// ============================================================================
// Employer Hiring Assessment Report — one immutable, employer-only
// narrative report built from 21E result + 22A matrix + 22B follow-up plan
// (Sprint 22C). No hire/reject recommendation; never candidate-facing.
// ============================================================================

export type HiringReportStatus = 'processing' | 'completed' | 'failed';

export interface HiringReportCompetencySummary {
  competencyName: string;
  importance: string;
  score: number;
  evidenceStatus: string;
  summary: string;
}

export interface HiringAssessmentReport {
  executiveSummary: string;
  overallScore: number;
  averageRubricScore: number;
  competencyCoveragePercent: number;
  competencySummary: HiringReportCompetencySummary[];
  demonstratedStrengths: string[];
  evidenceGaps: string[];
  followUpPriorities: string[];
  interviewerNotes: string[];
  generationVersion: string;
}

export interface EmployerHiringAssessmentReportDetail {
  id: string;
  interviewId: string;
  blueprintId: string;
  rubricId: string;
  assessmentResultId: string;
  evidenceMatrixId: string;
  followUpPlanId?: string;
  status: HiringReportStatus;
  report?: HiringAssessmentReport;
  createdAt: string;
  updatedAt: string;
}

export type CreateEmployerHiringAssessmentReportResponse = ApiEnvelope<{ hiringReport: EmployerHiringAssessmentReportDetail }>;
export type GetEmployerHiringAssessmentReportResponse = ApiEnvelope<{ hiringReport: EmployerHiringAssessmentReportDetail | null }>;

// ============================================================================
// Employer Hiring Report Review + Export (Sprint 22D). Informational
// recruiter review only — never a hire/reject verdict, never exposed to
// the candidate.
// ============================================================================

export type HiringReportReviewStatus = 'pending' | 'reviewed';

export interface HiringReportReviewEntry {
  reviewerMembershipId: string;
  reviewerName?: string;
  reviewerEmail?: string;
  status: HiringReportReviewStatus;
  reviewNotes?: string;
  reviewedAt?: string;
  updatedAt: string;
}

export interface HiringReportReviewSummary {
  reportId: string;
  totalReviewers: number;
  reviewedCount: number;
  pendingCount: number;
  currentUserReview: HiringReportReviewEntry | null;
  reviews: HiringReportReviewEntry[];
}

export type GetHiringReportReviewSummaryResponse = ApiEnvelope<{ reviewSummary: HiringReportReviewSummary | null }>;
export type UpsertHiringReportReviewResponse = ApiEnvelope<{ reviewSummary: HiringReportReviewSummary }>;

// ============================================================================
// Employer Hiring Assessment Finalization — one immutable record pinning
// the completed Sprint 21/22 assessment evidence package for downstream
// Sprint 23 work (22E). Workflow readiness only — NOT a hire/reject
// decision; never exposed to the candidate.
// ============================================================================

export interface FinalizationReadinessChecklist {
  assessmentEvaluated: boolean;
  assessmentResultReady: boolean;
  evidenceReady: boolean;
  followUpReadyOrNotRequired: boolean;
  reportReady: boolean;
  currentUserReviewed: boolean;
  canFinalize: boolean;
}

export interface FinalizationEvidenceSummary {
  strongCount: number;
  sufficientCount: number;
  partialCount: number;
  insufficientCount: number;
  followUpCompetencyCount: number;
  criticalFollowUpCount: number;
}

export interface FinalizationReviewSummary {
  eligibleReviewerCount: number;
  reviewedCount: number;
}

export interface FinalizationSnapshot {
  overallScore: number;
  averageRubricScore: number;
  competencyCoveragePercent: number;
  assessedWeight: number;
  evidenceSummary: FinalizationEvidenceSummary;
  followUpQuestionCount: number;
  reviewSummary: FinalizationReviewSummary;
  calculationVersion: string;
}

export interface EmployerHiringAssessmentFinalization {
  id: string;
  interviewId: string;
  blueprintId: string;
  rubricId: string;
  assessmentResultId: string;
  evidenceMatrixId: string;
  followUpPlanId?: string;
  reportId: string;
  finalizedByMembershipId: string;
  finalizedAt: string;
  snapshot: FinalizationSnapshot;
  createdAt: string;
}

export type GetHiringAssessmentFinalizationResponse = ApiEnvelope<{
  finalization: EmployerHiringAssessmentFinalization | null;
  checklist: FinalizationReadinessChecklist;
}>;
export type CreateHiringAssessmentFinalizationResponse = ApiEnvelope<{ finalization: EmployerHiringAssessmentFinalization }>;

// ============================================================================
// Application Activity Timeline (Sprint 23C) — read-only audit/activity
// history. Never decides pipeline stage, never computes comparison
// position, never alters lifecycle. Distinct from the 23B pipeline board.
// ============================================================================

export type ApplicationActivityType =
  | 'application_created'
  | 'status_changed'
  | 'assessment_finalized'
  | 'employer_decision'
  | 'internal_note_added'
  | 'candidate_communication';

export interface ApplicationActivityActor {
  type: 'member' | 'system';
  membershipId?: string;
  displayName?: string;
}

export interface ApplicationActivityItem {
  type: ApplicationActivityType;
  occurredAt: string;
  actor: ApplicationActivityActor;
  fromStatus?: EmployerJobApplicationStatus;
  toStatus?: EmployerJobApplicationStatus;
  metadata?: {
    overallScore?: number;
    competencyCoveragePercent?: number;
    decisionType?: EmployerJobApplicationDecisionType;
    reasonCode?: EmployerJobApplicationDecisionReasonCode;
    notes?: string;
    noteId?: string;
    communicationId?: string;
    direction?: EmployerCandidateCommunicationDirection;
    channel?: EmployerCandidateCommunicationChannel;
    communicationType?: EmployerCandidateCommunicationType;
  };
}

export interface ApplicationTimeline {
  applicationId: string;
  currentStatus: EmployerJobApplicationStatus;
  timeline: ApplicationActivityItem[];
}

export type GetApplicationTimelineResponse = ApiEnvelope<ApplicationTimeline>;

// ============================================================================
// Pipeline Decision Log (Sprint 23E) — append-only, HUMAN-entered audit
// labels. Never a hiring recommendation, never writes application.status.
// Label: "Employer Decision Log — internal only".
// ============================================================================

export type EmployerJobApplicationDecisionType =
  | 'continue_process'
  | 'hold'
  | 'advance_to_offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'
  | 'other';

export type EmployerJobApplicationDecisionReasonCode =
  | 'skills_match'
  | 'experience_match'
  | 'assessment_evidence'
  | 'interview_evidence'
  | 'stronger_candidate'
  | 'insufficient_skill_evidence'
  | 'insufficient_experience'
  | 'insufficient_interview_evidence'
  | 'role_requirements_changed'
  | 'candidate_withdrew'
  | 'candidate_unavailable'
  | 'compensation_alignment'
  | 'timing'
  | 'other';

export const EMPLOYER_JOB_APPLICATION_DECISION_TYPES: EmployerJobApplicationDecisionType[] = [
  'continue_process',
  'hold',
  'advance_to_offer',
  'hired',
  'rejected',
  'withdrawn',
  'other',
];

export const EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES: EmployerJobApplicationDecisionReasonCode[] = [
  'skills_match',
  'experience_match',
  'assessment_evidence',
  'interview_evidence',
  'stronger_candidate',
  'insufficient_skill_evidence',
  'insufficient_experience',
  'insufficient_interview_evidence',
  'role_requirements_changed',
  'candidate_withdrew',
  'candidate_unavailable',
  'compensation_alignment',
  'timing',
  'other',
];

export interface EmployerJobApplicationDecisionActor {
  membershipId: string;
  displayName?: string;
}

export interface EmployerJobApplicationDecisionRecord {
  id: string;
  decisionType: EmployerJobApplicationDecisionType;
  reasonCode: EmployerJobApplicationDecisionReasonCode;
  notes?: string;
  applicationStatusAtDecision: EmployerJobApplicationStatus;
  createdAt: string;
  createdBy: EmployerJobApplicationDecisionActor;
}

export interface CreateEmployerJobApplicationDecisionPayload {
  decisionType: EmployerJobApplicationDecisionType;
  reasonCode: EmployerJobApplicationDecisionReasonCode;
  notes?: string;
}

export type GetEmployerJobApplicationDecisionsResponse = ApiEnvelope<{ decisions: EmployerJobApplicationDecisionRecord[] }>;
export type CreateEmployerJobApplicationDecisionResponse = ApiEnvelope<{ decision: EmployerJobApplicationDecisionRecord }>;

// ============================================================================
// Internal Employer Notes (Sprint 24A) — discussion/context only, immutable
// after creation. Never affects scores, recommendations, or pipeline
// status. Distinct from the 23E structured decision log. Never exposed to
// the candidate.
// ============================================================================

export interface EmployerJobApplicationNoteAuthor {
  membershipId: string;
  displayName?: string;
}

export interface EmployerJobApplicationNoteMention {
  membershipId: string;
  displayName?: string;
}

export interface EmployerJobApplicationNoteRecord {
  id: string;
  body: string;
  createdAt: string;
  author: EmployerJobApplicationNoteAuthor;
  mentions: EmployerJobApplicationNoteMention[];
}

export type GetEmployerJobApplicationNotesResponse = ApiEnvelope<{ notes: EmployerJobApplicationNoteRecord[] }>;
export type CreateEmployerJobApplicationNoteResponse = ApiEnvelope<{ note: EmployerJobApplicationNoteRecord }>;

// ============================================================================
// Application Collaboration Team + Mentions (Sprint 24B) — collaboration
// metadata only. `collaborationRole` is never an RBAC permission and never
// grants organization access. No email/SMS/push delivery — in-app
// discoverability only.
// ============================================================================

export type EmployerJobApplicationCollaborationRole = 'owner' | 'interviewer' | 'reviewer' | 'observer';

export const EMPLOYER_JOB_APPLICATION_COLLABORATION_ROLES: EmployerJobApplicationCollaborationRole[] = [
  'owner',
  'interviewer',
  'reviewer',
  'observer',
];

export interface EmployerJobApplicationCollaborator {
  membershipId: string;
  collaborationRole: EmployerJobApplicationCollaborationRole;
  displayName?: string;
  assignedByMembershipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployerAvailableCollaborationMember {
  membershipId: string;
  displayName?: string;
  role: string;
}

export interface EmployerJobApplicationCollaboratorsResponseData {
  collaborators: EmployerJobApplicationCollaborator[];
  availableMembers: EmployerAvailableCollaborationMember[];
}

export type GetEmployerJobApplicationCollaboratorsResponse = ApiEnvelope<EmployerJobApplicationCollaboratorsResponseData>;
export type AssignEmployerJobApplicationCollaboratorResponse = ApiEnvelope<{ collaborator: EmployerJobApplicationCollaborator }>;

export interface EmployerCollaborationMentionItem {
  noteId: string;
  body: string;
  applicationId: string;
  jobId: string;
  jobTitle?: string;
  candidate?: { firstName: string; lastName: string };
  author: { membershipId: string; displayName?: string };
  createdAt: string;
}

export interface EmployerCollaborationMentionsResponseData {
  mentions: EmployerCollaborationMentionItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export type GetEmployerCollaborationMentionsResponse = ApiEnvelope<EmployerCollaborationMentionsResponseData>;

// ============================================================================
// Employer Notification Center (Sprint 24C) — in-app only, no email/SMS/
// push. Recipient is always the current acting organization membership.
// Distinct from the 24B Mentions page (content-focused); this is a
// read/unread event inbox.
// ============================================================================

export type EmployerCollaborationNotificationType = 'note_mention' | 'collaborator_assigned';

export interface EmployerCollaborationNotificationItem {
  id: string;
  type: EmployerCollaborationNotificationType;
  read: boolean;
  createdAt: string;
  actor: { membershipId: string; displayName?: string };
  applicationId: string;
  jobId: string;
  candidate: { id: string; firstName?: string; lastName?: string };
  context: { noteId?: string; collaborationRole?: EmployerJobApplicationCollaborationRole };
}

export interface EmployerCollaborationNotificationsResponseData {
  notifications: EmployerCollaborationNotificationItem[];
  unreadCount: number;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export type GetEmployerCollaborationNotificationsResponse = ApiEnvelope<EmployerCollaborationNotificationsResponseData>;
export type MarkEmployerNotificationReadResponse = ApiEnvelope<{ id: string; read: boolean; readAt: string }>;
export type MarkAllEmployerNotificationsReadResponse = ApiEnvelope<{ updatedCount: number }>;

// ============================================================================
// Employer-to-Candidate Communication Log (Sprint 24D) — RECORDS
// communication history only; creating a row never sends an actual
// message. Distinct from 24A notes, 24B collaborators/mentions, 24C
// notifications. Never visible to the candidate.
// ============================================================================

export type EmployerCandidateCommunicationDirection = 'outbound' | 'inbound';
export type EmployerCandidateCommunicationChannel = 'email' | 'phone' | 'sms' | 'whatsapp' | 'video_call' | 'in_person' | 'other';
export type EmployerCandidateCommunicationType =
  | 'outreach'
  | 'interview_scheduling'
  | 'interview_update'
  | 'follow_up'
  | 'offer_discussion'
  | 'rejection_notice'
  | 'candidate_question'
  | 'general'
  | 'other';

export const EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS: EmployerCandidateCommunicationDirection[] = ['outbound', 'inbound'];

export const EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS: EmployerCandidateCommunicationChannel[] = [
  'email',
  'phone',
  'sms',
  'whatsapp',
  'video_call',
  'in_person',
  'other',
];

export const EMPLOYER_CANDIDATE_COMMUNICATION_TYPES: EmployerCandidateCommunicationType[] = [
  'outreach',
  'interview_scheduling',
  'interview_update',
  'follow_up',
  'offer_discussion',
  'rejection_notice',
  'candidate_question',
  'general',
  'other',
];

export interface EmployerCandidateCommunicationRecord {
  id: string;
  direction: EmployerCandidateCommunicationDirection;
  channel: EmployerCandidateCommunicationChannel;
  communicationType: EmployerCandidateCommunicationType;
  subject?: string;
  summary: string;
  occurredAt: string;
  createdAt: string;
  recordedBy: { membershipId: string; displayName?: string };
}

export interface CreateEmployerCandidateCommunicationPayload {
  direction: EmployerCandidateCommunicationDirection;
  channel: EmployerCandidateCommunicationChannel;
  communicationType: EmployerCandidateCommunicationType;
  subject?: string;
  summary: string;
  occurredAt?: string;
}

export type GetEmployerCandidateCommunicationsResponse = ApiEnvelope<{ communications: EmployerCandidateCommunicationRecord[] }>;
export type CreateEmployerCandidateCommunicationResponse = ApiEnvelope<{ communication: EmployerCandidateCommunicationRecord }>;

// ============================================================================
// Skill Graph (Sprint 25A) — deterministic (no AI) unification of
// structured skill/competency names into shared skill nodes + evidence
// edges. Candidate evidence is structured evidence PRESENCE only, never a
// proficiency certification.
// ============================================================================

export type EmployerSkillEvidenceSourceType = 'resume' | 'screening' | 'assessment' | 'evidence';

export interface EmployerSkillEvidenceSource {
  type: EmployerSkillEvidenceSourceType;
  sourceArtifactId: string;
  evidenceLevel?: string;
  score?: number;
}

export interface EmployerJobSkillGraphEntry {
  skillNodeId: string;
  canonicalName?: string;
  aliases: string[];
  importance?: string;
  weight?: number;
}

export interface EmployerCandidateSkillGraphEntry {
  skillNodeId: string;
  canonicalName?: string;
  aliases: string[];
  evidenceSources: EmployerSkillEvidenceSource[];
}

export interface EmployerSkillGraphCoverage {
  jobSkillCount: number;
  candidateEvidenceSkillCount: number;
  matchedSkillCount: number;
  missingJobSkillCount: number;
}

export interface EmployerApplicationSkillGraph {
  built: boolean;
  applicationId: string;
  jobSkills: EmployerJobSkillGraphEntry[];
  candidateSkills: EmployerCandidateSkillGraphEntry[];
  coverage: EmployerSkillGraphCoverage;
}

export type GetEmployerApplicationSkillGraphResponse = ApiEnvelope<EmployerApplicationSkillGraph>;
export type BuildEmployerApplicationSkillGraphResponse = ApiEnvelope<EmployerApplicationSkillGraph>;

// ============================================================================
// Skill Evidence Intelligence (Sprint 25B) — deterministic (no AI)
// evidence-strength/gap intelligence built from the current 25A skill
// graph. "Evidence strength" reflects the amount/quality of structured
// evidence CURRENTLY available — never a proficiency, mastery,
// success-probability, or hiring-recommendation score.
// ============================================================================

export type EmployerSkillClassification =
  | 'strong_evidence'
  | 'supported'
  | 'limited_evidence'
  | 'missing'
  | 'additional_candidate_skill';

export interface EmployerSkillSourceSummary {
  resume: boolean;
  screening: boolean;
  assessment: boolean;
  evidence: boolean;
}

export interface EmployerApplicationSkillIntelligenceEntry {
  skillNodeId: string;
  canonicalName?: string;
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  jobImportance?: string;
  jobWeight?: number;
  sourceSummary: EmployerSkillSourceSummary;
}

export interface EmployerApplicationSkillIntelligenceSummary {
  jobSkillCount: number;
  matchedSkillCount: number;
  strongEvidenceCount: number;
  supportedCount: number;
  limitedEvidenceCount: number;
  missingCount: number;
  additionalCandidateSkillCount: number;
  coveragePercent: number;
}

export interface EmployerApplicationSkillIntelligence {
  built: boolean;
  applicationId?: string;
  calculationVersion?: string;
  generatedAt?: string;
  skills?: EmployerApplicationSkillIntelligenceEntry[];
  summary?: EmployerApplicationSkillIntelligenceSummary;
}

export type GetEmployerApplicationSkillIntelligenceResponse = ApiEnvelope<EmployerApplicationSkillIntelligence>;
export type BuildEmployerApplicationSkillIntelligenceResponse = ApiEnvelope<EmployerApplicationSkillIntelligence>;

// ============================================================================
// Candidate Skill Memory (Sprint 25C) — longitudinal skill EVIDENCE memory
// across a candidate's applications within the SAME organization, rebuilt
// only from existing 25B intelligence rows. Older evidence may not
// represent the candidate's current skill level.
// ============================================================================

export interface EmployerCandidateSkillMemoryObservation {
  applicationId: string;
  jobId: string;
  jobTitle?: string;
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  sourceTypes: string[];
  observedAt: string;
}

export interface EmployerCandidateSkillMemoryEntry {
  skillNodeId: string;
  canonicalName?: string;
  latestClassification: EmployerSkillClassification;
  latestEvidenceStrengthScore?: number;
  firstObservedAt: string;
  lastObservedAt: string;
  observationCount: number;
  observations: EmployerCandidateSkillMemoryObservation[];
}

export interface EmployerCandidateSkillMemorySummary {
  skillCount: number;
  multiApplicationSkillCount: number;
  totalObservations: number;
}

export interface EmployerCandidateSkillMemory {
  built: boolean;
  candidate?: { id: string; firstName: string; lastName: string };
  summary: EmployerCandidateSkillMemorySummary;
  skills: EmployerCandidateSkillMemoryEntry[];
}

export type GetEmployerCandidateSkillMemoryResponse = ApiEnvelope<EmployerCandidateSkillMemory>;
export type RefreshEmployerCandidateSkillMemoryResponse = ApiEnvelope<EmployerCandidateSkillMemory>;

// ============================================================================
// Skill Evidence Evolution / Recency (Sprint 25D) — deterministic (no AI)
// interpretation of how the STRUCTURED EVIDENCE for a candidate skill
// changed across existing 25C memory observations. Never a claim that the
// candidate's actual skill improved or declined — only that the evidence
// this organization has collected got stronger/weaker/staler.
// ============================================================================

export type EmployerSkillEvolutionTrend = 'stronger_evidence' | 'stable_evidence' | 'weaker_evidence' | 'first_observation';
export type EmployerSkillEvidenceRecencyBucket = 'recent' | 'aging' | 'stale';

export interface EmployerSkillEvolutionObservationSnapshot {
  classification: EmployerSkillClassification;
  evidenceStrengthScore?: number;
  observedAt: string;
}

export interface EmployerSkillEvolutionRecency {
  daysSinceLastObservation: number;
  bucket: EmployerSkillEvidenceRecencyBucket;
}

export interface EmployerCandidateSkillEvolutionEntry {
  skillNodeId: string;
  canonicalName?: string;
  latest: EmployerSkillEvolutionObservationSnapshot;
  previous?: EmployerSkillEvolutionObservationSnapshot;
  trend: EmployerSkillEvolutionTrend;
  recency: EmployerSkillEvolutionRecency;
  observationCount: number;
  applicationCount: number;
}

export interface EmployerCandidateSkillEvolutionSummary {
  skillCount: number;
  strongerEvidenceCount: number;
  stableEvidenceCount: number;
  weakerEvidenceCount: number;
  staleEvidenceCount: number;
}

export interface EmployerCandidateSkillEvolution {
  built: boolean;
  candidate?: { id: string; firstName: string; lastName: string };
  summary: EmployerCandidateSkillEvolutionSummary;
  skills: EmployerCandidateSkillEvolutionEntry[];
}

export type GetEmployerCandidateSkillEvolutionResponse = ApiEnvelope<EmployerCandidateSkillEvolution>;
export type RefreshEmployerCandidateSkillEvolutionResponse = ApiEnvelope<EmployerCandidateSkillEvolution>;

// ============================================================================
// Organization Talent Skill Map & Search (Sprint 25E) — employer-internal
// discovery across candidates by EXISTING structured skill evidence
// (25A-25D). A search/read layer only — NOT candidate ranking, NOT a
// hiring recommendation. `displayPosition` is deterministic discovery
// ordering, never a fit/rank score.
// ============================================================================

export interface EmployerTalentSkillMapEntry {
  skillNodeId: string;
  canonicalName?: string;
  candidateCount: number;
  observationCount: number;
  recentEvidenceCandidateCount: number;
  staleEvidenceCandidateCount: number;
}

export interface EmployerTalentSkillMap {
  summary: {
    candidateCountWithSkillMemory: number;
    uniqueSkillCount: number;
    totalSkillObservations: number;
  };
  skills: EmployerTalentSkillMapEntry[];
}

export type GetEmployerTalentSkillMapResponse = ApiEnvelope<EmployerTalentSkillMap>;

export interface EmployerTalentSearchFilters {
  search?: string;
  skillNodeIds?: string[];
  classification?: Exclude<EmployerSkillClassification, 'missing'>;
  recencyBucket?: EmployerSkillEvidenceRecencyBucket;
  minEvidenceStrength?: number;
  page?: number;
  limit?: number;
}

export interface EmployerTalentMatchingSkill {
  skillNodeId: string;
  canonicalName?: string;
  latestClassification: EmployerSkillClassification;
  latestEvidenceStrengthScore?: number;
  lastObservedAt: string;
  observationCount: number;
  applicationCount: number;
  trend?: EmployerSkillEvolutionTrend;
  recencyBucket?: EmployerSkillEvidenceRecencyBucket;
}

export interface EmployerTalentSearchCandidateResult {
  candidate: { id: string; firstName: string; lastName: string };
  matchingSkills: EmployerTalentMatchingSkill[];
  matchSummary: { matchedSkillCount: number; strongestEvidenceScore?: number };
  displayPosition: number;
}

export interface EmployerTalentSearchResults {
  candidates: EmployerTalentSearchCandidateResult[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  skillMatchMode: 'all';
}

export type EmployerTalentSearchResponse = ApiEnvelope<EmployerTalentSearchResults>;

class EmployerApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          throw new Error('No response from server. Please check your connection.');
        } else {
          throw new Error(error.message || 'Failed to make request');
        }
      }
    );
  }

  async getCompanyProfile(organizationId: string): Promise<GetCompanyProfileResponse> {
    try {
      const response = await this.api.get<GetCompanyProfileResponse>(`/organizations/${organizationId}/company-profile`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load company profile');
    }
  }

  /** PATCH-like merge (despite being a PUT) — omitted fields keep their current value. At least one field required. */
  async updateCompanyProfile(organizationId: string, payload: CompanyProfile): Promise<UpdateCompanyProfileResponse> {
    try {
      const response = await this.api.put<UpdateCompanyProfileResponse>(
        `/organizations/${organizationId}/company-profile`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update company profile');
    }
  }

  // ---- Employer Jobs (Sprint 16B) ----

  async listJobs(
    organizationId: string,
    params: {
      status?: EmployerJobStatus;
      department?: string;
      workplaceType?: EmployerJobWorkplaceType;
      employmentType?: EmployerJobEmploymentType;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<ListJobsResponse> {
    try {
      const response = await this.api.get<ListJobsResponse>(`/organizations/${organizationId}/jobs`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load jobs');
    }
  }

  async getJob(organizationId: string, jobId: string): Promise<GetJobResponse> {
    try {
      const response = await this.api.get<GetJobResponse>(`/organizations/${organizationId}/jobs/${jobId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job');
    }
  }

  /** `status` always starts at draft server-side — never accepted here. */
  async createJob(organizationId: string, payload: EmployerJobPayload): Promise<CreateJobResponse> {
    try {
      const response = await this.api.post<CreateJobResponse>(`/organizations/${organizationId}/jobs`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create job');
    }
  }

  /** PATCH-like merge (despite being a PUT) — omitted fields keep their current value. Never changes status. */
  async updateJob(organizationId: string, jobId: string, payload: EmployerJobPayload): Promise<UpdateJobResponse> {
    try {
      const response = await this.api.put<UpdateJobResponse>(`/organizations/${organizationId}/jobs/${jobId}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update job');
    }
  }

  /** The ONLY way a job's status changes. The backend rejects same/invalid transitions with a 409. */
  async updateJobStatus(organizationId: string, jobId: string, status: EmployerJobStatus): Promise<UpdateJobStatusResponse> {
    try {
      const response = await this.api.post<UpdateJobStatusResponse>(`/organizations/${organizationId}/jobs/${jobId}/status`, {
        status,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update job status');
    }
  }

  /** Audit-only read, newest first. `changedByMembershipId` is a raw membership id, not resolved to a name — no unrestricted member lookup is used for this. */
  async getJobStatusHistory(
    organizationId: string,
    jobId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ListJobStatusHistoryResponse> {
    try {
      const response = await this.api.get<ListJobStatusHistoryResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/status-history`,
        { params }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job status history');
    }
  }

  // ---- Job Hiring Team (Sprint 16D) ----

  async getHiringTeam(organizationId: string, jobId: string): Promise<ListHiringTeamResponse> {
    try {
      const response = await this.api.get<ListHiringTeamResponse>(`/organizations/${organizationId}/jobs/${jobId}/hiring-team`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load hiring team');
    }
  }

  /** Safe to call even when the caller lacks members:view — this dedicated endpoint only requires interviews:manage. */
  async getAvailableMembers(organizationId: string, jobId: string): Promise<ListAvailableMembersResponse> {
    try {
      const response = await this.api.get<ListAvailableMembersResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/hiring-team/available-members`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load available members');
    }
  }

  async addHiringTeamMember(
    organizationId: string,
    jobId: string,
    payload: { membershipId: string; role: EmployerJobHiringTeamRole }
  ): Promise<AddHiringTeamMemberResponse> {
    try {
      const response = await this.api.post<AddHiringTeamMemberResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/hiring-team`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to add hiring team member');
    }
  }

  async updateHiringTeamMemberRole(
    organizationId: string,
    jobId: string,
    teamMemberId: string,
    role: EmployerJobHiringTeamRole
  ): Promise<UpdateHiringTeamMemberResponse> {
    try {
      const response = await this.api.put<UpdateHiringTeamMemberResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/hiring-team/${teamMemberId}`,
        { role }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update hiring team member');
    }
  }

  async removeHiringTeamMember(organizationId: string, jobId: string, teamMemberId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/jobs/${jobId}/hiring-team/${teamMemberId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to remove hiring team member');
    }
  }

  // ---- Job Description Intake (Sprint 17A) ----

  /** `current` is the highest-version source for this job (or null); `history` is newest-first, backend-limited. */
  async getJobDescriptionSources(organizationId: string, jobId: string): Promise<GetJobDescriptionResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionResponse>(`/organizations/${organizationId}/jobs/${jobId}/jd`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description');
    }
  }

  async getJobDescriptionSource(organizationId: string, jobId: string, jdSourceId: string): Promise<GetJobDescriptionSourceResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionSourceResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/${jdSourceId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description version');
    }
  }

  /** Always creates a NEW version and makes it current — never overwrites an existing one. */
  async createJobDescriptionSource(
    organizationId: string,
    jobId: string,
    payload: { rawText: string; sourceType: EmployerJobDescriptionSourceType }
  ): Promise<CreateJobDescriptionSourceResponse> {
    try {
      const response = await this.api.post<CreateJobDescriptionSourceResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save job description');
    }
  }

  // ---- Job Description Analysis (Sprint 17B) ----

  /**
   * Parses the CURRENT JD source only — no body. If a completed analysis
   * already exists for that exact source version, the backend returns it
   * without calling AI again; if one is already in progress, this throws
   * (surfaced as-is).
   */
  async analyzeCurrentJobDescription(organizationId: string, jobId: string): Promise<AnalyzeJobDescriptionResponse> {
    try {
      const response = await this.api.post<AnalyzeJobDescriptionResponse>(`/organizations/${organizationId}/jobs/${jobId}/jd/analyze`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to analyze job description');
    }
  }

  /** Current JD source's analysis, or `analysis: null` if it was never parsed. */
  async getCurrentJobDescriptionAnalysis(organizationId: string, jobId: string): Promise<GetJobDescriptionAnalysisResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionAnalysisResponse>(`/organizations/${organizationId}/jobs/${jobId}/jd/analysis`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description analysis');
    }
  }

  /** Analysis for one EXACT historical source version, or `analysis: null` if that version was never parsed. */
  async getJobDescriptionAnalysis(organizationId: string, jobId: string, jdSourceId: string): Promise<GetJobDescriptionAnalysisResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionAnalysisResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/${jdSourceId}/analysis`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description analysis');
    }
  }

  // ---- Job Description Skill Extraction (Sprint 17C) ----

  /**
   * Extracts skills from the CURRENT JD source's already-COMPLETED 17B
   * analysis — no body. Requires that analysis to exist and be completed
   * (the backend returns 409 otherwise). If a completed skill set already
   * exists for that exact source version, the backend returns it without
   * calling AI again.
   */
  async extractCurrentJobDescriptionSkills(organizationId: string, jobId: string): Promise<ExtractJobDescriptionSkillsResponse> {
    try {
      const response = await this.api.post<ExtractJobDescriptionSkillsResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/skills/extract`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to extract job description skills');
    }
  }

  /** Current JD source's skills, or `skills: null` if never extracted. */
  async getCurrentJobDescriptionSkills(organizationId: string, jobId: string): Promise<GetJobDescriptionSkillsResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionSkillsResponse>(`/organizations/${organizationId}/jobs/${jobId}/jd/skills`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description skills');
    }
  }

  /** Skills for one EXACT historical source version, or `skills: null` if that version's skills were never extracted. */
  async getJobDescriptionSkills(organizationId: string, jobId: string, jdSourceId: string): Promise<GetJobDescriptionSkillsResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionSkillsResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/${jdSourceId}/skills`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description skills');
    }
  }

  // ---- Job Description Competency Generation (Sprint 17D) ----

  /**
   * Generates competencies from the CURRENT JD source's already-COMPLETED
   * 17B analysis and 17C skills — no body. Requires both to exist and be
   * completed (the backend returns 409 otherwise, naming which prerequisite
   * is missing). If a completed competency blueprint already exists for
   * that exact source version, the backend returns it without calling AI
   * again.
   */
  async generateCurrentJobDescriptionCompetencies(
    organizationId: string,
    jobId: string
  ): Promise<GenerateJobDescriptionCompetenciesResponse> {
    try {
      const response = await this.api.post<GenerateJobDescriptionCompetenciesResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/competencies/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate job description competencies');
    }
  }

  /** Current JD source's competencies, or `competencies: null` if never generated. */
  async getCurrentJobDescriptionCompetencies(organizationId: string, jobId: string): Promise<GetJobDescriptionCompetenciesResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionCompetenciesResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/competencies`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description competencies');
    }
  }

  /** Competencies for one EXACT historical source version, or `competencies: null` if that version's competencies were never generated. */
  async getJobDescriptionCompetencies(
    organizationId: string,
    jobId: string,
    jdSourceId: string
  ): Promise<GetJobDescriptionCompetenciesResponse> {
    try {
      const response = await this.api.get<GetJobDescriptionCompetenciesResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/${jdSourceId}/competencies`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description competencies');
    }
  }

  // ---- Job Intelligence Finalization (Sprint 17E) — NO AI call. ----

  /**
   * Finalizes the CURRENT JD source's intelligence into an immutable
   * snapshot — no body. Requires a completed 17B analysis, completed 17C
   * skills, and completed 17D competencies (the backend returns 409 naming
   * whichever prerequisite is missing). If already finalized for this
   * exact source version, the backend returns the existing snapshot
   * without doing any new work.
   */
  async finalizeCurrentJobIntelligence(organizationId: string, jobId: string): Promise<FinalizeJobIntelligenceResponse> {
    try {
      const response = await this.api.post<FinalizeJobIntelligenceResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/intelligence/finalize`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to finalize job description intelligence');
    }
  }

  /** Current JD source's snapshot (or null) plus a DB-derived readiness checklist. */
  async getCurrentJobIntelligence(organizationId: string, jobId: string): Promise<GetCurrentJobIntelligenceResponse> {
    try {
      const response = await this.api.get<GetCurrentJobIntelligenceResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/intelligence`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description intelligence');
    }
  }

  /** Snapshot for one EXACT historical source version, or `snapshot: null` if that version was never finalized. */
  async getJobIntelligence(organizationId: string, jobId: string, jdSourceId: string): Promise<GetJobIntelligenceResponse> {
    try {
      const response = await this.api.get<GetJobIntelligenceResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/jd/${jdSourceId}/intelligence`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job description intelligence');
    }
  }

  // ---- Employer Candidates (Sprint 18A) ----

  async listCandidates(
    organizationId: string,
    params: {
      status?: EmployerCandidateStatus;
      source?: EmployerCandidateSource;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<ListCandidatesResponse> {
    try {
      const response = await this.api.get<ListCandidatesResponse>(`/organizations/${organizationId}/candidates`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load candidates');
    }
  }

  async getCandidate(organizationId: string, candidateId: string): Promise<GetCandidateResponse> {
    try {
      const response = await this.api.get<GetCandidateResponse>(`/organizations/${organizationId}/candidates/${candidateId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load candidate');
    }
  }

  /** `status` always starts at active server-side — never accepted here. `payload.sourceDetails` is optional and, if supplied, appends one source-attribution record (18E) alongside the new candidate. */
  async createCandidate(organizationId: string, payload: EmployerCandidateCreatePayload): Promise<CreateCandidateResponse> {
    try {
      const response = await this.api.post<CreateCandidateResponse>(`/organizations/${organizationId}/candidates`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create candidate');
    }
  }

  /** PATCH-like merge (despite being a PUT) — omitted fields keep their current value. Never changes status. */
  async updateCandidate(
    organizationId: string,
    candidateId: string,
    payload: EmployerCandidatePayload
  ): Promise<UpdateCandidateResponse> {
    try {
      const response = await this.api.put<UpdateCandidateResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update candidate');
    }
  }

  /** The ONLY way a candidate's status changes. The backend rejects same/invalid transitions with a 409. */
  async updateCandidateStatus(
    organizationId: string,
    candidateId: string,
    status: EmployerCandidateStatus
  ): Promise<UpdateCandidateStatusResponse> {
    try {
      const response = await this.api.post<UpdateCandidateStatusResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/status`,
        { status }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update candidate status');
    }
  }

  // ---- Employer Candidate Resumes (Sprint 18B) ----

  async getCandidateResumes(organizationId: string, candidateId: string): Promise<GetCandidateResumesResponse> {
    try {
      const response = await this.api.get<GetCandidateResumesResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load resumes');
    }
  }

  async getCandidateResume(organizationId: string, candidateId: string, resumeSourceId: string): Promise<GetCandidateResumeResponse> {
    try {
      const response = await this.api.get<GetCandidateResumeResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes/${resumeSourceId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load resume');
    }
  }

  /** Creates the NEXT resume version. `file` goes in as FormData under field name "resume" — never set Content-Type/boundary manually, axios/the browser handles it for FormData bodies. */
  async uploadCandidateResume(organizationId: string, candidateId: string, file: File): Promise<UploadCandidateResumeResponse> {
    try {
      const formData = new FormData();
      formData.append('resume', file);
      const response = await this.api.post<UploadCandidateResumeResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes`,
        formData
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload resume');
    }
  }

  /** Auth is bearer-token based (not cookies), so the file can't be fetched via a plain <a href>/window.open — this returns the raw Blob for the caller to turn into an object URL. */
  async getCandidateResumeFile(organizationId: string, candidateId: string, resumeSourceId: string): Promise<Blob> {
    try {
      const response = await this.api.get(`/organizations/${organizationId}/candidates/${candidateId}/resumes/${resumeSourceId}/file`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to download resume');
    }
  }

  // ---- Employer Candidate Resume Analysis (Sprint 18C) ----

  /** Parses the CURRENT resume only. If already completed for this exact resume version, the backend returns it without a new AI call. */
  async analyzeCurrentCandidateResume(organizationId: string, candidateId: string): Promise<AnalyzeCandidateResumeResponse> {
    try {
      const response = await this.api.post<AnalyzeCandidateResumeResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes/analyze`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to analyze resume');
    }
  }

  async getCurrentCandidateResumeAnalysis(organizationId: string, candidateId: string): Promise<GetCurrentCandidateResumeAnalysisResponse> {
    try {
      const response = await this.api.get<GetCurrentCandidateResumeAnalysisResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes/analysis`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load resume analysis');
    }
  }

  /** Analysis for one EXACT historical resume version — read-only, never triggers a new parse. */
  async getCandidateResumeAnalysis(
    organizationId: string,
    candidateId: string,
    resumeSourceId: string
  ): Promise<GetCandidateResumeAnalysisResponse> {
    try {
      const response = await this.api.get<GetCandidateResumeAnalysisResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/resumes/${resumeSourceId}/analysis`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load resume analysis');
    }
  }

  // ---- Employer Job Applications (Sprint 18D) ----

  async listApplications(
    organizationId: string,
    params: {
      jobId?: string;
      candidateId?: string;
      status?: EmployerJobApplicationStatus;
      source?: EmployerJobApplicationSource;
      search?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<ListApplicationsResponse> {
    try {
      const response = await this.api.get<ListApplicationsResponse>(`/organizations/${organizationId}/applications`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load applications');
    }
  }

  async getApplication(organizationId: string, applicationId: string): Promise<GetApplicationResponse> {
    try {
      const response = await this.api.get<GetApplicationResponse>(`/organizations/${organizationId}/applications/${applicationId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load application');
    }
  }

  /** `status` always starts at "applied" server-side — never accepted here. Duplicate {jobId, candidateId} is rejected with 409. */
  async createApplication(organizationId: string, payload: EmployerJobApplicationCreatePayload): Promise<CreateApplicationResponse> {
    try {
      const response = await this.api.post<CreateApplicationResponse>(`/organizations/${organizationId}/applications`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create application');
    }
  }

  /** PATCH-like merge (despite being a PUT) — only notes/source. Never changes status. */
  async updateApplication(
    organizationId: string,
    applicationId: string,
    payload: EmployerJobApplicationUpdatePayload
  ): Promise<UpdateApplicationResponse> {
    try {
      const response = await this.api.put<UpdateApplicationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update application');
    }
  }

  /** The ONLY way an application's status changes. The backend rejects same/invalid transitions with a 409. */
  async updateApplicationStatus(
    organizationId: string,
    applicationId: string,
    status: EmployerJobApplicationStatus
  ): Promise<UpdateApplicationStatusResponse> {
    try {
      const response = await this.api.post<UpdateApplicationStatusResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/status`,
        { status }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update application status');
    }
  }

  // ---- Employer Candidate Source Attribution (Sprint 18E) ----

  async listCandidateSourceAttributions(organizationId: string, candidateId: string): Promise<ListCandidateSourceAttributionsResponse> {
    try {
      const response = await this.api.get<ListCandidateSourceAttributionsResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/source-attributions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load source attributions');
    }
  }

  async getCandidateSourceAttribution(
    organizationId: string,
    candidateId: string,
    attributionId: string
  ): Promise<GetCandidateSourceAttributionResponse> {
    try {
      const response = await this.api.get<GetCandidateSourceAttributionResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/source-attributions/${attributionId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load source attribution');
    }
  }

  /** Append-only — there is no update/delete method, matching the backend's own contract. Never changes the candidate's own primary `source`. */
  async createCandidateSourceAttribution(
    organizationId: string,
    candidateId: string,
    payload: CandidateSourceAttributionCreatePayload
  ): Promise<CreateCandidateSourceAttributionResponse> {
    try {
      const response = await this.api.post<CreateCandidateSourceAttributionResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/source-attributions`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to record source attribution');
    }
  }

  // ---- Employer Candidate Screening (Sprint 19A) ----

  /** Screens against the CURRENT finalized JD snapshot and resolved resume analysis only. If already completed for that exact combination, the backend returns it without a new AI call. */
  async screenApplication(organizationId: string, applicationId: string): Promise<ScreenApplicationResponse> {
    try {
      const response = await this.api.post<ScreenApplicationResponse>(`/organizations/${organizationId}/applications/${applicationId}/screening`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to screen application');
    }
  }

  async getApplicationScreening(organizationId: string, applicationId: string): Promise<GetApplicationScreeningResponse> {
    try {
      const response = await this.api.get<GetApplicationScreeningResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/screening`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load screening');
    }
  }

  // ---- Explainable Candidate Score (Sprint 19B) ----

  /** Deterministic — if a score already exists for the current completed screening, the backend returns it without recalculating. */
  async calculateApplicationScreeningScore(organizationId: string, applicationId: string): Promise<CalculateApplicationScreeningScoreResponse> {
    try {
      const response = await this.api.post<CalculateApplicationScreeningScoreResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/screening/score`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to calculate explainable score');
    }
  }

  async getApplicationScreeningScore(organizationId: string, applicationId: string): Promise<GetApplicationScreeningScoreResponse> {
    try {
      const response = await this.api.get<GetApplicationScreeningScoreResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/screening/score`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load explainable score');
    }
  }

  // ---- Candidate Skill & Requirement Gap Analysis (Sprint 19C) ----

  /** Deterministic — if a gap analysis already exists for the current completed screening, the backend returns it without recalculating. */
  async generateApplicationScreeningGaps(organizationId: string, applicationId: string): Promise<GenerateApplicationScreeningGapsResponse> {
    try {
      const response = await this.api.post<GenerateApplicationScreeningGapsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/screening/gaps`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate gap analysis');
    }
  }

  async getApplicationScreeningGaps(organizationId: string, applicationId: string): Promise<GetApplicationScreeningGapsResponse> {
    try {
      const response = await this.api.get<GetApplicationScreeningGapsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/screening/gaps`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load gap analysis');
    }
  }

  // ---- Candidate Ranking (Sprint 19D) ----

  /** Live, deterministic, server-computed ranking — never client-sorted or client-reordered. */
  async getEmployerJobRanking(organizationId: string, jobId: string, filters: JobRankingFilters = {}): Promise<GetEmployerJobRankingResponse> {
    try {
      const response = await this.api.get<GetEmployerJobRankingResponse>(`/organizations/${organizationId}/jobs/${jobId}/ranking`, {
        params: filters,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load candidate ranking');
    }
  }

  // ---- Job Candidate Comparison (Sprint 23A) ----

  /** Live, deterministic, server-computed comparison — never client-sorted or client-reordered. Distinct from 19D ranking. */
  async getEmployerJobCandidateComparison(
    organizationId: string,
    jobId: string,
    filters: JobCandidateComparisonFilters = {}
  ): Promise<GetJobCandidateComparisonResponse> {
    try {
      const response = await this.api.get<GetJobCandidateComparisonResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/candidate-comparison`,
        { params: filters }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load candidate comparison');
    }
  }

  // ---- Hiring Pipeline Board (Sprint 23B) ----

  async getEmployerJobHiringPipeline(organizationId: string, jobId: string): Promise<GetJobHiringPipelineResponse> {
    try {
      const response = await this.api.get<GetJobHiringPipelineResponse>(`/organizations/${organizationId}/jobs/${jobId}/pipeline`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load hiring pipeline');
    }
  }

  /** Pure pass-through to the existing application status transition map — never a new lifecycle. */
  async moveApplicationPipelineStage(
    organizationId: string,
    applicationId: string,
    status: EmployerJobApplicationStatus
  ): Promise<MoveApplicationPipelineStageResponse> {
    try {
      const response = await this.api.patch<MoveApplicationPipelineStageResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/pipeline-stage`,
        { status }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update pipeline stage');
    }
  }

  // ---- Job Pipeline Funnel & Conversion Analytics (Sprint 23D) ----

  async getEmployerJobPipelineAnalytics(organizationId: string, jobId: string): Promise<GetJobPipelineAnalyticsResponse> {
    try {
      const response = await this.api.get<GetJobPipelineAnalyticsResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/pipeline-analytics`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load pipeline analytics');
    }
  }

  // ---- Collaboration & Communication Analytics (Sprint 24E) ----

  async getEmployerJobCollaborationAnalytics(organizationId: string, jobId: string): Promise<GetJobCollaborationAnalyticsResponse> {
    try {
      const response = await this.api.get<GetJobCollaborationAnalyticsResponse>(
        `/organizations/${organizationId}/jobs/${jobId}/collaboration-analytics`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load collaboration analytics');
    }
  }

  // ---- Employer Shortlist Workflow (Sprint 19E) ----

  /** An explicit recruiter action — never automatic. Transitions the application screening -> shortlisted under the hood (18D) and records which screening/score supported the decision. */
  async shortlistApplication(organizationId: string, applicationId: string): Promise<ShortlistApplicationResponse> {
    try {
      const response = await this.api.post<ShortlistApplicationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/shortlist`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to shortlist candidate');
    }
  }

  async getApplicationShortlist(organizationId: string, applicationId: string): Promise<GetApplicationShortlistResponse> {
    try {
      const response = await this.api.get<GetApplicationShortlistResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/shortlist`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load shortlist decision');
    }
  }

  async getEmployerJobShortlist(organizationId: string, jobId: string): Promise<GetEmployerJobShortlistResponse> {
    try {
      const response = await this.api.get<GetEmployerJobShortlistResponse>(`/organizations/${organizationId}/jobs/${jobId}/shortlist`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load job shortlist');
    }
  }

  // ---- Employer Interview Blueprint (Sprint 20A) ----

  /** Generates against the CURRENT applicable screening/score/(optional) gap and finalized JD snapshot only. If already completed for that exact screening, the backend returns it without a new AI call. */
  async generateEmployerInterviewBlueprint(organizationId: string, applicationId: string): Promise<GenerateEmployerInterviewBlueprintResponse> {
    try {
      const response = await this.api.post<GenerateEmployerInterviewBlueprintResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-blueprint`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate interview blueprint');
    }
  }

  async getEmployerInterviewBlueprint(organizationId: string, applicationId: string): Promise<GetEmployerInterviewBlueprintResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewBlueprintResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-blueprint`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview blueprint');
    }
  }

  // ---- Interview Competency Coverage / Evaluation Rubric (Sprint 20B) ----

  /** No AI call — a deterministic transformation of the CURRENT completed blueprint. If already generated for that exact blueprint, the backend returns it without recomputing. */
  async generateEmployerInterviewRubric(organizationId: string, applicationId: string): Promise<GenerateEmployerInterviewRubricResponse> {
    try {
      const response = await this.api.post<GenerateEmployerInterviewRubricResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-blueprint/rubric`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate interview evaluation rubric');
    }
  }

  async getEmployerInterviewRubric(organizationId: string, applicationId: string): Promise<GetEmployerInterviewRubricResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewRubricResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-blueprint/rubric`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview evaluation rubric');
    }
  }

  // ---- Employer Interview Invitation (Sprint 20C) ----

  /** Returns `{ invitation, token }` — the raw token is shown ONLY here, never again afterward. */
  async createEmployerInterviewInvitation(
    organizationId: string,
    applicationId: string,
    payload: CreateEmployerInterviewInvitationPayload = {}
  ): Promise<CreateEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.post<CreateEmployerInterviewInvitationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-invitation`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create interview invitation');
    }
  }

  async getEmployerInterviewInvitation(organizationId: string, applicationId: string): Promise<GetEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewInvitationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-invitation`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview invitation');
    }
  }

  /** Only when the existing invitation is expired or revoked. Returns a brand-new raw token, shown ONLY here. */
  async regenerateEmployerInterviewInvitation(
    organizationId: string,
    applicationId: string
  ): Promise<RegenerateEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.post<RegenerateEmployerInterviewInvitationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-invitation/regenerate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to regenerate interview invitation');
    }
  }

  /** Only when the existing invitation is active. No hard delete. */
  async revokeEmployerInterviewInvitation(organizationId: string, applicationId: string): Promise<RevokeEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.post<RevokeEmployerInterviewInvitationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-invitation/revoke`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to revoke interview invitation');
    }
  }

  // ---- Employer Interview Session (Sprint 20E) — read only ----

  async getEmployerInterviewSession(organizationId: string, applicationId: string): Promise<GetEmployerInterviewSessionResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewSessionResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview session');
    }
  }

  async getEmployerInterviewSessionQuestions(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerInterviewSessionQuestionsResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewSessionQuestionsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/questions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview questions');
    }
  }

  async getEmployerInterviewSessionAnswers(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerInterviewSessionAnswersResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewSessionAnswersResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/answers`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview answers');
    }
  }

  /** Triggers question-level evaluation (21D) — idempotent if already evaluated. */
  async evaluateEmployerInterviewSession(
    organizationId: string,
    applicationId: string
  ): Promise<EvaluateEmployerInterviewSessionResponse> {
    try {
      const response = await this.api.post<EvaluateEmployerInterviewSessionResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/evaluate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to evaluate interview');
    }
  }

  async getEmployerHiringAnswerReasoningSignals(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GetEmployerHiringAnswerReasoningSignalsResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringAnswerReasoningSignalsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/reasoning-signals`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load reasoning evidence');
    }
  }

  /** No client artifact IDs — the server resolves the question/rubric/evaluation itself. */
  async generateEmployerHiringAnswerReasoningSignals(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GenerateEmployerHiringAnswerReasoningSignalsResponse> {
    try {
      const response = await this.api.post<GenerateEmployerHiringAnswerReasoningSignalsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/reasoning-signals/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate reasoning evidence');
    }
  }

  async getEmployerHiringAnswerConfidenceSignals(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GetEmployerHiringAnswerConfidenceSignalsResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringAnswerConfidenceSignalsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/confidence-signals`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load confidence intelligence');
    }
  }

  /** No client artifact IDs — the server resolves the question/rubric/evaluation itself. 26A is optional enrichment only. */
  async generateEmployerHiringAnswerConfidenceSignals(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GenerateEmployerHiringAnswerConfidenceSignalsResponse> {
    try {
      const response = await this.api.post<GenerateEmployerHiringAnswerConfidenceSignalsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/confidence-signals/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate confidence intelligence');
    }
  }

  async getEmployerHiringAssessmentConsistency(
    organizationId: string,
    interviewId: string
  ): Promise<GetEmployerHiringAssessmentConsistencyResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringAssessmentConsistencyResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/consistency`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load consistency analysis');
    }
  }

  /** No client artifact IDs — the server resolves all answers/evaluations itself. */
  async generateEmployerHiringAssessmentConsistency(
    organizationId: string,
    interviewId: string
  ): Promise<GenerateEmployerHiringAssessmentConsistencyResponse> {
    try {
      const response = await this.api.post<GenerateEmployerHiringAssessmentConsistencyResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/consistency/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate consistency analysis');
    }
  }

  async getEmployerHiringClaimVerification(organizationId: string, interviewId: string): Promise<GetEmployerHiringClaimVerificationResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringClaimVerificationResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/claim-verification`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load claim evidence alignment');
    }
  }

  /** No source artifact IDs from the client — the server resolves/pins structured evidence itself. */
  async generateEmployerHiringClaimVerification(
    organizationId: string,
    interviewId: string
  ): Promise<GenerateEmployerHiringClaimVerificationResponse> {
    try {
      const response = await this.api.post<GenerateEmployerHiringClaimVerificationResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/claim-verification/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate claim evidence alignment');
    }
  }

  async getEmployerHiringReasoningConfidenceAggregate(
    organizationId: string,
    interviewId: string
  ): Promise<GetEmployerHiringReasoningConfidenceAggregateResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringReasoningConfidenceAggregateResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/reasoning-confidence-aggregate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load reasoning & confidence overview');
    }
  }

  /** Deterministic, no AI — idempotent upsert-in-place rebuild. No client artifact IDs. */
  async buildEmployerHiringReasoningConfidenceAggregate(
    organizationId: string,
    interviewId: string
  ): Promise<BuildEmployerHiringReasoningConfidenceAggregateResponse> {
    try {
      const response = await this.api.post<BuildEmployerHiringReasoningConfidenceAggregateResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/reasoning-confidence-aggregate/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build reasoning & confidence overview');
    }
  }

  async getEmployerInterviewGraph(organizationId: string, interviewId: string): Promise<GetEmployerInterviewGraphResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewGraphResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/graph`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview graph');
    }
  }

  /** Deterministic, no AI — idempotent upsert-in-place rebuild. No client artifact IDs. */
  async buildEmployerInterviewGraph(organizationId: string, interviewId: string): Promise<BuildEmployerInterviewGraphResponse> {
    try {
      const response = await this.api.post<BuildEmployerInterviewGraphResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/graph/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build interview graph');
    }
  }

  async getEmployerInterviewFollowUpRoute(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GetEmployerInterviewFollowUpRouteResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewFollowUpRouteResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/follow-up-route`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load follow-up route');
    }
  }

  /** No client graph/rubric/evaluation IDs — the server resolves everything itself. May append one new question to the interview when decision is follow_up. */
  async generateEmployerInterviewFollowUpRoute(
    organizationId: string,
    interviewId: string,
    questionIndex: number
  ): Promise<GenerateEmployerInterviewFollowUpRouteResponse> {
    try {
      const response = await this.api.post<GenerateEmployerInterviewFollowUpRouteResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/questions/${questionIndex}/follow-up-route`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate follow-up route');
    }
  }

  async getEmployerInterviewCompetencyCoverage(
    organizationId: string,
    interviewId: string
  ): Promise<GetEmployerInterviewCompetencyCoverageResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewCompetencyCoverageResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/competency-coverage`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load competency coverage');
    }
  }

  /** Deterministic, no AI — idempotent upsert-in-place rebuild. No client graph/question IDs. */
  async buildEmployerInterviewCompetencyCoverage(
    organizationId: string,
    interviewId: string
  ): Promise<BuildEmployerInterviewCompetencyCoverageResponse> {
    try {
      const response = await this.api.post<BuildEmployerInterviewCompetencyCoverageResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/competency-coverage/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build competency coverage');
    }
  }

  /** No candidate artifact IDs — body may only carry an optional `sourceQuestionIndex`. Never generates a new question. */
  async selectEmployerInterviewAdaptiveRoute(
    organizationId: string,
    interviewId: string,
    sourceQuestionIndex?: number
  ): Promise<SelectEmployerInterviewAdaptiveRouteResponse> {
    try {
      const response = await this.api.post<SelectEmployerInterviewAdaptiveRouteResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/adaptive-route`,
        sourceQuestionIndex !== undefined ? { sourceQuestionIndex } : {}
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to select next question');
    }
  }

  async getEmployerInterviewAdaptiveRouteHistory(
    organizationId: string,
    interviewId: string
  ): Promise<GetEmployerInterviewAdaptiveRouteHistoryResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewAdaptiveRouteHistoryResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/adaptive-routes`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load adaptive routing history');
    }
  }

  async getEmployerInterviewGraphAnalytics(organizationId: string, interviewId: string): Promise<GetEmployerInterviewGraphAnalyticsResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewGraphAnalyticsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/graph-analytics`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview graph analytics');
    }
  }

  /** Deterministic, no AI — idempotent upsert-in-place rebuild. No client artifact IDs. */
  async buildEmployerInterviewGraphAnalytics(organizationId: string, interviewId: string): Promise<BuildEmployerInterviewGraphAnalyticsResponse> {
    try {
      const response = await this.api.post<BuildEmployerInterviewGraphAnalyticsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/graph-analytics/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build interview graph analytics');
    }
  }

  async createEmployerInterviewScenario(
    organizationId: string,
    interviewId: string,
    input: EmployerInterviewScenarioInput
  ): Promise<CreateEmployerInterviewScenarioResponse> {
    try {
      const response = await this.api.post<CreateEmployerInterviewScenarioResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios`,
        input
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create scenario');
    }
  }

  async listEmployerInterviewScenarios(organizationId: string, interviewId: string): Promise<ListEmployerInterviewScenariosResponse> {
    try {
      const response = await this.api.get<ListEmployerInterviewScenariosResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenarios');
    }
  }

  async getEmployerInterviewScenario(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<GetEmployerInterviewScenarioResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewScenarioResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenario');
    }
  }

  async updateEmployerInterviewScenario(
    organizationId: string,
    interviewId: string,
    scenarioId: string,
    updates: Partial<EmployerInterviewScenarioInput> & { status?: EmployerInterviewScenarioStatus }
  ): Promise<UpdateEmployerInterviewScenarioResponse> {
    try {
      const response = await this.api.patch<UpdateEmployerInterviewScenarioResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}`,
        updates
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update scenario');
    }
  }

  async archiveEmployerInterviewScenario(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<ArchiveEmployerInterviewScenarioResponse> {
    try {
      const response = await this.api.post<ArchiveEmployerInterviewScenarioResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/archive`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to archive scenario');
    }
  }

  async getEmployerInterviewScenarioQuestions(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<GetEmployerInterviewScenarioQuestionsResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewScenarioQuestionsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/questions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenario questions');
    }
  }

  /** No client rubric/application/job IDs — the server resolves everything from the exact ready scenario. */
  async generateEmployerInterviewScenarioQuestions(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<GenerateEmployerInterviewScenarioQuestionsResponse> {
    try {
      const response = await this.api.post<GenerateEmployerInterviewScenarioQuestionsResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/questions/generate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate scenario questions');
    }
  }

  async getEmployerScenarioResponseEvaluation(
    organizationId: string,
    interviewId: string,
    scenarioId: string,
    questionSequence: number
  ): Promise<GetEmployerScenarioResponseEvaluationResponse> {
    try {
      const response = await this.api.get<GetEmployerScenarioResponseEvaluationResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/responses/${questionSequence}/evaluate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load response evaluation');
    }
  }

  /** No client rubric/questionSet/application IDs. */
  async generateEmployerScenarioResponseEvaluation(
    organizationId: string,
    interviewId: string,
    scenarioId: string,
    questionSequence: number
  ): Promise<GenerateEmployerScenarioResponseEvaluationResponse> {
    try {
      const response = await this.api.post<GenerateEmployerScenarioResponseEvaluationResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/responses/${questionSequence}/evaluate`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate response evaluation');
    }
  }

  async getEmployerInterviewScenarioSession(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<GetEmployerInterviewScenarioSessionResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewScenarioSessionResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/session`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenario session');
    }
  }

  async getEmployerInterviewScenarioReport(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<GetEmployerInterviewScenarioReportResponse> {
    try {
      const response = await this.api.get<GetEmployerInterviewScenarioReportResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/report`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenario report');
    }
  }

  /** Deterministic, no AI — idempotent upsert-in-place rebuild. No client session/questionSet/rubric/application/job IDs. */
  async buildEmployerInterviewScenarioReport(
    organizationId: string,
    interviewId: string,
    scenarioId: string
  ): Promise<BuildEmployerInterviewScenarioReportResponse> {
    try {
      const response = await this.api.post<BuildEmployerInterviewScenarioReportResponse>(
        `/organizations/${organizationId}/interviews/${interviewId}/scenarios/${scenarioId}/report/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build scenario report');
    }
  }

  async createOrganizationKnowledgeBase(
    organizationId: string,
    input: OrganizationKnowledgeBaseInput
  ): Promise<CreateOrganizationKnowledgeBaseResponse> {
    try {
      const response = await this.api.post<CreateOrganizationKnowledgeBaseResponse>(`/organizations/${organizationId}/knowledge-bases`, input);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create knowledge base');
    }
  }

  async listOrganizationKnowledgeBases(organizationId: string): Promise<ListOrganizationKnowledgeBasesResponse> {
    try {
      const response = await this.api.get<ListOrganizationKnowledgeBasesResponse>(`/organizations/${organizationId}/knowledge-bases`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load knowledge bases');
    }
  }

  async getOrganizationKnowledgeBase(organizationId: string, knowledgeBaseId: string): Promise<GetOrganizationKnowledgeBaseResponse> {
    try {
      const response = await this.api.get<GetOrganizationKnowledgeBaseResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load knowledge base');
    }
  }

  async updateOrganizationKnowledgeBase(
    organizationId: string,
    knowledgeBaseId: string,
    updates: Partial<OrganizationKnowledgeBaseInput>
  ): Promise<UpdateOrganizationKnowledgeBaseResponse> {
    try {
      const response = await this.api.patch<UpdateOrganizationKnowledgeBaseResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}`,
        updates
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update knowledge base');
    }
  }

  async archiveOrganizationKnowledgeBase(organizationId: string, knowledgeBaseId: string): Promise<ArchiveOrganizationKnowledgeBaseResponse> {
    try {
      const response = await this.api.post<ArchiveOrganizationKnowledgeBaseResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/archive`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to archive knowledge base');
    }
  }

  async listOrganizationKnowledgeDocuments(
    organizationId: string,
    knowledgeBaseId: string
  ): Promise<ListOrganizationKnowledgeDocumentsResponse> {
    try {
      const response = await this.api.get<ListOrganizationKnowledgeDocumentsResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load documents');
    }
  }

  async getOrganizationKnowledgeDocument(
    organizationId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<GetOrganizationKnowledgeDocumentResponse> {
    try {
      const response = await this.api.get<GetOrganizationKnowledgeDocumentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load document');
    }
  }

  /** Employer-only full parsed text — never exposed publicly. */
  async getOrganizationKnowledgeDocumentContent(
    organizationId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<GetOrganizationKnowledgeDocumentContentResponse> {
    try {
      const response = await this.api.get<GetOrganizationKnowledgeDocumentContentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/content`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load document content');
    }
  }

  async uploadOrganizationKnowledgeDocument(
    organizationId: string,
    knowledgeBaseId: string,
    file: File,
    title?: string,
    description?: string
  ): Promise<UploadOrganizationKnowledgeDocumentResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (title) formData.append('title', title);
      if (description) formData.append('description', description);
      const response = await this.api.post<UploadOrganizationKnowledgeDocumentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to upload document');
    }
  }

  async createOrganizationKnowledgeTextDocument(
    organizationId: string,
    knowledgeBaseId: string,
    input: { title: string; description?: string; text: string }
  ): Promise<CreateOrganizationKnowledgeTextDocumentResponse> {
    try {
      const response = await this.api.post<CreateOrganizationKnowledgeTextDocumentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/text`,
        input
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create document');
    }
  }

  /** Reparses from the persisted original file only — never available for `text` documents. */
  async reprocessOrganizationKnowledgeDocument(
    organizationId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<ReprocessOrganizationKnowledgeDocumentResponse> {
    try {
      const response = await this.api.post<ReprocessOrganizationKnowledgeDocumentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/reprocess`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to reprocess document');
    }
  }

  async archiveOrganizationKnowledgeDocument(
    organizationId: string,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<ArchiveOrganizationKnowledgeDocumentResponse> {
    try {
      const response = await this.api.post<ArchiveOrganizationKnowledgeDocumentResponse>(
        `/organizations/${organizationId}/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/archive`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to archive document');
    }
  }

  /** Idempotent — an existing result is returned as-is, never recomputed. */
  async createEmployerHiringAssessmentResult(
    organizationId: string,
    applicationId: string
  ): Promise<CreateEmployerHiringAssessmentResultResponse> {
    try {
      const response = await this.api.post<CreateEmployerHiringAssessmentResultResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/result`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate assessment result');
    }
  }

  async getEmployerHiringAssessmentResult(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerHiringAssessmentResultResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringAssessmentResultResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/result`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assessment result');
    }
  }

  /** Idempotent — an existing matrix is returned as-is, never recomputed. */
  async createEmployerHiringEvidenceMatrix(
    organizationId: string,
    applicationId: string
  ): Promise<CreateEmployerHiringEvidenceMatrixResponse> {
    try {
      const response = await this.api.post<CreateEmployerHiringEvidenceMatrixResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/evidence`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate evidence analysis');
    }
  }

  async getEmployerHiringEvidenceMatrix(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerHiringEvidenceMatrixResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringEvidenceMatrixResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/evidence`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load evidence analysis');
    }
  }

  /** Idempotent — an existing COMPLETED plan is returned as-is, never recomputed. */
  async createEmployerHiringFollowUpPlan(
    organizationId: string,
    applicationId: string
  ): Promise<CreateEmployerHiringFollowUpPlanResponse> {
    try {
      const response = await this.api.post<CreateEmployerHiringFollowUpPlanResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/follow-up-plan`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate follow-up plan');
    }
  }

  async getEmployerHiringFollowUpPlan(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerHiringFollowUpPlanResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringFollowUpPlanResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/follow-up-plan`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load follow-up plan');
    }
  }

  /** Idempotent — an existing COMPLETED report is returned as-is, never regenerated. */
  async createEmployerHiringAssessmentReport(
    organizationId: string,
    applicationId: string
  ): Promise<CreateEmployerHiringAssessmentReportResponse> {
    try {
      const response = await this.api.post<CreateEmployerHiringAssessmentReportResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/report`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to generate hiring report');
    }
  }

  async getEmployerHiringAssessmentReport(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerHiringAssessmentReportResponse> {
    try {
      const response = await this.api.get<GetEmployerHiringAssessmentReportResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/report`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load hiring report');
    }
  }

  async getHiringReportReviewSummary(
    organizationId: string,
    applicationId: string
  ): Promise<GetHiringReportReviewSummaryResponse> {
    try {
      const response = await this.api.get<GetHiringReportReviewSummaryResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/report/reviews`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load review summary');
    }
  }

  /** Upserts only the CALLER's own review — never another reviewer's. */
  async upsertHiringReportReview(
    organizationId: string,
    applicationId: string,
    reviewNotes?: string
  ): Promise<UpsertHiringReportReviewResponse> {
    try {
      const response = await this.api.post<UpsertHiringReportReviewResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/report/reviews`,
        { reviewNotes }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save review');
    }
  }

  /** Downloads the existing immutable 22C report as a PDF and triggers a browser save. */
  async downloadHiringReportExport(organizationId: string, applicationId: string): Promise<void> {
    try {
      const response = await this.api.get(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/report/export`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hiring-report-${applicationId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to download hiring report');
    }
  }

  async getHiringAssessmentFinalization(
    organizationId: string,
    applicationId: string
  ): Promise<GetHiringAssessmentFinalizationResponse> {
    try {
      const response = await this.api.get<GetHiringAssessmentFinalizationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/finalization`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load finalization readiness');
    }
  }

  /** Idempotent — an existing finalization is returned as-is, never recalculated. */
  async createHiringAssessmentFinalization(
    organizationId: string,
    applicationId: string
  ): Promise<CreateHiringAssessmentFinalizationResponse> {
    try {
      const response = await this.api.post<CreateHiringAssessmentFinalizationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/interview-session/finalization`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to finalize assessment package');
    }
  }

  async getApplicationTimeline(organizationId: string, applicationId: string): Promise<GetApplicationTimelineResponse> {
    try {
      const response = await this.api.get<GetApplicationTimelineResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/timeline`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load application timeline');
    }
  }

  async getEmployerJobApplicationDecisions(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerJobApplicationDecisionsResponse> {
    try {
      const response = await this.api.get<GetEmployerJobApplicationDecisionsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/decisions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load decision log');
    }
  }

  /** Records an internal audit note only — never changes the application's pipeline stage. */
  async createEmployerJobApplicationDecision(
    organizationId: string,
    applicationId: string,
    payload: CreateEmployerJobApplicationDecisionPayload
  ): Promise<CreateEmployerJobApplicationDecisionResponse> {
    try {
      const response = await this.api.post<CreateEmployerJobApplicationDecisionResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/decisions`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to record decision');
    }
  }

  async getEmployerJobApplicationNotes(organizationId: string, applicationId: string): Promise<GetEmployerJobApplicationNotesResponse> {
    try {
      const response = await this.api.get<GetEmployerJobApplicationNotesResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/notes`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load notes');
    }
  }

  /** Immutable after creation — no edit/delete in 24A. `mentionMembershipIds` are explicit, UI-selected teammates only (max 10). */
  async createEmployerJobApplicationNote(
    organizationId: string,
    applicationId: string,
    body: string,
    mentionMembershipIds?: string[]
  ): Promise<CreateEmployerJobApplicationNoteResponse> {
    try {
      const response = await this.api.post<CreateEmployerJobApplicationNoteResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/notes`,
        { body, mentionMembershipIds }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to add note');
    }
  }

  async getEmployerJobApplicationCollaborators(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerJobApplicationCollaboratorsResponse> {
    try {
      const response = await this.api.get<GetEmployerJobApplicationCollaboratorsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/collaborators`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load collaborators');
    }
  }

  /** Upserts one collaborator assignment — collaboration metadata only, never an RBAC permission. */
  async assignEmployerJobApplicationCollaborator(
    organizationId: string,
    applicationId: string,
    membershipId: string,
    collaborationRole: EmployerJobApplicationCollaborationRole
  ): Promise<AssignEmployerJobApplicationCollaboratorResponse> {
    try {
      const response = await this.api.post<AssignEmployerJobApplicationCollaboratorResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/collaborators`,
        { membershipId, collaborationRole }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to assign collaborator');
    }
  }

  async removeEmployerJobApplicationCollaborator(organizationId: string, applicationId: string, membershipId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/applications/${applicationId}/collaborators/${membershipId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to remove collaborator');
    }
  }

  async getEmployerCollaborationMentions(
    organizationId: string,
    page = 1,
    limit = 20
  ): Promise<GetEmployerCollaborationMentionsResponse> {
    try {
      const response = await this.api.get<GetEmployerCollaborationMentionsResponse>(
        `/organizations/${organizationId}/collaboration/mentions`,
        { params: { page, limit } }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load mentions');
    }
  }

  async getEmployerCollaborationNotifications(
    organizationId: string,
    page = 1,
    limit = 20,
    unreadOnly = false
  ): Promise<GetEmployerCollaborationNotificationsResponse> {
    try {
      const response = await this.api.get<GetEmployerCollaborationNotificationsResponse>(
        `/organizations/${organizationId}/collaboration/notifications`,
        { params: { page, limit, unreadOnly } }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load notifications');
    }
  }

  async markEmployerNotificationRead(organizationId: string, notificationId: string): Promise<MarkEmployerNotificationReadResponse> {
    try {
      const response = await this.api.patch<MarkEmployerNotificationReadResponse>(
        `/organizations/${organizationId}/collaboration/notifications/${notificationId}/read`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to mark notification as read');
    }
  }

  async markAllEmployerNotificationsRead(organizationId: string): Promise<MarkAllEmployerNotificationsReadResponse> {
    try {
      const response = await this.api.post<MarkAllEmployerNotificationsReadResponse>(
        `/organizations/${organizationId}/collaboration/notifications/read-all`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to mark all notifications as read');
    }
  }

  async getEmployerCandidateCommunications(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerCandidateCommunicationsResponse> {
    try {
      const response = await this.api.get<GetEmployerCandidateCommunicationsResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/communications`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load communication history');
    }
  }

  /** Records communication history only — never sends an actual message. */
  async createEmployerCandidateCommunication(
    organizationId: string,
    applicationId: string,
    payload: CreateEmployerCandidateCommunicationPayload
  ): Promise<CreateEmployerCandidateCommunicationResponse> {
    try {
      const response = await this.api.post<CreateEmployerCandidateCommunicationResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/communications`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to record communication');
    }
  }

  async getEmployerApplicationSkillGraph(organizationId: string, applicationId: string): Promise<GetEmployerApplicationSkillGraphResponse> {
    try {
      const response = await this.api.get<GetEmployerApplicationSkillGraphResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/skill-graph`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load skill graph');
    }
  }

  /** Idempotent deterministic rebuild — never accepts artifact ids from the caller. */
  async buildEmployerApplicationSkillGraph(
    organizationId: string,
    applicationId: string
  ): Promise<BuildEmployerApplicationSkillGraphResponse> {
    try {
      const response = await this.api.post<BuildEmployerApplicationSkillGraphResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/skill-graph/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build skill graph');
    }
  }

  async getEmployerApplicationSkillIntelligence(
    organizationId: string,
    applicationId: string
  ): Promise<GetEmployerApplicationSkillIntelligenceResponse> {
    try {
      const response = await this.api.get<GetEmployerApplicationSkillIntelligenceResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/skill-intelligence`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load skill evidence intelligence');
    }
  }

  /** Requires an existing built 25A skill graph; never auto-builds it. */
  async buildEmployerApplicationSkillIntelligence(
    organizationId: string,
    applicationId: string
  ): Promise<BuildEmployerApplicationSkillIntelligenceResponse> {
    try {
      const response = await this.api.post<BuildEmployerApplicationSkillIntelligenceResponse>(
        `/organizations/${organizationId}/applications/${applicationId}/skill-intelligence/build`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to build skill evidence intelligence');
    }
  }

  async getEmployerCandidateSkillMemory(organizationId: string, candidateId: string): Promise<GetEmployerCandidateSkillMemoryResponse> {
    try {
      const response = await this.api.get<GetEmployerCandidateSkillMemoryResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/skill-memory`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load skill memory');
    }
  }

  /** Rebuilds ONLY from existing 25B intelligence rows across this candidate's applications in this organization. */
  async refreshEmployerCandidateSkillMemory(
    organizationId: string,
    candidateId: string
  ): Promise<RefreshEmployerCandidateSkillMemoryResponse> {
    try {
      const response = await this.api.post<RefreshEmployerCandidateSkillMemoryResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/skill-memory/refresh`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to refresh skill memory');
    }
  }

  async getEmployerCandidateSkillEvolution(organizationId: string, candidateId: string): Promise<GetEmployerCandidateSkillEvolutionResponse> {
    try {
      const response = await this.api.get<GetEmployerCandidateSkillEvolutionResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/skill-evolution`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load skill evolution');
    }
  }

  /** Requires existing 25C skill memory; never auto-refreshes it. */
  async refreshEmployerCandidateSkillEvolution(
    organizationId: string,
    candidateId: string
  ): Promise<RefreshEmployerCandidateSkillEvolutionResponse> {
    try {
      const response = await this.api.post<RefreshEmployerCandidateSkillEvolutionResponse>(
        `/organizations/${organizationId}/candidates/${candidateId}/skill-evolution/refresh`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to refresh skill evolution');
    }
  }

  async getEmployerTalentSkillMap(organizationId: string): Promise<GetEmployerTalentSkillMapResponse> {
    try {
      const response = await this.api.get<GetEmployerTalentSkillMapResponse>(`/organizations/${organizationId}/talent/skill-map`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load talent skill map');
    }
  }

  /** Deterministic discovery only — never candidate ranking/hiring recommendation. */
  async searchEmployerTalentSkills(organizationId: string, filters: EmployerTalentSearchFilters): Promise<EmployerTalentSearchResponse> {
    try {
      const params: Record<string, string | number> = {};
      if (filters.search) params.search = filters.search;
      if (filters.skillNodeIds && filters.skillNodeIds.length > 0) params.skillNodeIds = filters.skillNodeIds.join(',');
      if (filters.classification) params.classification = filters.classification;
      if (filters.recencyBucket) params.recencyBucket = filters.recencyBucket;
      if (typeof filters.minEvidenceStrength === 'number') params.minEvidenceStrength = filters.minEvidenceStrength;
      if (filters.page) params.page = filters.page;
      if (filters.limit) params.limit = filters.limit;

      const response = await this.api.get<EmployerTalentSearchResponse>(`/organizations/${organizationId}/talent/skill-search`, {
        params,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to search talent skills');
    }
  }
}

export const employerApi = new EmployerApiService();
export default employerApi;
