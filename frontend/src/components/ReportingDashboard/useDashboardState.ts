/**
 * Dashboard State Management Hook
 * 
 * Custom hook for managing dashboard UI state
 */

import { useState, useCallback, useMemo } from 'react';
import type { DashboardState, DashboardView, DashboardFilters, InterviewType, Grade } from './types';

// ============================================================================
// Types
// ============================================================================

interface UseDashboardStateReturn extends DashboardState {
  // View management
  setView: (view: DashboardView) => void;
  
  // Filter management
  setFilters: (filters: Partial<DashboardFilters>) => void;
  clearFilters: () => void;
  
  // Interview selection
  selectInterview: (interviewId: string) => void;
  clearSelection: () => void;
  
  // Comparison
  addToComparison: (interviewId: string) => void;
  removeFromComparison: (interviewId: string) => void;
  clearComparison: () => void;
  
  // Loading state
  setLoading: (isLoading: boolean) => void;
  
  // Error state
  setError: (error: Error | null) => void;
  clearError: () => void;
  
  // Computed values
  hasActiveFilters: boolean;
  canCompare: boolean;
}

interface UseDashboardStateOptions {
  initialView?: DashboardView;
  initialFilters?: DashboardFilters;
  maxComparisons?: number;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing dashboard state
 */
export function useDashboardState(
  options: UseDashboardStateOptions = {}
): UseDashboardStateReturn {
  const {
    initialView = 'overview',
    initialFilters = {},
    maxComparisons = 3,
  } = options;

  // State
  const [view, setView] = useState<DashboardView>(initialView);
  const [filters, setFiltersState] = useState<DashboardFilters>(initialFilters);
  const [selectedInterview, setSelectedInterview] = useState<string | null>(null);
  const [compareInterviews, setCompareInterviews] = useState<string[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Filter management
  const setFilters = useCallback((newFilters: Partial<DashboardFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  // Interview selection
  const selectInterview = useCallback((interviewId: string) => {
    setSelectedInterview(interviewId);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedInterview(null);
  }, []);

  // Comparison management
  const addToComparison = useCallback(
    (interviewId: string) => {
      setCompareInterviews((prev) => {
        if (prev.includes(interviewId)) return prev;
        if (prev.length >= maxComparisons) {
          console.warn(`Maximum ${maxComparisons} interviews can be compared`);
          return prev;
        }
        return [...prev, interviewId];
      });
    },
    [maxComparisons]
  );

  const removeFromComparison = useCallback((interviewId: string) => {
    setCompareInterviews((prev) => prev.filter((id) => id !== interviewId));
  }, []);

  const clearComparison = useCallback(() => {
    setCompareInterviews([]);
  }, []);

  // Error management
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Computed values
  const hasActiveFilters = useMemo(() => {
    return (
      !!filters.interviewType ||
      !!filters.dateRange ||
      (filters.gradeFilter && filters.gradeFilter.length > 0) ||
      filters.minScore !== undefined ||
      filters.maxScore !== undefined
    );
  }, [filters]);

  const canCompare = useMemo(() => {
    return compareInterviews.length >= 2;
  }, [compareInterviews]);

  return {
    // State
    view,
    filters,
    selectedInterview,
    compareInterviews,
    isLoading,
    error,

    // Actions
    setView,
    setFilters,
    clearFilters,
    selectInterview,
    clearSelection,
    addToComparison,
    removeFromComparison,
    clearComparison,
    setLoading,
    setError,
    clearError,

    // Computed
    hasActiveFilters,
    canCompare,
  };
}

// ============================================================================
// Filter Helpers
// ============================================================================

/**
 * Apply filters to interview sessions
 */
export function applyFilters<T extends { interviewType: InterviewType; overallGrade: Grade; averageScores: { overall: number } }>(
  items: T[],
  filters: DashboardFilters
): T[] {
  return items.filter((item) => {
    // Interview type filter
    if (filters.interviewType && item.interviewType !== filters.interviewType) {
      return false;
    }

    // Grade filter
    if (filters.gradeFilter && filters.gradeFilter.length > 0) {
      if (!filters.gradeFilter.includes(item.overallGrade)) {
        return false;
      }
    }

    // Min score filter
    if (filters.minScore !== undefined && item.averageScores.overall < filters.minScore) {
      return false;
    }

    // Max score filter
    if (filters.maxScore !== undefined && item.averageScores.overall > filters.maxScore) {
      return false;
    }

    // Date range filter
    if (filters.dateRange) {
      // TODO: Implement date range filtering
      // Would need startedAt or completedAt field
    }

    return true;
  });
}

/**
 * Get active filter count
 */
export function getActiveFilterCount(filters: DashboardFilters): number {
  let count = 0;

  if (filters.interviewType) count++;
  if (filters.dateRange) count++;
  if (filters.gradeFilter && filters.gradeFilter.length > 0) count++;
  if (filters.minScore !== undefined) count++;
  if (filters.maxScore !== undefined) count++;

  return count;
}

/**
 * Build filter display string
 */
export function buildFilterDisplayString(filters: DashboardFilters): string {
  const parts: string[] = [];

  if (filters.interviewType) {
    parts.push(`Type: ${filters.interviewType}`);
  }

  if (filters.gradeFilter && filters.gradeFilter.length > 0) {
    parts.push(`Grades: ${filters.gradeFilter.join(', ')}`);
  }

  if (filters.minScore !== undefined) {
    parts.push(`Min Score: ${filters.minScore}`);
  }

  if (filters.maxScore !== undefined) {
    parts.push(`Max Score: ${filters.maxScore}`);
  }

  if (filters.dateRange) {
    parts.push(`Date: ${filters.dateRange.start} - ${filters.dateRange.end}`);
  }

  return parts.join(' • ');
}

export default useDashboardState;
