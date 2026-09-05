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

  /** `status` always starts at active server-side — never accepted here. */
  async createCandidate(organizationId: string, payload: EmployerCandidatePayload): Promise<CreateCandidateResponse> {
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
}

export const employerApi = new EmployerApiService();
export default employerApi;
