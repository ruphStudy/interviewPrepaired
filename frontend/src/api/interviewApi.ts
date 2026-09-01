/**
 * Interview API Service
 * 
 * Handles all API calls to the backend interview endpoints
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

// Generic topic interface - can be ANY field or domain
export interface InterviewTopic {
  value: string;
  label: string;
}

export interface StartInterviewRequest {
  topic: string; // Can be any field: "Banking", "Sales", "Node.js", "Marketing", etc.
  difficulty: string;
  experienceYears: number;
  totalQuestions?: number;
  interviewStyle?: string;
  experienceLevel?: string;
  interviewMode?: 'ai-generated' | 'uploaded';
  questions?: Array<{ questionText: string; referenceAnswer?: string }>; // Required when interviewMode is 'uploaded'
  shuffleQuestions?: boolean;
  interviewLanguage?: string;
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
    };
  };
}

export interface SubmitAnswerRequest {
  interviewId: string;
  answer: string;
  duration: number;
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
  // New dynamic format
  dimensions?: EvaluationDimension[];
  
  // Old fixed format (backward compatibility)
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
    };
    evaluation: EvaluationResult;
    nextQuestion?: {
      question: string;
      expectedPoints: string[];
      followUpTopics: string[];
    };
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
    modelAnswer?: string; // Complete ideal answer for learning
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
  // null for interviews that predate AI usage tracking — never a fabricated/estimated cost.
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
  data: {
    report: InterviewReport;
  };
}

// ============================================================================
// API Configuration
// ============================================================================

class InterviewApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT,
    });

    // Add auth token to requests
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Handle response errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error
          const message = error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          // No response received
          throw new Error('No response from server. Please check your connection.');
        } else {
          // Request setup error
          throw new Error(error.message || 'Failed to make request');
        }
      }
    );
  }

  /**
   * Start a new interview
   */
  async startInterview(data: StartInterviewRequest): Promise<StartInterviewResponse> {
    try {
      const response = await this.api.post<StartInterviewResponse>('/interview/start', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to start interview');
    }
  }

  /**
   * Submit answer for current question
   */
  async submitAnswer(data: SubmitAnswerRequest): Promise<SubmitAnswerResponse> {
    try {
      const response = await this.api.post<SubmitAnswerResponse>('/interview/answer', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to submit answer');
    }
  }

  /**
   * Parse an uploaded question file (TXT/CSV/DOCX/PDF) into a preview list.
   * Preview only — does not create an interview.
   */
  async parseQuestionFile(file: File): Promise<ParseQuestionFileResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await this.api.post<ParseQuestionFileResponse>(
        '/interview/parse-question-file',
        formData,
        { headers: { 'Content-Type': undefined } } // let the browser set the multipart boundary
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to parse question file');
    }
  }

  /**
   * Get interview report
   */
  async getReport(interviewId: string): Promise<GetReportResponse> {
    try {
      const response = await this.api.get<GetReportResponse>(`/interview/report/${interviewId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to get interview report');
    }
  }

  /**
   * Delete interview
   */
  async deleteInterview(interviewId: string): Promise<void> {
    try {
      await this.api.delete(`/interview/${interviewId}`);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to delete interview');
    }
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const interviewApi = new InterviewApiService();
export default interviewApi;

// ============================================================================
// Popular Topics (Top 10 + Other option)
// ============================================================================

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

// Full list of suggested topics for reference
export const ALL_TOPICS_EXAMPLES = [
  'Node.js', 'React', 'Angular', 'Python', 'Java', 'TypeScript', 'MongoDB', 'SQL',
  'System Design', 'DevOps', 'Cloud Computing', 'Manual Testing', 'Automation Testing',
  'QA Engineering', 'Team Lead', 'Engineering Manager', 'Project Management', 
  'Product Management', 'Banking', 'Accounting', 'Financial Analysis', 'Investment Banking',
  'Sales', 'Digital Marketing', 'Content Marketing', 'SEO', 'HR Interview', 'Recruitment',
  'Customer Support', 'Data Analysis', 'Business Analysis', 'UX Design', 'Healthcare', 'Legal'
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
