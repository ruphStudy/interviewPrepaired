/**
 * Interview API Service
 *
 * Handles all API calls to the backend interview endpoints.
 */

import axios, { AxiosInstance } from 'axios';
import { attachAuthExpiryHandler } from '../utils/authExpiry';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

export interface InterviewTopic {
  value: string;
  label: string;
}

/**
 * Phase 12B — mirrors backend `InterviewPersonality`
 * (backend/src/constants/interviewModePolicy.ts) exactly. Presentation-only:
 * affects only the interviewer's acknowledgement/lead-in tone and voice
 * pacing, never scoring/difficulty/evaluation.
 */
export type InterviewPersonality = 'PROFESSIONAL' | 'FRIENDLY' | 'CHALLENGING';

export interface StartInterviewRequest {
  topic: string;
  difficulty: string;
  experienceYears: number;
  totalQuestions?: number;
  interviewStyle?: string;
  experienceLevel?: string;
  interviewMode?: 'ai-generated' | 'uploaded';
  questions?: Array<{ questionText: string; referenceAnswer?: string }>;
  shuffleQuestions?: boolean;
  interviewLanguage?: string;
  // Phase 12B — optional. Absent resolves to 'PROFESSIONAL' server-side.
  personality?: InterviewPersonality;
}

export interface ParsedUploadedQuestion {
  questionText: string;
  referenceAnswer?: string;
  hasAnswer: boolean;
}

export interface ParseQuestionFileResponse {
  success: boolean;
  message: string;
  data: {
    questions: ParsedUploadedQuestion[];
    summary: {
      totalQuestions: number;
      questionsWithAnswers: number;
      questionsWithoutAnswers: number;
    };
  };
}

export interface StartInterviewResponse {
  success: boolean;
  message: string;
  data: {
    interview: {
      id: string;
      topic: string;
      difficulty: string;
      status: string;
      currentQuestion: {
        questionText: string;
        questionNumber: number;
      };
      totalQuestions: number;
      createdAt: string;
      interviewLanguage?: string;
      // Phase 11 — additive/optional. Server-authoritative phase label
      // ('WELCOME' for every freshly-started interview) and the welcome
      // greeting attached to this first question (absent for non-English/
      // failure cases — falls back to the existing hardcoded phrase
      // sequence, same contract as `presentation` below).
      interviewPhase?: string;
      presentation?: ConversationPresentationPlan;
      // Phase 11 (11A) — additive/optional. A deterministic, template-based
      // (never AI-generated) warm-up prompt to show/speak before question 1,
      // absent for uploaded/institute-uploaded-mode interviews (those skip
      // straight from the welcome greeting to their fixed sequence). See
      // `submitWarmUpAnswer` below for where the candidate's reply goes.
      warmUpPrompt?: string;
    };
  };
}

/**
 * Phase 11 (11A) — the optional warm-up exchange's answer submission.
 * Deliberately a SEPARATE request/response shape from `SubmitAnswerRequest`/
 * `SubmitAnswerResponse` — this never touches `questions[]`/`currentQuestion`/
 * `totalQuestions`, is never evaluated, and never goes through the decision
 * engine (see backend InterviewService.submitWarmUpAnswer).
 */
export interface WarmUpAnswerRequest {
  interviewId: string;
  answer: string;
  duration?: number;
}

export interface WarmUpAnswerResponse {
  success: boolean;
  message: string;
  data: {
    /** true when this call was a no-op replay of an already-recorded warm-up answer (idempotent retry). */
    alreadyAnswered: boolean;
  };
}

export interface SubmitAnswerRequest {
  interviewId: string;
  answer: string;
  duration: number;
  /** 1-based displayed question number. Makes retries/response-loss idempotent instead of applying an old answer to the next question. */
  questionNumber?: number;
  /** Canonical concept-registry keys detected locally (no AI/network) while the candidate was still speaking — see utils/conceptRegistry.ts. Optional/additive. */
  detectedConcepts?: string[];
}

export interface EvaluationDimension {
  name: string;
  label: string;
  score: number;
  description: string;
}

export interface PointComparison {
  expectedPoint: string;
  status: 'covered' | 'partial' | 'missing' | 'incorrect';
  candidateEvidence: string;
  evaluatorReason: string;
  improvementPoint: string;
}

export interface EvaluationResult {
  dimensions?: EvaluationDimension[];
  technicalScore?: number;
  communicationScore?: number;
  leadershipScore?: number;
  problemSolvingScore?: number;
  confidenceScore?: number;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints: string[];
  pointComparison?: PointComparison[];
}

/**
 * Phase 8 (Conversation Humanizer) — the FINAL, already-safe-to-speak
 * presentation content for the next question, mirroring
 * `ConversationPresentationPlan` (backend/src/constants/conversationHumanizer.ts)
 * field-for-field. Additive/optional: an older cached build simply never
 * reads this field and falls back to Phase 7's pre-Phase-8 behavior
 * (speak `nextQuestion.question` plain), exactly matching the backend's own
 * "fail-safe: if humanization fails, use original question text directly"
 * contract.
 */
export interface ConversationPresentationPlan {
  presentationType:
    | 'direct'
    | 'acknowledge_then_ask'
    | 'think_then_ask'
    | 'probe'
    | 'clarify'
    | 'challenge'
    | 'callback'
    | 'contradiction_clarification'
    | 'transition'
    | 'closing';
  acknowledgementPhraseId?: string;
  acknowledgementText?: string;
  transitionPhraseId?: string;
  transitionText?: string;
  spokenQuestionText: string;
  prePauseMs: number;
  betweenPauseMs: number;
  avatarStateHint: string;
  silenceOnly: boolean;
  toneHint?: string;
  /**
   * Phase 12B — optional. Names one of `VoiceDynamicsSegmentCategory`'s
   * existing values (config/voiceDynamics.ts) for the acknowledgement
   * item's rate/pitch preset, reusing that same EXISTING bounded preset
   * table — never a new/unbounded value. See audioPlanBuilder.ts's
   * consumption of this field.
   */
  voiceDynamicsHint?: string;
}

export interface SubmitAnswerResponse {
  success: boolean;
  message: string;
  data: {
    interview: {
      id: string;
      currentQuestion: number;
      totalQuestions: number;
      status: string;
      isCompleted: boolean;
      // Phase 11 — additive/optional; absent on legacy interviews.
      interviewPhase?: string;
    };
    evaluation: EvaluationResult;
    nextQuestion?: {
      question: string;
      expectedPoints: string[];
      followUpTopics: string[];
    };
    presentation?: ConversationPresentationPlan;
  };
}

export interface InterviewReport {
  interview: {
    id: string;
    topic: string;
    difficulty: string;
    experienceYears: number;
    status: string;
    createdAt: string;
    completedAt?: string;
    totalQuestions: number;
    answeredQuestions: number;
    interviewLanguage?: string;
  };
  questions: Array<{
    questionText: string;
    expectedPoints?: string[];
    modelAnswer?: string;
    answerText?: string;
    answeredAt?: string;
    duration?: number;
    evaluation?: EvaluationResult;
  }>;
  finalReport?: {
    overallScore: number;
    summary: string;
    recommendations: string[];
    strengthsOverview: string[];
    weaknessesOverview: string[];
    nextSteps: string[];
    generatedAt: string;
  };
  statistics: {
    averageScore: number;
    completionRate: number;
    totalDuration: number;
    strengthsCount: number;
    weaknessesCount: number;
  };
  aiCost: AICostReport | null;
}

export interface AICostBreakdownEntry {
  operation: string;
  callCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AICostReport {
  tracked: boolean;
  currency: 'USD';
  totalCostUsd: number;
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  callCount: number;
  pricingComplete: boolean;
  breakdown: AICostBreakdownEntry[];
}

export interface GetReportResponse {
  success: boolean;
  message: string;
  data: { report: InterviewReport };
}

export interface InterviewSession {
  interviewId: string;
  status: string;
  interviewMode?: 'ai-generated' | 'uploaded';
  topic: string;
  difficulty: string;
  interviewLanguage?: string;
  totalQuestions: number;
  currentQuestionIndex: number;
  answeredQuestions: number;
  resumable: boolean;
  reportAvailable: boolean;
  currentQuestion: {
    questionText: string;
    expectedPoints?: string[];
    questionType?: string;
  } | null;
  progress: {
    answered: number;
    total: number;
    percentage: number;
  };
}

export interface GetInterviewSessionResponse {
  success: boolean;
  message: string;
  data: InterviewSession;
}

export interface InterviewHistoryItem {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  overallScore?: number;
  totalQuestions: number;
  answeredQuestions: number;
  createdAt: string;
  completedAt?: string;
}

export interface InterviewHistoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface GetInterviewHistoryResponse {
  success: boolean;
  message: string;
  data: {
    interviews: InterviewHistoryItem[];
    pagination: InterviewHistoryPagination;
  };
}

type InterviewApiError = Error & { code?: string; balance?: number };

function preserveInterviewApiError(error: any, fallbackMessage: string): InterviewApiError {
  if (error instanceof Error) {
    const existing = error as InterviewApiError;
    if (!existing.message) existing.message = fallbackMessage;
    return existing;
  }
  return new Error(fallbackMessage) as InterviewApiError;
}

class InterviewApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });
    attachAuthExpiryHandler(this.api);

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.message || 'An error occurred';
          const err = new Error(message) as InterviewApiError;
          if (error.response.data?.code) err.code = error.response.data.code;
          if (typeof error.response.data?.balance === 'number') err.balance = error.response.data.balance;
          throw err;
        }
        if (error.request) throw new Error('No response from server. Please check your connection.');
        throw new Error(error.message || 'Failed to make request');
      }
    );
  }

  async startInterview(data: StartInterviewRequest): Promise<StartInterviewResponse> {
    try {
      const response = await this.api.post<StartInterviewResponse>('/interview/start', data);
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to start interview');
    }
  }

  async submitAnswer(data: SubmitAnswerRequest): Promise<SubmitAnswerResponse> {
    try {
      const response = await this.api.post<SubmitAnswerResponse>('/interview/answer', data);
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to submit answer');
    }
  }

  /** Phase 11 (11A) — see WarmUpAnswerRequest's own doc comment. */
  async submitWarmUpAnswer(data: WarmUpAnswerRequest): Promise<WarmUpAnswerResponse> {
    try {
      const response = await this.api.post<WarmUpAnswerResponse>(`/interview/${data.interviewId}/warmup-answer`, {
        answer: data.answer,
        duration: data.duration,
      });
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to submit warm-up answer');
    }
  }

  async parseQuestionFile(file: File): Promise<ParseQuestionFileResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await this.api.post<ParseQuestionFileResponse>(
        '/interview/parse-question-file',
        formData,
        { headers: { 'Content-Type': undefined } }
      );
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to parse question file');
    }
  }

  async getInterviewSession(interviewId: string): Promise<GetInterviewSessionResponse> {
    try {
      const response = await this.api.get<GetInterviewSessionResponse>(`/interview/${interviewId}/session`);
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to load interview session');
    }
  }

  async getReport(interviewId: string): Promise<GetReportResponse> {
    try {
      const response = await this.api.get<GetReportResponse>(`/interview/report/${interviewId}`);
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to get interview report');
    }
  }

  async deleteInterview(interviewId: string): Promise<void> {
    try {
      await this.api.delete(`/interview/${interviewId}`);
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to delete interview');
    }
  }

  async getHistory(params: { page?: number; limit?: number } = {}): Promise<GetInterviewHistoryResponse> {
    try {
      const response = await this.api.get<GetInterviewHistoryResponse>('/interview/history', { params });
      return response.data;
    } catch (error: any) {
      throw preserveInterviewApiError(error, 'Failed to load interview history');
    }
  }
}

export const interviewApi = new InterviewApiService();
export default interviewApi;

export const POPULAR_TOPICS: InterviewTopic[] = [
  { value: 'Node.js', label: 'Node.js' },
  { value: 'React', label: 'React' },
  { value: 'Python', label: 'Python' },
  { value: 'Java', label: 'Java' },
  { value: 'System Design', label: 'System Design' },
  { value: 'Manual Testing', label: 'Manual Testing' },
  { value: 'Banking', label: 'Banking & Finance' },
  { value: 'Sales', label: 'Sales & Business Development' },
  { value: 'Digital Marketing', label: 'Digital Marketing' },
  { value: 'HR Interview', label: 'HR / Behavioral Interview' },
  { value: 'Other', label: 'Other (Enter Custom Topic)' },
];

export const ALL_TOPICS_EXAMPLES = [
  'Node.js', 'React', 'Angular', 'Python', 'Java', 'TypeScript', 'MongoDB', 'SQL',
  'System Design', 'DevOps', 'Cloud Computing', 'Manual Testing', 'Automation Testing',
  'QA Engineering', 'Team Lead', 'Engineering Manager', 'Project Management',
  'Product Management', 'Banking', 'Accounting', 'Financial Analysis', 'Investment Banking',
  'Sales', 'Digital Marketing', 'Content Marketing', 'SEO', 'HR Interview', 'Recruitment',
  'Customer Support', 'Data Analysis', 'Business Analysis', 'UX Design', 'Healthcare', 'Legal',
];

export const DIFFICULTY_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
];

export const INTERVIEW_STYLES = [
  { value: 'general', label: 'General Interview' },
  { value: 'technical', label: 'Technical Interview' },
  { value: 'behavioral', label: 'Behavioral Interview (STAR)' },
  { value: 'hr', label: 'HR / Culture Fit' },
  { value: 'leadership', label: 'Leadership / Management' },
  { value: 'situational', label: 'Situational Questions' },
];