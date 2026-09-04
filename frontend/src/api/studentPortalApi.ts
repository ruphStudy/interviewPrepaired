/**
 * Student Portal API Service (UI-06)
 *
 * Handles all API calls to the backend Student Portal endpoints
 * (Sprint 13 + 15B). Mirrors interviewApi.ts's/instituteApi.ts's
 * conventions exactly (auth-token interceptor, per-method try/catch with a
 * fallback message). Every method here maps 1:1 to an EXISTING backend
 * route — no endpoint is invented.
 *
 * IMPORTANT: this portal is based entirely on the authenticated user's own
 * linked ACTIVE InstituteStudent records — never on OrganizationContext/
 * OrganizationMember RBAC. A student can belong to an institute without
 * being an organization member at all, so none of these calls require or
 * depend on an "active organization" being selected anywhere in the app.
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';
import { InterviewSession, InterviewReport } from './interviewApi';

export type StudentAssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface StudentOrganizationRef {
  id: string;
  name: string;
}

export interface StudentIdentity {
  id: string;
  firstName: string;
  lastName?: string;
  enrollmentNumber?: string;
}

export interface StudentDashboardIdentity extends StudentIdentity {
  courseId?: string;
  batchId?: string;
  branchId?: string;
}

export interface UpcomingAssignment {
  assignmentId: string;
  templateId: string;
  templateName: string | null;
  dueAt?: string;
  status: StudentAssignmentStatus;
  interviewId?: string;
  instructions?: string;
}

export interface StudentDashboardBlock {
  organization: StudentOrganizationRef;
  student: StudentDashboardIdentity;
  summary: {
    totalAssignments: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
  upcomingAssignments: UpcomingAssignment[];
}

export interface StudentAssignmentRow {
  assignmentId: string;
  organization: StudentOrganizationRef;
  student: StudentIdentity;
  template: { id: string; name: string } | null;
  dueAt?: string;
  instructions?: string;
  status: StudentAssignmentStatus;
  interviewId?: string;
  createdAt: string;
}

export interface StudentHistoryRow {
  assignmentId: string;
  organization: StudentOrganizationRef;
  template: { id: string; name: string } | null;
  status: StudentAssignmentStatus;
  interviewId?: string;
  dueAt?: string;
  completedAt?: string;
  score?: number;
}

export type ReadinessLevel = 'needs_foundation' | 'developing' | 'interview_ready' | 'strong' | 'excellent';

export interface ReadinessComponents {
  overallPerformance: number | null;
  technical: number | null;
  communication: number | null;
  problemSolving: number | null;
  confidence: number | null;
}

export interface StudentReadinessRow {
  organization: StudentOrganizationRef;
  student: {
    id: string;
    firstName: string;
    lastName?: string;
    enrollmentNumber?: string;
    courseId?: string;
    batchId?: string;
  };
  readinessScore: number | null;
  readinessLevel: ReadinessLevel | null;
  insufficientData: boolean;
  interviewsCompleted: number;
  scoredInterviews: number;
  components: ReadinessComponents;
  evidence: {
    totalSkillEvidence: number;
    lastInterviewAt?: string;
  };
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

export type GetStudentDashboardResponse = ApiEnvelope<{ dashboards: StudentDashboardBlock[] }>;
export type GetStudentAssignmentsResponse = ApiEnvelope<{ assignments: StudentAssignmentRow[]; pagination: Pagination }>;
export type GetStudentAssignmentDetailResponse = ApiEnvelope<{ assignment: StudentAssignmentRow }>;
/** Start/session responses spread the assignment's own fields at the top level of `data`, alongside `session` — NOT nested under an `assignment` key (unlike the plain detail response). */
export type StartStudentAssignmentResponse = ApiEnvelope<StudentAssignmentRow & { session: InterviewSession }>;
export type GetStudentAssignmentSessionResponse = ApiEnvelope<StudentAssignmentRow & { session: InterviewSession }>;
export type GetStudentAssignmentResultResponse = ApiEnvelope<{ assignment: StudentAssignmentRow; report: InterviewReport }>;
export type GetStudentHistoryResponse = ApiEnvelope<{ history: StudentHistoryRow[]; pagination: Pagination }>;
export type GetStudentReadinessResponse = ApiEnvelope<{ readiness: StudentReadinessRow[] }>;

class StudentPortalApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
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

  /** One block per ACTIVE linked InstituteStudent record — empty array (not an error) when the caller has none. */
  async getDashboard(): Promise<GetStudentDashboardResponse> {
    try {
      const response = await this.api.get<GetStudentDashboardResponse>('/student-portal/dashboard');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load student dashboard');
    }
  }

  /** `organizationId` narrows an already-authorized set — it can never widen access to an institute the caller has no linked student in. */
  async getAssignments(
    params: { organizationId?: string; status?: StudentAssignmentStatus; page?: number; limit?: number } = {}
  ): Promise<GetStudentAssignmentsResponse> {
    try {
      const response = await this.api.get<GetStudentAssignmentsResponse>('/student-portal/assignments', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assignments');
    }
  }

  async getAssignmentDetail(assignmentId: string): Promise<GetStudentAssignmentDetailResponse> {
    try {
      const response = await this.api.get<GetStudentAssignmentDetailResponse>(
        `/student-portal/assignments/${assignmentId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assignment');
    }
  }

  /**
   * Consumes exactly 1 ORGANIZATION interview credit server-side — this
   * client never touches credit balance/logic, and never uses personal
   * B2C credits. On insufficient organization credits the backend responds
   * with its own message; the error interceptor above already surfaces
   * that message as-is.
   */
  async startAssignment(assignmentId: string): Promise<StartStudentAssignmentResponse> {
    try {
      const response = await this.api.post<StartStudentAssignmentResponse>(
        `/student-portal/assignments/${assignmentId}/start`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start interview');
    }
  }

  /** Resume/refresh — requires the assignment to have already been started. */
  async getAssignmentSession(assignmentId: string): Promise<GetStudentAssignmentSessionResponse> {
    try {
      const response = await this.api.get<GetStudentAssignmentSessionResponse>(
        `/student-portal/assignments/${assignmentId}/session`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview session');
    }
  }

  /** Requires the assignment to be COMPLETED — reuses InterviewService.getInterviewReport's exact shape server-side. */
  async getAssignmentResult(assignmentId: string): Promise<GetStudentAssignmentResultResponse> {
    try {
      const response = await this.api.get<GetStudentAssignmentResultResponse>(
        `/student-portal/assignments/${assignmentId}/result`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview result');
    }
  }

  /** Completed assignments only. `organizationId` is narrowing-only, same as getAssignments. */
  async getHistory(params: { organizationId?: string; page?: number; limit?: number } = {}): Promise<GetStudentHistoryResponse> {
    try {
      const response = await this.api.get<GetStudentHistoryResponse>('/student-portal/history', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview history');
    }
  }

  /** Never recomputed client-side — entirely delegated to the backend's PlacementReadinessService. */
  async getReadiness(params: { organizationId?: string } = {}): Promise<GetStudentReadinessResponse> {
    try {
      const response = await this.api.get<GetStudentReadinessResponse>('/student-portal/readiness', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load placement readiness');
    }
  }
}

export const studentPortalApi = new StudentPortalApiService();
export default studentPortalApi;
