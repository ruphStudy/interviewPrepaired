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
}

export const employerApi = new EmployerApiService();
export default employerApi;
