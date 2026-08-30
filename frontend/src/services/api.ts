import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';
import {
  Interview,
  Question,
  Answer,
  Evaluation,
  InterviewReport,
  CreateInterviewRequest,
} from '../types';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const interviewAPI = {
  // Start a new interview
  startInterview: async (data: CreateInterviewRequest): Promise<{ interview: Interview }> => {
    const response = await api.post('/interview/start', data);
    return response.data;
  },

  // Generate a question
  generateQuestion: async (
    interviewId: string,
    previousQuestions?: string[],
    lastAnswer?: string,
    isFollowUp?: boolean
  ): Promise<{ question: Question }> => {
    const response = await api.post('/interview/question', {
      interviewId,
      previousQuestions,
      lastAnswer,
      isFollowUp,
    });
    return response.data;
  },

  // Submit an answer
  submitAnswer: async (questionId: string, answerText: string): Promise<{ answer: Answer }> => {
    const response = await api.post('/interview/answer', {
      questionId,
      answerText,
    });
    return response.data;
  },

  // Evaluate an answer
  evaluateAnswer: async (answerId: string): Promise<{ evaluation: Evaluation }> => {
    const response = await api.post('/interview/evaluate', {
      answerId,
    });
    return response.data;
  },

  // Get interview report
  getReport: async (interviewId: string): Promise<{ report: InterviewReport }> => {
    const response = await api.get(`/interview/report/${interviewId}`);
    return response.data;
  },

  // Get interview history
  getHistory: async (): Promise<{ interviews: Interview[] }> => {
    const response = await api.get('/interview/history');
    return response.data;
  },

  // Delete interview
  deleteInterview: async (interviewId: string): Promise<void> => {
    await api.delete(`/interview/${interviewId}`);
  },

  // Update interview status
  updateStatus: async (interviewId: string, status: string): Promise<void> => {
    await api.patch(`/interview/${interviewId}/status`, { status });
  },
};
