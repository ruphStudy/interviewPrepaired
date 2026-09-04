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
}

export const instituteApi = new InstituteApiService();
export default instituteApi;
