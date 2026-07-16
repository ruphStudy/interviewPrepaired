/**
 * Reporting Dashboard - Type Definitions
 * 
 * Complete TypeScript types for dashboard components, data models, and API responses
 */

// ============================================================================
// Core Score Types
// ============================================================================

/**
 * Individual score dimension (0-10)
 */
export type Score = number;

/**
 * Grade levels
 */
export enum Grade {
  EXCELLENT = 'Excellent',
  GOOD = 'Good',
  AVERAGE = 'Average',
  BELOW_AVERAGE = 'Below Average',
  POOR = 'Poor',
}

/**
 * Interview types
 */
export enum InterviewType {
  NODE_JS = 'NodeJS',
  REACT = 'React',
  ANGULAR = 'Angular',
  MONGODB = 'MongoDB',
  TYPESCRIPT = 'TypeScript',
  SYSTEM_DESIGN = 'SystemDesign',
  TEAM_LEAD = 'TeamLead',
  ENGINEERING_MANAGER = 'EngineeringManager',
}

/**
 * Score breakdown for all dimensions
 */
export interface ScoreBreakdown {
  technical: Score;
  communication: Score;
  leadership: Score;
  problemSolving: Score;
  confidence: Score;
  overall: Score;
}

// ============================================================================
// Evaluation & Report Types
// ============================================================================

/**
 * Single evaluation result
 */
export interface EvaluationResult {
  id: string;
  interviewId: string;
  questionId: string;
  question: string;
  answer: string;
  scores: ScoreBreakdown;
  grade: Grade;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  detailedAnalysis: string;
  keywordCoverage: {
    expected: string[];
    covered: string[];
    missing: string[];
  };
  evaluatedAt: string; // ISO date string
}

/**
 * Interview session
 */
export interface InterviewSession {
  id: string;
  userId: string;
  interviewType: InterviewType;
  title: string;
  startedAt: string;
  completedAt: string | null;
  duration: number; // in seconds
  totalQuestions: number;
  answeredQuestions: number;
  averageScores: ScoreBreakdown;
  overallGrade: Grade;
  status: 'in_progress' | 'completed' | 'abandoned';
}

/**
 * Complete report data
 */
export interface ReportData {
  interview: InterviewSession;
  evaluations: EvaluationResult[];
  aggregatedScores: ScoreBreakdown;
  overallGrade: Grade;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  recommendedTopics: RecommendedTopic[];
  performanceByTopic: TopicPerformance[];
  historicalTrend: ScoreTrendPoint[];
}

// ============================================================================
// Chart Data Types
// ============================================================================

/**
 * Radar chart data point
 */
export interface RadarDataPoint {
  dimension: string;
  score: number;
  fullMark: number;
}

/**
 * Score trend data point
 */
export interface ScoreTrendPoint {
  date: string; // ISO date or formatted string
  overall: number;
  technical: number;
  communication: number;
  leadership: number;
  problemSolving: number;
  confidence: number;
  interviewType: InterviewType;
}

/**
 * Topic performance data
 */
export interface TopicPerformance {
  topic: InterviewType;
  averageScore: number;
  interviewCount: number;
  lastInterviewDate: string;
  trend: 'improving' | 'stable' | 'declining';
}

/**
 * Recommended topic
 */
export interface RecommendedTopic {
  topic: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  resources: Resource[];
  estimatedStudyHours: number;
}

/**
 * Learning resource
 */
export interface Resource {
  title: string;
  type: 'documentation' | 'video' | 'article' | 'book' | 'course';
  url: string;
  duration?: string;
}

// ============================================================================
// Dashboard State Types
// ============================================================================

/**
 * Dashboard filter options
 */
export interface DashboardFilters {
  interviewType?: InterviewType;
  dateRange?: {
    start: string;
    end: string;
  };
  gradeFilter?: Grade[];
  minScore?: number;
  maxScore?: number;
}

/**
 * Dashboard view mode
 */
export type DashboardView = 'overview' | 'detailed' | 'comparison';

/**
 * Dashboard state
 */
export interface DashboardState {
  view: DashboardView;
  filters: DashboardFilters;
  selectedInterview: string | null;
  compareInterviews: string[];
  isLoading: boolean;
  error: Error | null;
}

// ============================================================================
// Export Types
// ============================================================================

/**
 * Export format
 */
export type ExportFormat = 'pdf' | 'csv' | 'json';

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  includeCharts: boolean;
  includeHistory: boolean;
  includeRecommendations: boolean;
  dateRange?: {
    start: string;
    end: string;
  };
}

/**
 * CSV export data
 */
export interface CSVExportData {
  headers: string[];
  rows: (string | number)[][];
}

// ============================================================================
// API Types
// ============================================================================

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
  };
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Report API request
 */
export interface ReportRequest {
  interviewId?: string;
  userId?: string;
  filters?: DashboardFilters;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// Component Props Types
// ============================================================================

/**
 * Dashboard props
 */
export interface DashboardProps {
  interviewId?: string;
  userId?: string;
  initialView?: DashboardView;
  onExport?: (format: ExportFormat) => void;
  onInterviewSelect?: (interviewId: string) => void;
}

/**
 * Summary card props
 */
export interface SummaryCardProps {
  title: string;
  score: number;
  previousScore?: number;
  grade?: Grade;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendPercentage?: number;
}

/**
 * Chart container props
 */
export interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  error?: string;
  height?: number;
}

/**
 * Section props
 */
export interface SectionProps {
  title: string;
  items: string[];
  icon?: React.ReactNode;
  emptyMessage?: string;
  maxItems?: number;
  showMore?: boolean;
  onShowMore?: () => void;
}

/**
 * Interview history item props
 */
export interface InterviewHistoryItemProps {
  interview: InterviewSession;
  selected?: boolean;
  onClick?: () => void;
  onViewReport?: () => void;
  onCompare?: () => void;
}

/**
 * Export panel props
 */
export interface ExportPanelProps {
  reportData: ReportData;
  onExport: (format: ExportFormat, options: ExportOptions) => Promise<void>;
  isExporting?: boolean;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Color theme for charts
 */
export interface ChartColors {
  primary: string;
  secondary: string;
  success: string;
  warning: string;
  danger: string;
  neutral: string;
  technical: string;
  communication: string;
  leadership: string;
  problemSolving: string;
  confidence: string;
}

/**
 * Responsive breakpoints
 */
export interface Breakpoints {
  mobile: number;    // 0-639px
  tablet: number;    // 640-1023px
  desktop: number;   // 1024-1279px
  wide: number;      // 1280px+
}

/**
 * Animation config
 */
export interface AnimationConfig {
  duration: number;
  easing: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out';
  delay?: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default chart colors
 */
export const CHART_COLORS: ChartColors = {
  primary: '#3B82F6',      // blue-500
  secondary: '#8B5CF6',    // violet-500
  success: '#10B981',      // green-500
  warning: '#F59E0B',      // amber-500
  danger: '#EF4444',       // red-500
  neutral: '#6B7280',      // gray-500
  technical: '#3B82F6',    // blue-500
  communication: '#8B5CF6', // violet-500
  leadership: '#10B981',   // green-500
  problemSolving: '#F59E0B', // amber-500
  confidence: '#EC4899',   // pink-500
};

/**
 * Grade colors
 */
export const GRADE_COLORS: Record<Grade, string> = {
  [Grade.EXCELLENT]: '#10B981',      // green-500
  [Grade.GOOD]: '#3B82F6',           // blue-500
  [Grade.AVERAGE]: '#F59E0B',        // amber-500
  [Grade.BELOW_AVERAGE]: '#F97316',  // orange-500
  [Grade.POOR]: '#EF4444',           // red-500
};

/**
 * Interview type display names
 */
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  [InterviewType.NODE_JS]: 'Node.js',
  [InterviewType.REACT]: 'React',
  [InterviewType.ANGULAR]: 'Angular',
  [InterviewType.MONGODB]: 'MongoDB',
  [InterviewType.TYPESCRIPT]: 'TypeScript',
  [InterviewType.SYSTEM_DESIGN]: 'System Design',
  [InterviewType.TEAM_LEAD]: 'Team Lead',
  [InterviewType.ENGINEERING_MANAGER]: 'Engineering Manager',
};

/**
 * Dimension display names
 */
export const DIMENSION_LABELS: Record<keyof Omit<ScoreBreakdown, 'overall'>, string> = {
  technical: 'Technical',
  communication: 'Communication',
  leadership: 'Leadership',
  problemSolving: 'Problem Solving',
  confidence: 'Confidence',
};

/**
 * Default animation config
 */
export const DEFAULT_ANIMATION: AnimationConfig = {
  duration: 800,
  easing: 'ease-out',
  delay: 0,
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is a valid score
 */
export function isValidScore(value: unknown): value is Score {
  return typeof value === 'number' && value >= 0 && value <= 10;
}

/**
 * Check if value is a valid grade
 */
export function isValidGrade(value: unknown): value is Grade {
  return Object.values(Grade).includes(value as Grade);
}

/**
 * Check if value is a valid interview type
 */
export function isValidInterviewType(value: unknown): value is InterviewType {
  return Object.values(InterviewType).includes(value as InterviewType);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get grade color
 */
export function getGradeColor(grade: Grade): string {
  return GRADE_COLORS[grade];
}

/**
 * Get dimension color
 */
export function getDimensionColor(dimension: keyof ScoreBreakdown): string {
  const colorMap: Record<keyof ScoreBreakdown, string> = {
    technical: CHART_COLORS.technical,
    communication: CHART_COLORS.communication,
    leadership: CHART_COLORS.leadership,
    problemSolving: CHART_COLORS.problemSolving,
    confidence: CHART_COLORS.confidence,
    overall: CHART_COLORS.primary,
  };
  return colorMap[dimension];
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Calculate trend
 */
export function calculateTrend(
  current: number,
  previous: number
): { direction: 'up' | 'down' | 'stable'; percentage: number } {
  const diff = current - previous;
  const percentage = previous > 0 ? (diff / previous) * 100 : 0;

  if (Math.abs(percentage) < 2) {
    return { direction: 'stable', percentage: 0 };
  }

  return {
    direction: diff > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage),
  };
}

/**
 * Format duration (seconds to human readable)
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format date relative to now
 */
export function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}
