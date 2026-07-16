/**
 * Reporting Dashboard - Main Exports
 * 
 * Barrel export file for clean imports
 */

// Main Dashboard Component
export { ReportingDashboard as default, ReportingDashboard } from './Dashboard';

// Sub-components
export { SummaryCard, SummaryCards } from './SummaryCards';
export {
  ChartContainer,
  ScoreRadarChart,
  ScoreTrendChart,
  TopicPerformanceChart,
} from './Charts';
export {
  StrengthsSection,
  WeaknessesSection,
  SuggestionsSection,
  RecommendedTopicsSection,
  InterviewHistorySection,
} from './Sections';
export { ExportPanel } from './ExportPanel';

// Hooks
export { useReportData, generateMockReportData } from './useReportData';
export { useDashboardState } from './useDashboardState';

// Utilities
export {
  exportReport,
  exportToPDF,
  exportToCSV,
  exportToJSON,
  isExportFormatSupported,
  getExportFormatName,
  getExportFormatExtension,
  estimateExportSize,
} from './exportUtils';

// Types
export type {
  // Core types
  Score,
  Grade,
  InterviewType,
  ScoreBreakdown,
  
  // Evaluation types
  EvaluationResult,
  InterviewSession,
  ReportData,
  
  // Chart types
  RadarDataPoint,
  ScoreTrendPoint,
  TopicPerformance,
  RecommendedTopic,
  Resource,
  
  // Dashboard types
  DashboardFilters,
  DashboardView,
  DashboardState,
  DashboardProps,
  
  // Export types
  ExportFormat,
  ExportOptions,
  CSVExportData,
  
  // Component prop types
  SummaryCardProps,
  ChartContainerProps,
  SectionProps,
  InterviewHistoryItemProps,
  ExportPanelProps,
  
  // API types
  ApiResponse,
  PaginatedResponse,
  ReportRequest,
  
  // Utility types
  ChartColors,
  Breakpoints,
  AnimationConfig,
} from './types';

// Constants
export {
  CHART_COLORS,
  GRADE_COLORS,
  INTERVIEW_TYPE_LABELS,
  DIMENSION_LABELS,
  DEFAULT_ANIMATION,
} from './types';

// Type guards
export {
  isValidScore,
  isValidGrade,
  isValidInterviewType,
} from './types';

// Utility functions
export {
  getGradeColor,
  getDimensionColor,
  formatScore,
  calculateTrend,
  formatDuration,
  formatRelativeDate,
} from './types';
