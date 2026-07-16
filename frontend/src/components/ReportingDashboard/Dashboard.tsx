/**
 * Main Dashboard Component
 * 
 * Complete reporting dashboard that integrates all components
 */

import React, { useEffect } from 'react';
import type { DashboardProps } from './types';
import { useReportData, generateMockReportData } from './useReportData';
import { useDashboardState } from './useDashboardState';
import { SummaryCards } from './SummaryCards';
import { ScoreRadarChart, ScoreTrendChart, TopicPerformanceChart } from './Charts';
import {
  StrengthsSection,
  WeaknessesSection,
  SuggestionsSection,
  RecommendedTopicsSection,
  InterviewHistorySection,
} from './Sections';
import { ExportPanel } from './ExportPanel';

// ============================================================================
// Main Dashboard Component
// ============================================================================

export const ReportingDashboard: React.FC<DashboardProps> = ({
  interviewId,
  userId,
  initialView = 'overview',
  onExport,
  onInterviewSelect,
}) => {
  // Fetch report data
  const { data: reportData, isLoading, error, refetch } = useReportData({
    interviewId,
    userId,
    autoFetch: true,
  });

  // Dashboard state management
  const dashboardState = useDashboardState({
    initialView,
  });

  // For development: use mock data if no real data
  const displayData = reportData || (interviewId ? generateMockReportData(interviewId) : null);

  // Handle interview selection
  const handleInterviewSelect = (selectedInterviewId: string) => {
    dashboardState.selectInterview(selectedInterviewId);
    onInterviewSelect?.(selectedInterviewId);
  };

  // Loading state
  if (isLoading && !displayData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8">
            <div className="flex items-center justify-center">
              <svg
                className="animate-spin h-8 w-8 text-blue-600 mr-3"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-lg text-gray-600">Loading report data...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !displayData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-8">
            <div className="flex items-center mb-4">
              <svg
                className="w-6 h-6 text-red-600 mr-3"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <h3 className="text-lg font-semibold text-red-800">Error Loading Report</h3>
            </div>
            <p className="text-red-700 mb-4">{error.message}</p>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No data state
  if (!displayData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <svg
              className="w-16 h-16 text-gray-400 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Report Data Available
            </h3>
            <p className="text-gray-600 mb-4">
              Complete an interview to see your performance report
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {displayData.interview.title}
              </h1>
              <p className="text-gray-600 mt-1">
                {displayData.interview.interviewType} •{' '}
                {new Date(displayData.interview.startedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <button
              onClick={refetch}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <SummaryCards
          scores={displayData.aggregatedScores}
          grade={displayData.overallGrade}
          loading={isLoading}
        />

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ScoreRadarChart scores={displayData.aggregatedScores} loading={isLoading} />
          <TopicPerformanceChart
            data={displayData.performanceByTopic}
            loading={isLoading}
          />
        </div>

        <div className="mb-6">
          <ScoreTrendChart data={displayData.historicalTrend} loading={isLoading} />
        </div>

        {/* Feedback Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <StrengthsSection strengths={displayData.strengths} />
            <SuggestionsSection suggestions={displayData.suggestions} />
          </div>
          <div>
            <WeaknessesSection weaknesses={displayData.weaknesses} />
            <RecommendedTopicsSection topics={displayData.recommendedTopics} />
          </div>
        </div>

        {/* Interview History */}
        {/* <div className="mb-6">
          <InterviewHistorySection
            interviews={[displayData.interview]}
            selectedId={displayData.interview.id}
            onSelect={handleInterviewSelect}
            onViewReport={(id) => console.log('View report:', id)}
            onCompare={(id) => dashboardState.addToComparison(id)}
          />
        </div> */}

        {/* Export Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ExportPanel reportData={displayData} onExport={onExport} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportingDashboard;
