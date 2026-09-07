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

// ============================================================================
// Explicit final submit (Sprint 21C). Status-only — no evaluation/report.
// ============================================================================

export interface PublicAssessmentCompletion {
  sessionId: string;
  status: PublicInterviewSessionStatus;
  totalQuestions: number;
  answeredQuestions: number;
  completedAt?: string;
}

export type CompletePublicSessionResponse = ApiEnvelope<{ session: PublicAssessmentCompletion }>;

// ============================================================================
// Multi-step scenario simulation (Sprint 28D) — candidate-safe scenario
// execution, isolated from the standard Interview.questions flow. NEVER
// exposes target-competency rubric details, evidenceExpected,
// successEvidence, or failureSignals.
// ============================================================================

export interface PublicScenarioListItem {
  id: string;
  title: string;
  category: string;
  difficulty: string;
}

export type GetPublicReadyScenariosResponse = ApiEnvelope<{ scenarios: PublicScenarioListItem[] }>;

export interface PublicScenarioDetail {
  title: string;
  description: string;
  situation: string;
  candidateRole: string;
  constraints: string[];
  availableInformation: string[];
}

export interface PublicScenarioProgress {
  current: number;
  total: number;
}

export interface PublicScenarioStep {
  sequence: number;
  type: string;
  questionText: string;
  difficulty: string;
  scenarioUpdate?: string;
}

export interface PublicScenarioStepDetail {
  scenario: PublicScenarioDetail;
  progress: PublicScenarioProgress;
  completed: boolean;
  step?: PublicScenarioStep;
}

export type GetPublicScenarioStepResponse = ApiEnvelope<PublicScenarioStepDetail>;
export type SubmitPublicScenarioResponseResponse = ApiEnvelope<PublicScenarioStepDetail>;

// ============================================================================
// Coding Assessment Session (Sprint 30B) — candidate-safe access derived
// exclusively from the authorized invitation token. NO execution yet (30C).
// NEVER exposes hidden test cases/expected outputs/weights/rubric.
// ============================================================================

export interface PublicCodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface PublicCodingFunctionParameter {
  name: string;
  type?: string;
}

export interface PublicCodingFunctionSignature {
  name: string;
  parameters: PublicCodingFunctionParameter[];
  returnType?: string;
}

export interface PublicCodingStarterCode {
  javascript?: string;
  typescript?: string;
  python?: string;
}

export interface PublicCodingQuestionProgress {
  index: number;
  submittedAttemptCount: number;
  maxAttempts: number;
}

export interface PublicCodingDraft {
  language: string;
  sourceCode: string;
  savedAt?: string;
}

export interface PublicCodingSubmissionSummary {
  id: string;
  attemptNumber: number;
  language: string;
  submittedAt?: string;
}

export interface PublicCodingQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  supportedLanguages: string[];
  constraints: string[];
  examples: PublicCodingExample[];
  starterCode?: PublicCodingStarterCode;
  functionSignature?: PublicCodingFunctionSignature;
  timeLimitMs?: number;
  progress: PublicCodingQuestionProgress;
  draft: PublicCodingDraft | null;
  submissions: PublicCodingSubmissionSummary[];
}

export interface PublicCodingSessionDetail {
  configured?: boolean;
  status?: 'not_started' | 'in_progress' | 'submitted' | 'completed';
  totalQuestions?: number;
  currentQuestionIndex?: number;
  startedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  questions?: PublicCodingQuestion[];
}

export type GetPublicCodingSessionResponse = ApiEnvelope<PublicCodingSessionDetail>;
export type SaveCodingDraftResponse = ApiEnvelope<PublicCodingSessionDetail>;
export type SubmitCodingSubmissionResponse = ApiEnvelope<PublicCodingSessionDetail>;

// ============================================================================
// Code Execution (Sprint 30C) — candidate-safe deterministic test results.
// Hidden tests are reduced to a bare label + status, never their content.
// ============================================================================

export type PublicCodingExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'executor_unavailable';
export type PublicCodingResultStatus = 'passed' | 'failed' | 'runtime_error' | 'timeout';

export interface PublicCodingSampleResult {
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  status: PublicCodingResultStatus;
}

export interface PublicCodingHiddenResult {
  label: string;
  status: PublicCodingResultStatus;
}

export type PublicCodingExecutionResultItem = PublicCodingSampleResult | PublicCodingHiddenResult;

export interface PublicCodingExecutionSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  hiddenTests: number;
  hiddenPassed: number;
  sampleTests: number;
  samplePassed: number;
  passPercent: number;
}

export interface PublicCodingExecutionDetail {
  executed: boolean;
  status?: PublicCodingExecutionStatus;
  language?: string;
  results?: PublicCodingExecutionResultItem[];
  summary?: PublicCodingExecutionSummary;
  startedAt?: string;
  completedAt?: string;
}

export type RunPublicCodingSubmissionResponse = ApiEnvelope<PublicCodingExecutionDetail>;

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

  /** Status-only, idempotent — an already-completed session returns success again. */
  async completePublicSession(token: string): Promise<CompletePublicSessionResponse> {
    try {
      const response = await this.api.post<CompletePublicSessionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/complete`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to submit assessment');
    }
  }

  async getPublicReadyScenarios(token: string): Promise<GetPublicReadyScenariosResponse> {
    try {
      const response = await this.api.get<GetPublicReadyScenariosResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/scenarios`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenarios');
    }
  }

  /** Starts the scenario session idempotently on first access. */
  async getPublicScenarioStep(token: string, scenarioId: string): Promise<GetPublicScenarioStepResponse> {
    try {
      const response = await this.api.get<GetPublicScenarioStepResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/scenarios/${scenarioId}`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load scenario step');
    }
  }

  /** Submits a response to the CURRENT step only — no AI runs here. */
  async submitPublicScenarioResponse(token: string, scenarioId: string, answerText: string): Promise<SubmitPublicScenarioResponseResponse> {
    try {
      const response = await this.api.post<SubmitPublicScenarioResponseResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/scenarios/${scenarioId}`,
        { answerText }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to submit scenario response');
    }
  }

  /** Starts the coding session idempotently on first access. */
  async getPublicCodingSession(token: string): Promise<GetPublicCodingSessionResponse> {
    try {
      const response = await this.api.get<GetPublicCodingSessionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/coding`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load coding session');
    }
  }

  /** NO execution, NO evaluation — saves the candidate's current draft only. */
  async savePublicCodingDraft(
    token: string,
    codingQuestionId: string,
    language: string,
    sourceCode: string
  ): Promise<SaveCodingDraftResponse> {
    try {
      const response = await this.api.put<SaveCodingDraftResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/coding/${codingQuestionId}/draft`,
        { language, sourceCode }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to save draft');
    }
  }

  /** Persists an immutable submitted attempt. NO execution yet. */
  async submitPublicCodingSubmission(
    token: string,
    codingQuestionId: string,
    language: string,
    sourceCode: string
  ): Promise<SubmitCodingSubmissionResponse> {
    try {
      const response = await this.api.post<SubmitCodingSubmissionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/coding/${codingQuestionId}/submit`,
        { language, sourceCode }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to submit code');
    }
  }

  /** Executes THIS candidate's own already-submitted attempt against its question's test cases. NO AI. May report `executor_unavailable` when no secure runner is configured. */
  async runPublicCodingSubmission(token: string, codingQuestionId: string, submissionId: string): Promise<RunPublicCodingSubmissionResponse> {
    try {
      const response = await this.api.post<RunPublicCodingSubmissionResponse>(
        `/public/employer-interview-invitations/${encodeURIComponent(token)}/session/coding/${codingQuestionId}/submissions/${submissionId}/run`
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to run tests');
    }
  }
}

export const publicEmployerInterviewInvitationApi = new PublicEmployerInterviewInvitationApiService();
export default publicEmployerInterviewInvitationApi;
