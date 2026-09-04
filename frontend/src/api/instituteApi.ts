/**
 * Institute Management API Service (UI-04)
 *
 * Handles all API calls to the backend Institute Profile / Branch / Course /
 * Batch / Student endpoints (Sprint 10/11). Mirrors organizationApi.ts's
 * conventions exactly (auth-token interceptor, per-method try/catch with a
 * fallback message). Every method here maps 1:1 to an EXISTING backend
 * route — no endpoint is invented. Field names/shapes were confirmed by
 * reading the actual controllers/services, not guessed.
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';
import { InterviewReport } from './interviewApi';
import { ReadinessLevel, ReadinessComponents } from './studentPortalApi';

export type InstituteEntityStatus = 'active' | 'inactive';

/** Mirrors backend InstituteKind. */
export const INSTITUTE_KINDS = [
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'training-institute', label: 'Training Institute' },
  { value: 'coaching-institute', label: 'Coaching Institute' },
  { value: 'bootcamp', label: 'Bootcamp' },
  { value: 'other', label: 'Other' },
];

// ============================================================================
// Institute Profile
// ============================================================================

export interface InstituteProfile {
  instituteKind?: string;
  officialName?: string;
  instituteCode?: string;
  affiliation?: string;
  accreditation?: string;
  universityName?: string;
  establishedYear?: number;
  studentCount?: number;
  description?: string;
  website?: string;
  placementEmail?: string;
  placementPhone?: string;
}

export interface InstituteProfileResult {
  organization: { id: string; name: string; slug: string; status: string };
  profile: InstituteProfile;
}

// ============================================================================
// Branches
// ============================================================================

export interface InstituteBranch {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: InstituteEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BranchPayload {
  name?: string;
  code?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

// ============================================================================
// Courses
// ============================================================================

export interface InstituteCourse {
  id: string;
  organizationId: string;
  branchId?: string;
  name: string;
  code?: string;
  description?: string;
  durationMonths?: number;
  status: InstituteEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CoursePayload {
  name?: string;
  branchId?: string | null;
  code?: string | null;
  description?: string | null;
  durationMonths?: number | null;
}

// ============================================================================
// Batches
// ============================================================================

export interface InstituteBatch {
  id: string;
  organizationId: string;
  courseId: string;
  branchId?: string;
  name: string;
  code?: string;
  academicYear?: string;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  status: InstituteEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BatchPayload {
  name?: string;
  courseId?: string;
  branchId?: string | null;
  code?: string | null;
  academicYear?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  capacity?: number | null;
}

// ============================================================================
// Students
// ============================================================================

export interface InstituteStudent {
  id: string;
  organizationId: string;
  batchId?: string;
  courseId?: string;
  branchId?: string;
  userId?: string;
  /** !!student.userId, computed by the backend — never re-derive this client-side. */
  accountLinked: boolean;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  enrollmentNumber?: string;
  graduationYear?: number;
  status: InstituteEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudentPayload {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  enrollmentNumber?: string | null;
  graduationYear?: number | null;
  batchId?: string | null;
  courseId?: string | null;
  branchId?: string | null;
}

export interface BulkCreateStudentsResultRow {
  index: number;
  status: 'created' | 'failed';
  studentId?: string;
  error?: string;
}

export interface BulkCreateStudentsResult {
  total: number;
  created: number;
  failed: number;
  results: BulkCreateStudentsResultRow[];
}

export interface BulkAssignStudentsResultRow {
  studentId: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export interface BulkAssignStudentsResult {
  total: number;
  assigned: number;
  failed: number;
  results: BulkAssignStudentsResultRow[];
}

// ============================================================================
// Organization-scoped Question Sets (UI-05 unblock) — SEPARATE from
// personal/B2C question sets; never falls back to a personal set.
// ============================================================================

export interface OrgQuestionSetRow {
  questionText: string;
  referenceAnswer?: string;
}

export interface OrgQuestionSetSummary {
  id: string;
  name: string;
  description?: string;
  source: 'manual' | 'uploaded';
  totalQuestions: number;
  questionsWithAnswers: number;
  questionsWithoutAnswers: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrgQuestionSetDetail extends OrgQuestionSetSummary {
  questions: OrgQuestionSetRow[];
}

export interface OrgQuestionSetPayload {
  name?: string;
  description?: string;
  questions?: OrgQuestionSetRow[];
}

// ============================================================================
// Trainers (Sprint 12A) — identity is an EXISTING OrganizationMember with
// role TRAINER; this is a profile/metadata layer on top, never a
// member/role/status mutation surface (that remains the Members UI).
// ============================================================================

export interface TrainerProfile {
  employeeCode?: string;
  designation?: string;
  department?: string;
  specialization?: string[];
  bio?: string;
  status: InstituteEntityStatus;
  updatedAt: string;
}

export interface Trainer {
  membershipId: string;
  organizationId: string;
  user?: { id: string; name: string; email: string };
  status: InstituteEntityStatus;
  joinedAt: string;
  /** null when no profile row exists yet for this trainer. */
  profile: TrainerProfile | null;
}

export interface TrainerProfilePayload {
  employeeCode?: string;
  designation?: string;
  department?: string;
  specialization?: string[];
  bio?: string;
}

// ============================================================================
// Trainer Assignments (Sprint 12B) — a trainer's own course/batch
// assignments. Physical delete (pure relationship record).
// ============================================================================

export interface TrainerAssignment {
  assignmentId: string;
  organizationId: string;
  trainerMembershipId: string;
  courseId?: string;
  batchId?: string;
  createdAt: string;
}

export interface TrainerAssignmentPayload {
  courseId?: string;
  batchId?: string;
}

// ============================================================================
// Interview Templates (Sprint 12C) — reference an EXISTING organization
// QuestionSet by id only; content is never copied.
// ============================================================================

export interface TemplateInterviewConfig {
  difficulty?: string;
  style?: string;
  language?: string;
  questionLimit?: number;
}

export interface InstituteInterviewTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  questionSetId: string;
  /** undefined only if the referenced question set was somehow not found. */
  questionSet?: { id: string; name: string; questionCount: number };
  courseId?: string;
  batchId?: string;
  interviewConfig?: TemplateInterviewConfig;
  status: InstituteEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePayload {
  name?: string;
  description?: string | null;
  questionSetId?: string;
  courseId?: string | null;
  batchId?: string | null;
  /** Whole-object replacement on update, not a per-field merge — matches the backend exactly. Pass null to clear entirely. */
  interviewConfig?: TemplateInterviewConfig | null;
}

// ============================================================================
// Student Interview Assignments (Sprint 12D/12E) — list responses carry raw
// ids only (no student/template names); the caller must cross-reference the
// students/templates lists itself.
// ============================================================================

export type StudentInterviewAssignmentStatus = 'assigned' | 'in_progress' | 'completed' | 'cancelled';

export interface StudentInterviewAssignment {
  assignmentId: string;
  organizationId: string;
  studentId: string;
  templateId: string;
  assignedByMembershipId: string;
  dueAt?: string;
  instructions?: string;
  status: StudentInterviewAssignmentStatus;
  interviewId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignInterviewResultRow {
  studentId: string;
  status: 'assigned' | 'failed';
  assignmentId?: string;
  error?: string;
}

export interface AssignInterviewResult {
  total: number;
  assigned: number;
  failed: number;
  results: AssignInterviewResultRow[];
}

// ============================================================================
// Shared
// ============================================================================

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

export type GetInstituteProfileResponse = ApiEnvelope<InstituteProfileResult>;
export type UpdateInstituteProfileResponse = ApiEnvelope<InstituteProfileResult>;

export type ListBranchesResponse = ApiEnvelope<{ branches: InstituteBranch[]; pagination: Pagination }>;
export type GetBranchResponse = ApiEnvelope<{ branch: InstituteBranch }>;

export type ListCoursesResponse = ApiEnvelope<{ courses: InstituteCourse[]; pagination: Pagination }>;
export type GetCourseResponse = ApiEnvelope<{ course: InstituteCourse }>;

export type ListBatchesResponse = ApiEnvelope<{ batches: InstituteBatch[]; pagination: Pagination }>;
export type GetBatchResponse = ApiEnvelope<{ batch: InstituteBatch }>;

export type ListStudentsResponse = ApiEnvelope<{ students: InstituteStudent[]; pagination: Pagination }>;
export type GetStudentResponse = ApiEnvelope<{ student: InstituteStudent }>;
export type BulkCreateStudentsResponse = ApiEnvelope<BulkCreateStudentsResult>;
export type BulkAssignStudentsResponse = ApiEnvelope<BulkAssignStudentsResult>;

export type ListOrgQuestionSetsResponse = ApiEnvelope<{ questionSets: OrgQuestionSetSummary[]; pagination: Pagination }>;
export type GetOrgQuestionSetResponse = ApiEnvelope<{ questionSet: OrgQuestionSetDetail }>;

export type ListTrainersResponse = ApiEnvelope<{ trainers: Trainer[]; pagination: Pagination }>;
export type GetTrainerResponse = ApiEnvelope<{ trainer: Trainer }>;

export type ListTrainerAssignmentsResponse = ApiEnvelope<{ assignments: TrainerAssignment[]; pagination: Pagination }>;
export type GetTrainerAssignmentResponse = ApiEnvelope<{ assignment: TrainerAssignment }>;

export type ListTemplatesResponse = ApiEnvelope<{ templates: InstituteInterviewTemplate[]; pagination: Pagination }>;
export type GetTemplateResponse = ApiEnvelope<{ template: InstituteInterviewTemplate }>;

export type ListInterviewAssignmentsResponse = ApiEnvelope<{
  assignments: StudentInterviewAssignment[];
  pagination: Pagination;
}>;
export type GetInterviewAssignmentResponse = ApiEnvelope<{ assignment: StudentInterviewAssignment }>;
export type AssignInterviewResponse = ApiEnvelope<AssignInterviewResult>;

// ============================================================================
// Trainer Portal (UI-07 / Sprint 14, 15C) — read-only, scoped entirely to the
// CALLING trainer's own InstituteTrainerAssignment rows. Every field name
// below was confirmed by reading InstituteTrainerDashboardService,
// InstituteTrainerStudentReportService, InstituteTrainerBatchAnalyticsService,
// InstituteTrainerSkillGapService and InstituteTrainerBatchReadinessService
// directly — nothing here is guessed or widened client-side.
// ============================================================================

export interface TrainerStudentRef {
  id: string;
  firstName: string;
  lastName?: string;
  enrollmentNumber?: string;
}

export interface TrainerDashboardSummary {
  assignedCourses: number;
  assignedBatches: number;
  totalStudents: number;
  totalInterviewAssignments: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
}

export interface TrainerRecentActivityRow {
  assignmentId: string;
  student: TrainerStudentRef;
  templateId: string;
  templateName: string | null;
  status: StudentInterviewAssignmentStatus;
  dueAt?: string;
  interviewId?: string;
  createdAt: string;
}

export interface TrainerDashboard {
  summary: TrainerDashboardSummary;
  recentActivity: TrainerRecentActivityRow[];
}

export type GetTrainerDashboardResponse = ApiEnvelope<TrainerDashboard>;

export interface TrainerReportRow {
  assignmentId: string;
  template: { id: string; name: string } | null;
  interviewId: string;
  completedAt?: string;
  score?: number;
  createdAt: string;
}

export type ListTrainerStudentReportsResponse = ApiEnvelope<{ reports: TrainerReportRow[]; pagination: Pagination }>;

export interface TrainerReportAssignmentMeta {
  assignmentId: string;
  template: { id: string; name: string } | null;
  status: StudentInterviewAssignmentStatus;
  dueAt?: string;
  interviewId: string;
  createdAt: string;
}

export type GetTrainerStudentReportDetailResponse = ApiEnvelope<{
  student: TrainerStudentRef;
  assignment: TrainerReportAssignmentMeta;
  report: InterviewReport;
}>;

export interface TrainerBatchStudentBreakdown {
  student: TrainerStudentRef;
  totalAssignments: number;
  completed: number;
  pending: number;
  inProgress: number;
  averageScore: number | null;
}

export interface TrainerBatchAnalytics {
  summary: {
    totalStudents: number;
    studentsWithAssignments: number;
    totalAssignments: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    completionRate: number;
    averageScore: number | null;
  };
  students: TrainerBatchStudentBreakdown[];
}

export type GetTrainerBatchAnalyticsResponse = ApiEnvelope<TrainerBatchAnalytics>;

export interface TrainerSkillStat {
  skill: string;
  evidenceCount: number;
  averageScore?: number;
}

export interface TrainerStudentAttentionRow {
  student: TrainerStudentRef;
  averageScore?: number;
  weakSkills: string[];
}

export interface TrainerSkillGapAnalytics {
  summary: {
    totalStudents: number;
    studentsAssessed: number;
    completedInterviews: number;
    skillsObserved: number;
  };
  strongestSkills: TrainerSkillStat[];
  skillGaps: TrainerSkillStat[];
  studentsNeedingAttention: TrainerStudentAttentionRow[];
}

export type GetTrainerSkillGapsResponse = ApiEnvelope<TrainerSkillGapAnalytics>;

export interface TrainerBatchStudentReadinessRow {
  student: TrainerStudentRef;
  readinessScore: number | null;
  readinessLevel: ReadinessLevel | null;
  insufficientData: boolean;
  interviewsCompleted: number;
  scoredInterviews: number;
  components: ReadinessComponents;
}

export interface TrainerBatchReadinessAnalytics {
  summary: {
    totalStudents: number;
    studentsAssessed: number;
    insufficientData: number;
    averageReadinessScore: number | null;
    needsFoundation: number;
    developing: number;
    interviewReady: number;
    strong: number;
    excellent: number;
  };
  students: TrainerBatchStudentReadinessRow[];
}

export type GetTrainerBatchReadinessResponse = ApiEnvelope<TrainerBatchReadinessAnalytics>;

class InstituteApiService {
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

  // ---- Institute Profile ----

  async getInstituteProfile(organizationId: string): Promise<GetInstituteProfileResponse> {
    try {
      const response = await this.api.get<GetInstituteProfileResponse>(`/organizations/${organizationId}/institute-profile`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load institute profile');
    }
  }

  /** PATCH-like merge (despite being a PUT) — omitted fields keep their current value. At least one field required. */
  async updateInstituteProfile(organizationId: string, payload: InstituteProfile): Promise<UpdateInstituteProfileResponse> {
    try {
      const response = await this.api.put<UpdateInstituteProfileResponse>(
        `/organizations/${organizationId}/institute-profile`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update institute profile');
    }
  }

  // ---- Branches ----

  async listBranches(
    organizationId: string,
    params: { page?: number; limit?: number; status?: InstituteEntityStatus } = {}
  ): Promise<ListBranchesResponse> {
    try {
      const response = await this.api.get<ListBranchesResponse>(`/organizations/${organizationId}/branches`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load branches');
    }
  }

  async getBranch(organizationId: string, branchId: string): Promise<GetBranchResponse> {
    try {
      const response = await this.api.get<GetBranchResponse>(`/organizations/${organizationId}/branches/${branchId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load branch');
    }
  }

  async createBranch(organizationId: string, payload: BranchPayload): Promise<GetBranchResponse> {
    try {
      const response = await this.api.post<GetBranchResponse>(`/organizations/${organizationId}/branches`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create branch');
    }
  }

  async updateBranch(organizationId: string, branchId: string, payload: BranchPayload): Promise<GetBranchResponse> {
    try {
      const response = await this.api.put<GetBranchResponse>(
        `/organizations/${organizationId}/branches/${branchId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update branch');
    }
  }

  /** Soft-deactivate (status -> inactive), idempotent — never a physical delete. No reactivate endpoint exists. */
  async deactivateBranch(organizationId: string, branchId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/branches/${branchId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to deactivate branch');
    }
  }

  // ---- Courses ----

  async listCourses(
    organizationId: string,
    params: { page?: number; limit?: number; status?: InstituteEntityStatus; branchId?: string } = {}
  ): Promise<ListCoursesResponse> {
    try {
      const response = await this.api.get<ListCoursesResponse>(`/organizations/${organizationId}/courses`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load courses');
    }
  }

  async getCourse(organizationId: string, courseId: string): Promise<GetCourseResponse> {
    try {
      const response = await this.api.get<GetCourseResponse>(`/organizations/${organizationId}/courses/${courseId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load course');
    }
  }

  async createCourse(organizationId: string, payload: CoursePayload): Promise<GetCourseResponse> {
    try {
      const response = await this.api.post<GetCourseResponse>(`/organizations/${organizationId}/courses`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create course');
    }
  }

  async updateCourse(organizationId: string, courseId: string, payload: CoursePayload): Promise<GetCourseResponse> {
    try {
      const response = await this.api.put<GetCourseResponse>(
        `/organizations/${organizationId}/courses/${courseId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update course');
    }
  }

  /** Soft-deactivate (status -> inactive), idempotent — never a physical delete. No reactivate endpoint exists. */
  async deactivateCourse(organizationId: string, courseId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/courses/${courseId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to deactivate course');
    }
  }

  // ---- Batches ----

  async listBatches(
    organizationId: string,
    params: { page?: number; limit?: number; status?: InstituteEntityStatus; courseId?: string; branchId?: string } = {}
  ): Promise<ListBatchesResponse> {
    try {
      const response = await this.api.get<ListBatchesResponse>(`/organizations/${organizationId}/batches`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load batches');
    }
  }

  async getBatch(organizationId: string, batchId: string): Promise<GetBatchResponse> {
    try {
      const response = await this.api.get<GetBatchResponse>(`/organizations/${organizationId}/batches/${batchId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load batch');
    }
  }

  /** courseId is required by the backend on create. */
  async createBatch(organizationId: string, payload: BatchPayload): Promise<GetBatchResponse> {
    try {
      const response = await this.api.post<GetBatchResponse>(`/organizations/${organizationId}/batches`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create batch');
    }
  }

  async updateBatch(organizationId: string, batchId: string, payload: BatchPayload): Promise<GetBatchResponse> {
    try {
      const response = await this.api.put<GetBatchResponse>(`/organizations/${organizationId}/batches/${batchId}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update batch');
    }
  }

  /** Soft-deactivate (status -> inactive), idempotent — never a physical delete. No reactivate endpoint exists. */
  async deactivateBatch(organizationId: string, batchId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/batches/${batchId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to deactivate batch');
    }
  }

  // ---- Students ----

  async listStudents(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      status?: InstituteEntityStatus;
      batchId?: string;
      courseId?: string;
      branchId?: string;
      search?: string;
    } = {}
  ): Promise<ListStudentsResponse> {
    try {
      const response = await this.api.get<ListStudentsResponse>(`/organizations/${organizationId}/students`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load students');
    }
  }

  async getStudent(organizationId: string, studentId: string): Promise<GetStudentResponse> {
    try {
      const response = await this.api.get<GetStudentResponse>(`/organizations/${organizationId}/students/${studentId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load student');
    }
  }

  /** userId is never accepted here — link an account via linkStudentUser() instead. */
  async createStudent(organizationId: string, payload: StudentPayload): Promise<GetStudentResponse> {
    try {
      const response = await this.api.post<GetStudentResponse>(`/organizations/${organizationId}/students`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create student');
    }
  }

  async updateStudent(organizationId: string, studentId: string, payload: StudentPayload): Promise<GetStudentResponse> {
    try {
      const response = await this.api.put<GetStudentResponse>(
        `/organizations/${organizationId}/students/${studentId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update student');
    }
  }

  /** Soft-deactivate (status -> inactive), idempotent — never a physical delete. No reactivate endpoint exists. */
  async deactivateStudent(organizationId: string, studentId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/students/${studentId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to deactivate student');
    }
  }

  /**
   * userId is optional — if omitted, the backend matches an existing active
   * User by the student's own email on file. Never invents an email lookup
   * client-side; this just forwards whatever the caller provided.
   */
  async linkStudentUser(organizationId: string, studentId: string, userId?: string): Promise<GetStudentResponse> {
    try {
      const response = await this.api.post<GetStudentResponse>(
        `/organizations/${organizationId}/students/${studentId}/link-user`,
        userId ? { userId } : {}
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to link user account');
    }
  }

  /** Idempotent — never deletes/deactivates the underlying User account. */
  async unlinkStudentUser(organizationId: string, studentId: string): Promise<GetStudentResponse> {
    try {
      const response = await this.api.delete<GetStudentResponse>(
        `/organizations/${organizationId}/students/${studentId}/link-user`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to unlink user account');
    }
  }

  /** Up to 200 rows per request — processed sequentially, one bad row never aborts the batch. */
  async bulkCreateStudents(organizationId: string, students: StudentPayload[]): Promise<BulkCreateStudentsResponse> {
    try {
      const response = await this.api.post<BulkCreateStudentsResponse>(`/organizations/${organizationId}/students/bulk`, {
        students,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to bulk import students');
    }
  }

  /**
   * Up to 200 studentIds per request. At least one of batchId/courseId/branchId
   * is required; explicit null clears that relationship, omitted keeps the
   * student's current value. The backend re-validates batch/course/branch
   * consistency exactly as on single create/update — never reimplemented here.
   */
  async bulkAssignStudents(
    organizationId: string,
    payload: { studentIds: string[]; batchId?: string | null; courseId?: string | null; branchId?: string | null }
  ): Promise<BulkAssignStudentsResponse> {
    try {
      const response = await this.api.post<BulkAssignStudentsResponse>(
        `/organizations/${organizationId}/students/assign`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to bulk assign students');
    }
  }

  // ---- Organization-scoped Question Sets ----

  async listOrgQuestionSets(
    organizationId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ListOrgQuestionSetsResponse> {
    try {
      const response = await this.api.get<ListOrgQuestionSetsResponse>(`/organizations/${organizationId}/question-sets`, {
        params,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load question sets');
    }
  }

  async getOrgQuestionSet(organizationId: string, questionSetId: string): Promise<GetOrgQuestionSetResponse> {
    try {
      const response = await this.api.get<GetOrgQuestionSetResponse>(
        `/organizations/${organizationId}/question-sets/${questionSetId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load question set');
    }
  }

  async createOrgQuestionSet(organizationId: string, payload: OrgQuestionSetPayload): Promise<GetOrgQuestionSetResponse> {
    try {
      const response = await this.api.post<GetOrgQuestionSetResponse>(
        `/organizations/${organizationId}/question-sets`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create question set');
    }
  }

  async updateOrgQuestionSet(
    organizationId: string,
    questionSetId: string,
    payload: OrgQuestionSetPayload
  ): Promise<GetOrgQuestionSetResponse> {
    try {
      const response = await this.api.put<GetOrgQuestionSetResponse>(
        `/organizations/${organizationId}/question-sets/${questionSetId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update question set');
    }
  }

  async deleteOrgQuestionSet(organizationId: string, questionSetId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/question-sets/${questionSetId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete question set');
    }
  }

  // ---- Trainers ----

  /** Trainer identity comes from an existing OrganizationMember with role TRAINER — never invented/created here. */
  async listTrainers(
    organizationId: string,
    params: { page?: number; limit?: number; status?: InstituteEntityStatus; search?: string } = {}
  ): Promise<ListTrainersResponse> {
    try {
      const response = await this.api.get<ListTrainersResponse>(`/organizations/${organizationId}/trainers`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load trainers');
    }
  }

  async getTrainer(organizationId: string, membershipId: string): Promise<GetTrainerResponse> {
    try {
      const response = await this.api.get<GetTrainerResponse>(`/organizations/${organizationId}/trainers/${membershipId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load trainer');
    }
  }

  /** PATCH-like merge — omitted fields keep their current value. Never touches membership role/status (that's the Members UI). */
  async updateTrainerProfile(
    organizationId: string,
    membershipId: string,
    payload: TrainerProfilePayload
  ): Promise<GetTrainerResponse> {
    try {
      const response = await this.api.put<GetTrainerResponse>(
        `/organizations/${organizationId}/trainers/${membershipId}/profile`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update trainer profile');
    }
  }

  // ---- Trainer Assignments ----

  async listTrainerAssignments(
    organizationId: string,
    membershipId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ListTrainerAssignmentsResponse> {
    try {
      const response = await this.api.get<ListTrainerAssignmentsResponse>(
        `/organizations/${organizationId}/trainers/${membershipId}/assignments`,
        { params }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load teaching assignments');
    }
  }

  /** Exactly one of courseId/batchId — the backend rejects both-or-neither. */
  async createTrainerAssignment(
    organizationId: string,
    membershipId: string,
    payload: TrainerAssignmentPayload
  ): Promise<GetTrainerAssignmentResponse> {
    try {
      const response = await this.api.post<GetTrainerAssignmentResponse>(
        `/organizations/${organizationId}/trainers/${membershipId}/assignments`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create teaching assignment');
    }
  }

  /** Physical delete — a pure relationship record, unlike interview/student records. */
  async deleteTrainerAssignment(organizationId: string, membershipId: string, assignmentId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/trainers/${membershipId}/assignments/${assignmentId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete teaching assignment');
    }
  }

  // ---- Interview Templates ----

  async listTemplates(
    organizationId: string,
    params: { page?: number; limit?: number; status?: InstituteEntityStatus; courseId?: string; batchId?: string } = {}
  ): Promise<ListTemplatesResponse> {
    try {
      const response = await this.api.get<ListTemplatesResponse>(`/organizations/${organizationId}/interview-templates`, {
        params,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview templates');
    }
  }

  async getTemplate(organizationId: string, templateId: string): Promise<GetTemplateResponse> {
    try {
      const response = await this.api.get<GetTemplateResponse>(
        `/organizations/${organizationId}/interview-templates/${templateId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview template');
    }
  }

  /** questionSetId must reference an org-scoped QuestionSet in this exact organization — the backend re-validates this itself. */
  async createTemplate(organizationId: string, payload: TemplatePayload): Promise<GetTemplateResponse> {
    try {
      const response = await this.api.post<GetTemplateResponse>(
        `/organizations/${organizationId}/interview-templates`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create interview template');
    }
  }

  /** PATCH-like merge, EXCEPT interviewConfig which is a whole-object replacement when supplied. */
  async updateTemplate(organizationId: string, templateId: string, payload: TemplatePayload): Promise<GetTemplateResponse> {
    try {
      const response = await this.api.put<GetTemplateResponse>(
        `/organizations/${organizationId}/interview-templates/${templateId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update interview template');
    }
  }

  /** Soft-deactivate (status -> inactive), idempotent — never a physical delete. No reactivate endpoint exists. */
  async deactivateTemplate(organizationId: string, templateId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/interview-templates/${templateId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to deactivate interview template');
    }
  }

  // ---- Student Interview Assignments ----

  /** Response rows carry raw studentId/templateId only — cross-reference the students/templates lists client-side for display names. */
  async listInterviewAssignments(
    organizationId: string,
    params: {
      page?: number;
      limit?: number;
      studentId?: string;
      templateId?: string;
      status?: StudentInterviewAssignmentStatus;
    } = {}
  ): Promise<ListInterviewAssignmentsResponse> {
    try {
      const response = await this.api.get<ListInterviewAssignmentsResponse>(
        `/organizations/${organizationId}/interview-assignments`,
        { params }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview assignments');
    }
  }

  async getInterviewAssignment(organizationId: string, assignmentId: string): Promise<GetInterviewAssignmentResponse> {
    try {
      const response = await this.api.get<GetInterviewAssignmentResponse>(
        `/organizations/${organizationId}/interview-assignments/${assignmentId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview assignment');
    }
  }

  /** Up to 200 studentIds per request (backend hard cap) — assignedByMembershipId is always injected server-side, never sent here. */
  async assignInterview(
    organizationId: string,
    payload: { templateId: string; studentIds: string[]; dueAt?: string; instructions?: string }
  ): Promise<AssignInterviewResponse> {
    try {
      const response = await this.api.post<AssignInterviewResponse>(
        `/organizations/${organizationId}/interview-assignments`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to assign interview');
    }
  }

  /**
   * Consumes exactly 1 organization interview credit server-side — this
   * client never touches credit balance/logic. On insufficient credits the
   * backend responds 402 with a plain message; the error interceptor below
   * already surfaces that message as-is.
   */
  async startInterviewAssignment(organizationId: string, assignmentId: string): Promise<GetInterviewAssignmentResponse> {
    try {
      const response = await this.api.post<GetInterviewAssignmentResponse>(
        `/organizations/${organizationId}/interview-assignments/${assignmentId}/start`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start interview assignment');
    }
  }

  /** Only ASSIGNED -> CANCELLED is a real transition; already-CANCELLED is idempotent; IN_PROGRESS/COMPLETED are rejected by the backend. */
  async cancelInterviewAssignment(organizationId: string, assignmentId: string): Promise<GetInterviewAssignmentResponse> {
    try {
      const response = await this.api.post<GetInterviewAssignmentResponse>(
        `/organizations/${organizationId}/interview-assignments/${assignmentId}/cancel`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to cancel interview assignment');
    }
  }

  // ---- Trainer Portal (UI-07) — scoped to the CALLING trainer's own assignments; the backend rejects any non-TRAINER caller. ----

  async getTrainerDashboard(organizationId: string): Promise<GetTrainerDashboardResponse> {
    try {
      const response = await this.api.get<GetTrainerDashboardResponse>(`/organizations/${organizationId}/trainer-dashboard`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load trainer dashboard');
    }
  }

  /** `studentId` must already be inside the caller's own trainer scope — the backend 404s otherwise, never a distinguishable leak. */
  async listTrainerStudentReports(
    organizationId: string,
    studentId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ListTrainerStudentReportsResponse> {
    try {
      const response = await this.api.get<ListTrainerStudentReportsResponse>(
        `/organizations/${organizationId}/trainer-students/${studentId}/reports`,
        { params }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load student reports');
    }
  }

  async getTrainerStudentReportDetail(
    organizationId: string,
    studentId: string,
    assignmentId: string
  ): Promise<GetTrainerStudentReportDetailResponse> {
    try {
      const response = await this.api.get<GetTrainerStudentReportDetailResponse>(
        `/organizations/${organizationId}/trainer-students/${studentId}/reports/${assignmentId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load student report');
    }
  }

  /** `batchId` must be inside the caller's own trainer scope (direct batch assignment, or a course assignment matching the batch's course) — the backend 404s otherwise. */
  async getTrainerBatchAnalytics(organizationId: string, batchId: string): Promise<GetTrainerBatchAnalyticsResponse> {
    try {
      const response = await this.api.get<GetTrainerBatchAnalyticsResponse>(
        `/organizations/${organizationId}/trainer-batches/${batchId}/analytics`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load batch analytics');
    }
  }

  /** Derived entirely from already-persisted evaluation data server-side — never recomputed here. */
  async getTrainerBatchSkillGaps(organizationId: string, batchId: string): Promise<GetTrainerSkillGapsResponse> {
    try {
      const response = await this.api.get<GetTrainerSkillGapsResponse>(
        `/organizations/${organizationId}/trainer-batches/${batchId}/skill-gaps`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load skill gap analytics');
    }
  }

  /** Aggregates PlacementReadinessService output per student server-side — never recomputed here. */
  async getTrainerBatchReadiness(organizationId: string, batchId: string): Promise<GetTrainerBatchReadinessResponse> {
    try {
      const response = await this.api.get<GetTrainerBatchReadinessResponse>(
        `/organizations/${organizationId}/trainer-batches/${batchId}/readiness`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load batch readiness');
    }
  }
}

export const instituteApi = new InstituteApiService();
export default instituteApi;
