/**
 * PUBLIC (unauthenticated) candidate interview invitation access (20D). A
 * deliberately separate module from `employerApi.ts` — that class attaches
 * an `Authorization: Bearer <token>` header from localStorage on every
 * request, which is meaningless (and potentially confusing) here: these
 * endpoints require no login, no organization context, and are reachable
 * by anyone holding a valid raw invitation token. The raw token is read
 * directly from the route param by the caller and passed straight through
 * — never persisted to localStorage/sessionStorage/cookies/app state here,
 * and never logged.
 */
import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export type EmployerInterviewInvitationPublicStatus = 'draft' | 'active' | 'accepted' | 'expired' | 'revoked';

export interface PublicInvitationOrganization {
  name: string;
}

export interface PublicInvitationJob {
  title: string;
  jobCode?: string;
}

export interface PublicInvitationInterview {
  blueprintTitle: string;
  estimatedDurationMinutes: number;
  totalSections: number;
  totalPlannedQuestions: number;
}

/** Never includes candidateId/organizationId/applicationId/blueprintId/rubricId/screening ids/tokenHash/recruiter membership ids/JD/resume/screening/score/gap content, or the candidate's email. */
export interface PublicEmployerInterviewInvitation {
  status: EmployerInterviewInvitationPublicStatus;
  invitedName?: string;
  organization: PublicInvitationOrganization;
  job: PublicInvitationJob;
  interview: PublicInvitationInterview;
  expiresAt: string;
  message?: string;
  acceptedAt?: string;
}

export type GetPublicEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: PublicEmployerInterviewInvitation }>;
export type AcceptPublicEmployerInterviewInvitationResponse = ApiEnvelope<{ invitation: PublicEmployerInterviewInvitation }>;

// ============================================================================
// Hiring-assessment interview session handoff (Sprint 20E). Only ever
// created for an ACCEPTED invitation — no AI, no email, no candidate
// account. Never exposes internal candidate/user/organization/
// application/invitation/blueprint/rubric ids.
// ============================================================================

export type PublicInterviewSessionStatus = 'created' | 'in-progress' | 'paused' | 'completed' | 'evaluated';

export interface PublicInterviewSession {
  sessionId: string;
  status: PublicInterviewSessionStatus;
  interviewPurpose: string;
  organizationName: string;
  jobTitle: string;
  blueprintTitle: string;
  estimatedDurationMinutes: number;
  createdAt: string;
}

export type CreatePublicInterviewSessionResponse = ApiEnvelope<{ session: PublicInterviewSession }>;
export type GetPublicInterviewSessionResponse = ApiEnvelope<{ session: PublicInterviewSession | null }>;

// ============================================================================
// Final candidate-facing question materialization (Sprint 21A). Only ever
// created for an ACCEPTED invitation with an existing session — no
// evaluation, no reports. Never exposes competencies/skills/rubric/
// evaluationIntent/evidenceExpected/followUpFocus/model answers.
// ============================================================================

export interface PublicInterviewQuestion {
  id: string;
  question: string;
  category?: string;
  difficulty?: string;
}

export interface PublicInterviewQuestionsSession {
  sessionId: string;
  status: PublicInterviewSessionStatus;
  totalQuestions: number;
  questions: PublicInterviewQuestion[];
}

export type CreatePublicInterviewQuestionsResponse = ApiEnvelope<{ session: PublicInterviewQuestionsSession }>;
export type GetPublicInterviewQuestionsResponse = ApiEnvelope<{ session: PublicInterviewQuestionsSession | null }>;

// ============================================================================
// Answer capture (Sprint 21B). No evaluation, no AI, no report. `answerText`
// is present per-question only for questions the candidate already saved.
// ============================================================================

export interface PublicAssessmentQuestion {
  index: number;
  id: string;
  question: string;
  category?: string;
  difficulty?: string;
  answerText?: string;
}

export interface PublicAssessmentCurrentQuestion {
  index: number;
  id: string;
  question: string;
  category?: string;
  difficulty?: string;
  answerText?: string;
}

export interface PublicAssessmentDetail {
  sessionId: string;
  status: PublicInterviewSessionStatus;
  currentQuestion: number;
  totalQuestions: number;
  answeredQuestions: number;
  completed: boolean;
  question?: PublicAssessmentCurrentQuestion;
  questions: PublicAssessmentQuestion[];
}

export interface SubmitPublicAnswerPayload {
  questionIndex: number;
  answerText: string;
  duration?: number;
}

export type GetPublicAssessmentResponse = ApiEnvelope<{ session: PublicAssessmentDetail | null }>;
export type SubmitPublicAnswerResponse = ApiEnvelope<{ session: PublicAssessmentDetail }>;

class PublicEmployerInterviewInvitationApiService {
  private api: AxiosInstance;

  constructor() {
    // No request interceptor, no Authorization header — genuinely public.
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });

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

  async getPublicEmployerInterviewInvitation(token: string): Promise<GetPublicEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.get<GetPublicEmployerInterviewInvitationResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview invitation');
    }
  }

  async acceptPublicEmployerInterviewInvitation(token: string): Promise<AcceptPublicEmployerInterviewInvitationResponse> {
    try {
      const response = await this.api.post<AcceptPublicEmployerInterviewInvitationResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/accept`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to accept interview invitation');
    }
  }

  /** Creates exactly ONE session — a duplicate call safely returns the same existing session. */
  async createPublicInterviewSession(token: string): Promise<CreatePublicInterviewSessionResponse> {
    try {
      const response = await this.api.post<CreatePublicInterviewSessionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to prepare interview session');
    }
  }

  async getPublicInterviewSession(token: string): Promise<GetPublicInterviewSessionResponse> {
    try {
      const response = await this.api.get<GetPublicInterviewSessionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview session');
    }
  }

  /** Materializes the session's final questions — a duplicate call safely returns the same already-materialized list. */
  async createPublicInterviewQuestions(token: string): Promise<CreatePublicInterviewQuestionsResponse> {
    try {
      const response = await this.api.post<CreatePublicInterviewQuestionsResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/questions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to prepare interview questions');
    }
  }

  async getPublicInterviewQuestions(token: string): Promise<GetPublicInterviewQuestionsResponse> {
    try {
      const response = await this.api.get<GetPublicInterviewQuestionsResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/questions`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load interview questions');
    }
  }

  async getPublicAssessment(token: string): Promise<GetPublicAssessmentResponse> {
    try {
      const response = await this.api.get<GetPublicAssessmentResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/assessment`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load assessment');
    }
  }

  /** Saves exactly one answer — re-submitting an already-answered question is rejected server-side. */
  async submitPublicAnswer(token: string, payload: SubmitPublicAnswerPayload): Promise<SubmitPublicAnswerResponse> {
    try {
      const response = await this.api.post<SubmitPublicAnswerResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/answers`,
        payload
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save answer');
    }
  }
}

export const publicEmployerInterviewInvitationApi = new PublicEmployerInterviewInvitationApiService();
export default publicEmployerInterviewInvitationApi;
