/**
 * Candidate Portal API Service.
 *
 * Mirrors studentPortalApi.ts's conventions exactly (auth-token
 * interceptor, per-method try/catch with a fallback message). Every method
 * here maps 1:1 to an EXISTING backend route — no endpoint is invented.
 *
 * IMPORTANT: this portal is based entirely on EmployerCandidate records
 * whose email matches the authenticated user's own email — never on
 * OrganizationContext/OrganizationMember RBAC. A candidate is never an
 * organization member/staff. It is read-only: taking or resuming an
 * assessment still happens exclusively via the original secure link the
 * candidate received by email (the raw invitation token is never persisted
 * server-side, so it can't be recovered or relinked here).
 */

import axios, { AxiosInstance } from 'axios';
import { attachAuthExpiryHandler } from '../utils/authExpiry';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

export type CandidatePortalStatus = 'invited' | 'in_progress' | 'completed' | 'expired' | 'closed';

export interface CandidatePortalOrganizationRef {
  id: string;
  name: string;
}

export interface CandidateAssessmentRow {
  invitationId: string;
  organization: CandidatePortalOrganizationRef;
  job: { id: string; title: string };
  status: CandidatePortalStatus;
  invitedAt?: string;
  expiresAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

export interface CandidateDashboardBlock {
  organization: CandidatePortalOrganizationRef;
  candidate: { id: string };
  summary: { total: number; invited: number; inProgress: number; completed: number };
  upcoming: CandidateAssessmentRow[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type GetCandidateDashboardResponse = ApiEnvelope<{ dashboards: CandidateDashboardBlock[] }>;
export type ListCandidateAssessmentsResponse = ApiEnvelope<{ assessments: CandidateAssessmentRow[]; pagination: Pagination }>;
export type GetCandidateAssessmentDetailResponse = ApiEnvelope<{ assessment: CandidateAssessmentRow }>;
export type GetCandidateHistoryResponse = ApiEnvelope<{ history: CandidateAssessmentRow[]; pagination: Pagination }>;

class CandidatePortalApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT,
    });
    attachAuthExpiryHandler(this.api);

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

  /** One block per organization with a matching ACTIVE EmployerCandidate record — empty array (not an error) when the caller has none. */
  async getDashboard(): Promise<GetCandidateDashboardResponse> {
    try {
      const response = await this.api.get<GetCandidateDashboardResponse>('/candidate-portal/dashboard');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load candidate dashboard');
    }
  }

  /** `organizationId` narrows an already-authorized set — it can never widen access to an employer the caller has no matching candidate record with. */
  async listAssessments(
    params: { organizationId?: string; status?: CandidatePortalStatus; page?: number; limit?: number } = {}
  ): Promise<ListCandidateAssessmentsResponse> {
    try {
      const response = await this.api.get<ListCandidateAssessmentsResponse>('/candidate-portal/assessments', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assessments');
    }
  }

  async getAssessmentDetail(invitationId: string): Promise<GetCandidateAssessmentDetailResponse> {
    try {
      const response = await this.api.get<GetCandidateAssessmentDetailResponse>(`/candidate-portal/assessments/${invitationId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assessment');
    }
  }

  /** Completed/expired/closed assessments only. `organizationId` is narrowing-only, same as listAssessments. */
  async getHistory(params: { organizationId?: string; page?: number; limit?: number } = {}): Promise<GetCandidateHistoryResponse> {
    try {
      const response = await this.api.get<GetCandidateHistoryResponse>('/candidate-portal/history', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assessment history');
    }
  }
}

export const candidatePortalApi = new CandidatePortalApiService();
export default candidatePortalApi;
