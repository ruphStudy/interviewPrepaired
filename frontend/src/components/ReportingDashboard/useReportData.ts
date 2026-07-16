/**
 * Report Data Hook
 * 
 * Custom hook for fetching and managing report data
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  ReportData,
  ReportRequest,
  ApiResponse,
  InterviewSession,
  EvaluationResult,
  ScoreBreakdown,
  TopicPerformance,
  ScoreTrendPoint,
  RecommendedTopic,
} from './types';

// ============================================================================
// Types
// ============================================================================

interface UseReportDataReturn {
  data: ReportData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseReportDataOptions {
  interviewId?: string;
  userId?: string;
  autoFetch?: boolean;
}

// ============================================================================
// API Service (Mock - Replace with real API calls)
// ============================================================================

class ReportApiService {
  private baseUrl = '/api/v1';

  /**
   * Fetch complete report data
   */
  async fetchReport(request: ReportRequest): Promise<ApiResponse<ReportData>> {
    try {
      // TODO: Replace with actual API call
      const response = await fetch(`${this.baseUrl}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch report:', error);
      throw error;
    }
  }

  /**
   * Fetch interview session
   */
  async fetchInterview(interviewId: string): Promise<ApiResponse<InterviewSession>> {
    try {
      const response = await fetch(`${this.baseUrl}/interviews/${interviewId}`);
      if (!response.ok) throw new Error(`API error: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch interview:', error);
      throw error;
    }
  }

  /**
   * Fetch evaluations for interview
   */
  async fetchEvaluations(interviewId: string): Promise<ApiResponse<EvaluationResult[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/interviews/${interviewId}/evaluations`);
      if (!response.ok) throw new Error(`API error: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch evaluations:', error);
      throw error;
    }
  }

  /**
   * Fetch historical trend
   */
  async fetchTrend(userId: string): Promise<ApiResponse<ScoreTrendPoint[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/users/${userId}/trend`);
      if (!response.ok) throw new Error(`API error: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch trend:', error);
      throw error;
    }
  }

  /**
   * Fetch topic performance
   */
  async fetchTopicPerformance(userId: string): Promise<ApiResponse<TopicPerformance[]>> {
    try {
      const response = await fetch(`${this.baseUrl}/users/${userId}/topic-performance`);
      if (!response.ok) throw new Error(`API error: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch topic performance:', error);
      throw error;
    }
  }
}

// ============================================================================
// Data Transformers
// ============================================================================

/**
 * Aggregate scores from evaluations
 */
function aggregateScores(evaluations: EvaluationResult[]): ScoreBreakdown {
  if (evaluations.length === 0) {
    return {
      technical: 0,
      communication: 0,
      leadership: 0,
      problemSolving: 0,
      confidence: 0,
      overall: 0,
    };
  }

  const sum = evaluations.reduce(
    (acc, evaluation) => ({
      technical: acc.technical + evaluation.scores.technical,
      communication: acc.communication + evaluation.scores.communication,
      leadership: acc.leadership + evaluation.scores.leadership,
      problemSolving: acc.problemSolving + evaluation.scores.problemSolving,
      confidence: acc.confidence + evaluation.scores.confidence,
      overall: acc.overall + evaluation.scores.overall,
    }),
    {
      technical: 0,
      communication: 0,
      leadership: 0,
      problemSolving: 0,
      confidence: 0,
      overall: 0,
    }
  );

  const count = evaluations.length;

  return {
    technical: Math.round((sum.technical / count) * 10) / 10,
    communication: Math.round((sum.communication / count) * 10) / 10,
    leadership: Math.round((sum.leadership / count) * 10) / 10,
    problemSolving: Math.round((sum.problemSolving / count) * 10) / 10,
    confidence: Math.round((sum.confidence / count) * 10) / 10,
    overall: Math.round((sum.overall / count) * 10) / 10,
  };
}

/**
 * Extract unique strengths from evaluations
 */
function extractStrengths(evaluations: EvaluationResult[]): string[] {
  const allStrengths = evaluations.flatMap((e) => e.strengths);
  const uniqueStrengths = Array.from(new Set(allStrengths));
  return uniqueStrengths.slice(0, 10); // Top 10
}

/**
 * Extract unique weaknesses from evaluations
 */
function extractWeaknesses(evaluations: EvaluationResult[]): string[] {
  const allWeaknesses = evaluations.flatMap((e) => e.weaknesses);
  const uniqueWeaknesses = Array.from(new Set(allWeaknesses));
  return uniqueWeaknesses.slice(0, 10); // Top 10
}

/**
 * Extract unique suggestions from evaluations
 */
function extractSuggestions(evaluations: EvaluationResult[]): string[] {
  const allSuggestions = evaluations.flatMap((e) => e.suggestions);
  const uniqueSuggestions = Array.from(new Set(allSuggestions));
  return uniqueSuggestions.slice(0, 10); // Top 10
}

/**
 * Generate recommended topics based on weaknesses
 */
function generateRecommendedTopics(
  evaluations: EvaluationResult[],
  interview: InterviewSession
): RecommendedTopic[] {
  // Extract missing keywords
  const missingKeywords = evaluations.flatMap((e) => e.keywordCoverage.missing);
  const keywordCounts = missingKeywords.reduce((acc, keyword) => {
    acc[keyword] = (acc[keyword] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Sort by frequency
  const sortedKeywords = Object.entries(keywordCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5); // Top 5

  return sortedKeywords.map(([keyword, count]) => ({
    topic: keyword,
    priority: count >= 3 ? 'high' : count >= 2 ? 'medium' : 'low',
    reason: `Mentioned in ${count} question(s) but not covered in your answers`,
    resources: [
      {
        title: `${keyword} Documentation`,
        type: 'documentation' as const,
        url: `#`,
        duration: undefined,
      },
    ],
    estimatedStudyHours: count * 2,
  }));
}

/**
 * Calculate overall grade from score
 */
function calculateGrade(overall: number): 'Excellent' | 'Good' | 'Average' | 'Below Average' | 'Poor' {
  if (overall >= 9.0) return 'Excellent';
  if (overall >= 7.5) return 'Good';
  if (overall >= 6.0) return 'Average';
  if (overall >= 4.5) return 'Below Average';
  return 'Poor';
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for fetching and managing report data
 */
export function useReportData(options: UseReportDataOptions = {}): UseReportDataReturn {
  const { interviewId, userId, autoFetch = true } = options;

  const [data, setData] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const apiService = new ReportApiService();

  /**
   * Fetch report data
   */
  const fetchData = useCallback(async () => {
    if (!interviewId && !userId) {
      setError(new Error('Either interviewId or userId is required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch report data
      const response = await apiService.fetchReport({
        interviewId,
        userId,
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch report');
      }

      setData(response.data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      console.error('Error fetching report data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [interviewId, userId]);

  /**
   * Auto-fetch on mount
   */
  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}

// ============================================================================
// Mock Data Generator (For Development)
// ============================================================================

/**
 * Generate mock report data for development
 */
export function generateMockReportData(interviewId: string): ReportData {
  const mockInterview: InterviewSession = {
    id: interviewId,
    userId: 'user-123',
    interviewType: 'React' as any,
    title: 'React Senior Developer Interview',
    startedAt: '2026-06-08T10:00:00Z',
    completedAt: '2026-06-08T11:30:00Z',
    duration: 5400, // 90 minutes
    totalQuestions: 10,
    answeredQuestions: 10,
    averageScores: {
      technical: 8.2,
      communication: 7.5,
      leadership: 6.8,
      problemSolving: 8.0,
      confidence: 7.8,
      overall: 7.7,
    },
    overallGrade: 'Good',
    status: 'completed',
  };

  const mockEvaluations: EvaluationResult[] = [
    {
      id: 'eval-1',
      interviewId,
      questionId: 'q-1',
      question: 'Explain React hooks and their benefits',
      answer: 'React hooks allow functional components to use state and lifecycle...',
      scores: {
        technical: 8.5,
        communication: 7.0,
        leadership: 6.0,
        problemSolving: 8.0,
        confidence: 7.5,
        overall: 7.7,
      },
      grade: 'Good',
      strengths: [
        'Clearly explained useState and useEffect with examples',
        'Mentioned custom hooks and their benefits',
      ],
      weaknesses: [
        'Did not discuss useCallback or useMemo optimization',
        'Could improve explanation of dependency arrays',
      ],
      suggestions: [
        'Study React optimization hooks (useMemo, useCallback)',
        'Practice implementing custom hooks',
        'Review React documentation on hooks dependencies',
      ],
      detailedAnalysis: 'Strong understanding of React hooks fundamentals with good practical examples.',
      keywordCoverage: {
        expected: ['hooks', 'useState', 'useEffect', 'custom hooks', 'dependencies'],
        covered: ['hooks', 'useState', 'useEffect', 'custom hooks'],
        missing: ['dependencies'],
      },
      evaluatedAt: '2026-06-08T10:15:00Z',
    },
    // Add more mock evaluations...
  ];

  const mockTrend: ScoreTrendPoint[] = [
    {
      date: '2026-06-01',
      overall: 6.8,
      technical: 7.0,
      communication: 6.5,
      leadership: 6.0,
      problemSolving: 7.2,
      confidence: 6.8,
      interviewType: 'React' as any,
    },
    {
      date: '2026-06-08',
      overall: 7.7,
      technical: 8.2,
      communication: 7.5,
      leadership: 6.8,
      problemSolving: 8.0,
      confidence: 7.8,
      interviewType: 'React' as any,
    },
  ];

  const mockTopicPerformance: TopicPerformance[] = [
    {
      topic: 'React' as any,
      averageScore: 7.7,
      interviewCount: 5,
      lastInterviewDate: '2026-06-08',
      trend: 'improving',
    },
    {
      topic: 'NodeJS' as any,
      averageScore: 7.2,
      interviewCount: 3,
      lastInterviewDate: '2026-06-05',
      trend: 'stable',
    },
  ];

  return {
    interview: mockInterview,
    evaluations: mockEvaluations,
    aggregatedScores: mockInterview.averageScores,
    overallGrade: mockInterview.overallGrade,
    strengths: extractStrengths(mockEvaluations),
    weaknesses: extractWeaknesses(mockEvaluations),
    suggestions: extractSuggestions(mockEvaluations),
    recommendedTopics: generateRecommendedTopics(mockEvaluations, mockInterview),
    performanceByTopic: mockTopicPerformance,
    historicalTrend: mockTrend,
  };
}

export default useReportData;
