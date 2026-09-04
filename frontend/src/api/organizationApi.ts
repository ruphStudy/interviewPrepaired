/**
 * Organization API Service
 *
 * Handles all API calls to the backend Organization / Member / Invitation
 * endpoints (Sprint 7/8). Mirrors interviewApi.ts's/subscriptionApi.ts's
 * conventions exactly (auth-token interceptor, per-method try/catch with a
 * fallback message). Every method here maps 1:1 to an EXISTING backend
 * route — no endpoint is invented.
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';
import { EmployerJobStatus } from './employerApi';

// ============================================================================
// Shared enums (mirrors backend constants — values only, never re-derived)
// ============================================================================

export type OrganizationType = 'institute' | 'company';
export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type OrganizationMemberRole = 'owner' | 'admin' | 'trainer' | 'recruiter' | 'member';
/** Roles a caller may actually assign — the backend rejects 'owner' on add/update/invite. */
export const ASSIGNABLE_MEMBER_ROLES: OrganizationMemberRole[] = ['admin', 'trainer', 'recruiter', 'member'];
export type OrganizationMemberStatus = 'active' | 'inactive';
export type OrganizationPermission =
  | 'organization:view'
  | 'organization:update'
  | 'members:view'
  | 'members:manage'
  | 'interviews:view'
  | 'interviews:manage'
  | 'question-sets:view'
  | 'question-sets:manage'
  | 'reports:view'
  | 'analytics:view';
export type OrganizationInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

/** Mirrors backend InstituteKind — used for the create/profile form's basic institute fields. */
export const INSTITUTE_KINDS = [
  { value: 'college', label: 'College' },
  { value: 'university', label: 'University' },
  { value: 'training-institute', label: 'Training Institute' },
  { value: 'coaching-institute', label: 'Coaching Institute' },
  { value: 'bootcamp', label: 'Bootcamp' },
  { value: 'other', label: 'Other' },
];

/** Mirrors backend CompanySize — used for the create/profile form's basic company fields. */
export const COMPANY_SIZES = [
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-1000', label: '201–1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

export type OrganizationDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type OrganizationTimeFormat = '12h' | '24h';

/** Mirrors backend OrganizationDateFormat — the only values the settings form may submit. */
export const ORGANIZATION_DATE_FORMATS: { value: OrganizationDateFormat; label: string }[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

/** Mirrors backend OrganizationTimeFormat — the only values the settings form may submit. */
export const ORGANIZATION_TIME_FORMATS: { value: OrganizationTimeFormat; label: string }[] = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' },
];

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface OrganizationSettings {
  timezone?: string;
  locale?: string;
  dateFormat?: OrganizationDateFormat;
  timeFormat?: OrganizationTimeFormat;
  defaultInterviewLanguage?: string;
}

/** GET/PUT .../settings — all fields always present (backend backfills defaults for display). */
export interface OrganizationSettingsDetail {
  timezone: string;
  locale: string;
  dateFormat: OrganizationDateFormat;
  timeFormat: OrganizationTimeFormat;
  defaultInterviewLanguage: string;
}

/** PATCH-like merge — omitted fields keep their current effective value. At least one field is required. */
export interface UpdateOrganizationSettingsPayload {
  timezone?: string;
  locale?: string;
  dateFormat?: OrganizationDateFormat;
  timeFormat?: OrganizationTimeFormat;
  defaultInterviewLanguage?: string;
}

export interface InstituteProfile {
  instituteKind?: string;
  affiliation?: string;
  accreditation?: string;
  establishedYear?: number;
  studentCount?: number;
}

export interface CompanyProfile {
  industry?: string;
  companySize?: string;
  establishedYear?: number;
}

/** Summary shape — returned by the list-my-organizations endpoint only. */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  logoUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** Detail shape — returned by get/create/update endpoints. */
export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings: OrganizationSettings;
  instituteProfile?: InstituteProfile;
  companyProfile?: CompanyProfile;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationAccess {
  membershipId: string;
  role: OrganizationMemberRole;
  permissions: OrganizationPermission[];
}

/** The dashboard's own, lighter organization shape — not the same as OrganizationDetail (no settings/contact/website). */
export interface DashboardOrganization {
  id: string;
  name: string;
  slug: string;
  type: OrganizationType;
  status: OrganizationStatus;
  logoUrl?: string;
  description?: string;
  instituteProfile?: InstituteProfile;
  companyProfile?: CompanyProfile;
}

export interface DashboardInterviewsSummary {
  total: number;
  inProgress: number;
  completed: number;
}

export interface DashboardQuestionSetsSummary {
  total: number;
}

/**
 * Null outright when the caller lacks MEMBERS_VIEW — never render this
 * section in that case, and never attempt to infer/estimate the numbers
 * client-side. `pendingInvitations` is itself independently null unless
 * the caller additionally has MEMBERS_MANAGE.
 */
export interface DashboardMemberSummary {
  total: number;
  active: number;
  inactive: number;
  byRole: {
    owner: number;
    admin: number;
    trainer: number;
    recruiter: number;
    member: number;
  };
  pendingInvitations: number | null;
}

/** Null outright when the caller lacks ANALYTICS_VIEW — never render this section in that case. */
export interface DashboardUsageSummary {
  interviews: {
    total: number;
    tracked: number;
    untracked: number;
    trackingComplete: boolean;
  };
  ai: {
    callCount: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputCostUsd: number;
    cachedInputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
    pricingComplete: boolean;
  };
}

export interface RecentInterviewItem {
  id: string;
  topic: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecentQuestionSetItem {
  id: string;
  name: string;
  source: 'manual' | 'uploaded';
  createdAt: string;
  updatedAt: string;
}

/** Present only for a company organization — undefined (key absent) for an institute. */
export interface RecentJobItem {
  id: string;
  title: string;
  jobCode?: string;
  status: EmployerJobStatus;
  department?: string;
  updatedAt: string;
}

export interface DashboardRecentActivity {
  recentInterviews: RecentInterviewItem[];
  recentQuestionSets: RecentQuestionSetItem[];
  /** Company-only (Sprint 16C) — absent entirely for an institute organization. */
  recentJobs?: RecentJobItem[];
}

/** Company-only (Sprint 16C) — absent entirely for an institute organization. */
export interface DashboardJobsSummary {
  total: number;
  draft: number;
  open: number;
  paused: number;
  closed: number;
  archived: number;
}

export interface OrganizationDashboard {
  organization: DashboardOrganization;
  access: OrganizationAccess;
  interviews: DashboardInterviewsSummary;
  questionSets: DashboardQuestionSetsSummary;
  /** Company-only (Sprint 16C) — undefined for an institute organization; existing institute behavior/typing is otherwise unchanged. */
  jobs?: DashboardJobsSummary;
  memberSummary: DashboardMemberSummary | null;
  usageSummary: DashboardUsageSummary | null;
  recentActivity: DashboardRecentActivity;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface CreateOrganizationPayload {
  name: string;
  type: OrganizationType;
  description?: string;
  website?: string;
  contactEmail?: string;
  contactPhone?: string;
  instituteProfile?: InstituteProfile;
  companyProfile?: CompanyProfile;
}

/**
 * Whole-object replacement for settings/instituteProfile/companyProfile on
 * this endpoint (matches the backend exactly — it is NOT a partial merge
 * for those three fields, unlike the dedicated /settings sub-endpoint).
 */
export interface UpdateOrganizationPayload {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings?: OrganizationSettings;
  instituteProfile?: InstituteProfile;
  companyProfile?: CompanyProfile;
}

export interface OrganizationMemberUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  user?: OrganizationMemberUser;
  role: OrganizationMemberRole;
  status: OrganizationMemberStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationMemberRole;
  status: OrganizationInvitationStatus;
  invitedByUserId: string;
  expiresAt: string;
  acceptedByUserId?: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationPreview {
  organization: { id: string; name: string; slug: string };
  role: OrganizationMemberRole;
  /** Already masked by the backend (e.g. "j***@example.com") — never the full address. */
  email: string;
  expiresAt: string;
}

export interface AcceptInvitationResult {
  organization: { id: string; name: string; slug: string; type: OrganizationType };
  membership: { id: string; role: OrganizationMemberRole; status: OrganizationMemberStatus; joinedAt: string };
}

// ---- Response envelopes ----

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type CreateOrganizationResponse = ApiEnvelope<{ organization: OrganizationDetail }>;
export type ListOrganizationsResponse = ApiEnvelope<{ organizations: OrganizationSummary[]; pagination: Pagination }>;
export type GetOrganizationResponse = ApiEnvelope<{ organization: OrganizationDetail }>;
export type UpdateOrganizationResponse = ApiEnvelope<{ organization: OrganizationDetail }>;
export type GetOrganizationDashboardResponse = ApiEnvelope<OrganizationDashboard>;
export type GetOrganizationSettingsResponse = ApiEnvelope<{ settings: OrganizationSettingsDetail }>;
export type UpdateOrganizationSettingsResponse = ApiEnvelope<{ settings: OrganizationSettingsDetail }>;
export type ListMembersResponse = ApiEnvelope<{ members: OrganizationMember[]; pagination: Pagination }>;
export type AddMemberResponse = ApiEnvelope<{ member: OrganizationMember }>;
export type UpdateMemberResponse = ApiEnvelope<{ member: OrganizationMember }>;
export type CreateInvitationResponse = ApiEnvelope<{ invitation: OrganizationInvitation; token: string }>;
export type ListInvitationsResponse = ApiEnvelope<{ invitations: OrganizationInvitation[]; pagination: Pagination }>;
export type RevokeInvitationResponse = ApiEnvelope<{ invitation: OrganizationInvitation }>;
export type GetInvitationPreviewResponse = ApiEnvelope<InvitationPreview>;
export type AcceptInvitationResponse = ApiEnvelope<AcceptInvitationResult>;

// ============================================================================
// API Configuration
// ============================================================================

class OrganizationApiService {
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

  // ---- Organizations ----

  async createOrganization(payload: CreateOrganizationPayload): Promise<CreateOrganizationResponse> {
    try {
      const response = await this.api.post<CreateOrganizationResponse>('/organizations', payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create organization');
    }
  }

  /** Discovery — every organization the caller can access: owned, or an ACTIVE member of. */
  async listMyOrganizations(params: { page?: number; limit?: number } = {}): Promise<ListOrganizationsResponse> {
    try {
      const response = await this.api.get<ListOrganizationsResponse>('/organizations', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load organizations');
    }
  }

  async getOrganization(organizationId: string): Promise<GetOrganizationResponse> {
    try {
      const response = await this.api.get<GetOrganizationResponse>(`/organizations/${organizationId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load organization');
    }
  }

  async updateOrganization(organizationId: string, payload: UpdateOrganizationPayload): Promise<UpdateOrganizationResponse> {
    try {
      const response = await this.api.put<UpdateOrganizationResponse>(`/organizations/${organizationId}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update organization');
    }
  }

  /**
   * Full dashboard snapshot (UI-03) — organization summary, the caller's
   * own org-local access (role/permissions), interview/question-set
   * counts, permission-gated memberSummary/usageSummary (null when the
   * caller lacks the relevant permission — never inferred/estimated
   * client-side), and recent activity. Read-only.
   */
  async getDashboard(organizationId: string): Promise<GetOrganizationDashboardResponse> {
    try {
      const response = await this.api.get<GetOrganizationDashboardResponse>(`/organizations/${organizationId}/dashboard`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load organization dashboard');
    }
  }

  /**
   * No endpoint hands back the caller's own role/permissions directly
   * except the dashboard endpoint's `access` field — used here purely to
   * bootstrap RBAC context (OrganizationContext), discarding the rest of
   * the dashboard payload.
   */
  async getOrganizationAccess(organizationId: string): Promise<OrganizationAccess> {
    const response = await this.getDashboard(organizationId);
    return response.data.access;
  }

  /** PATCH-like merge — omitted fields keep their current effective value. Always returns every field (backend backfills defaults for display). */
  async getSettings(organizationId: string): Promise<GetOrganizationSettingsResponse> {
    try {
      const response = await this.api.get<GetOrganizationSettingsResponse>(`/organizations/${organizationId}/settings`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load organization settings');
    }
  }

  async updateSettings(
    organizationId: string,
    payload: UpdateOrganizationSettingsPayload
  ): Promise<UpdateOrganizationSettingsResponse> {
    try {
      const response = await this.api.put<UpdateOrganizationSettingsResponse>(
        `/organizations/${organizationId}/settings`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update organization settings');
    }
  }

  // ---- Members ----

  async listMembers(
    organizationId: string,
    params: { page?: number; limit?: number; role?: OrganizationMemberRole; status?: OrganizationMemberStatus } = {}
  ): Promise<ListMembersResponse> {
    try {
      const response = await this.api.get<ListMembersResponse>(`/organizations/${organizationId}/members`, { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load members');
    }
  }

  /** Identifies the person by an existing user's Mongo id — the backend does not support lookup/invite-by-email here (that's the separate Invitations flow). */
  async addMember(
    organizationId: string,
    payload: { userId: string; role: OrganizationMemberRole }
  ): Promise<AddMemberResponse> {
    try {
      const response = await this.api.post<AddMemberResponse>(`/organizations/${organizationId}/members`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to add member');
    }
  }

  /** Single endpoint for both role and status changes — at least one of the two must be provided. */
  async updateMember(
    organizationId: string,
    memberId: string,
    payload: { role?: OrganizationMemberRole; status?: OrganizationMemberStatus }
  ): Promise<UpdateMemberResponse> {
    try {
      const response = await this.api.put<UpdateMemberResponse>(
        `/organizations/${organizationId}/members/${memberId}`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to update member');
    }
  }

  /** Soft-deactivates (status -> inactive), idempotent — never a physical delete. */
  async removeMember(organizationId: string, memberId: string): Promise<void> {
    try {
      await this.api.delete(`/organizations/${organizationId}/members/${memberId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to remove member');
    }
  }

  // ---- Invitations ----

  /** Returns the raw token exactly once — there is no email-delivery layer, so the caller must relay the acceptance link out of band. */
  async createInvitation(
    organizationId: string,
    payload: { email: string; role: OrganizationMemberRole }
  ): Promise<CreateInvitationResponse> {
    try {
      const response = await this.api.post<CreateInvitationResponse>(
        `/organizations/${organizationId}/invitations`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to create invitation');
    }
  }

  async listInvitations(
    organizationId: string,
    params: { page?: number; limit?: number; status?: OrganizationInvitationStatus; role?: OrganizationMemberRole } = {}
  ): Promise<ListInvitationsResponse> {
    try {
      const response = await this.api.get<ListInvitationsResponse>(`/organizations/${organizationId}/invitations`, {
        params,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load invitations');
    }
  }

  /** Revokes (never deletes) — idempotent on an already-revoked invitation. */
  async revokeInvitation(organizationId: string, invitationId: string): Promise<RevokeInvitationResponse> {
    try {
      const response = await this.api.delete<RevokeInvitationResponse>(
        `/organizations/${organizationId}/invitations/${invitationId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to revoke invitation');
    }
  }

  /** Public — no auth required. Lets a not-yet-registered invitee preview the invite before signing in. */
  async getInvitationPreview(token: string): Promise<GetInvitationPreviewResponse> {
    try {
      const response = await this.api.get<GetInvitationPreviewResponse>(`/organization-invitations/${token}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load invitation');
    }
  }

  /** Requires an authenticated user whose account email matches the invitation exactly. */
  async acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
    try {
      const response = await this.api.post<AcceptInvitationResponse>(`/organization-invitations/${token}/accept`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to accept invitation');
    }
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const organizationApi = new OrganizationApiService();
export default organizationApi;
