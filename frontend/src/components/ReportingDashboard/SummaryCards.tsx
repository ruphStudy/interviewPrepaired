/**
 * Summary Cards Component
 * 
 * Display score summary cards with trends
 */

import React from 'react';
import type { SummaryCardProps, ScoreBreakdown, Grade } from './types';
import { formatScore, getGradeColor, calculateTrend } from './types';

// ============================================================================
// Summary Card Component
// ============================================================================

/**
 * Individual summary card
 */
export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  score,
  previousScore,
  grade,
  icon,
  trend,
  trendPercentage,
}) => {
  // Calculate trend if previous score provided
  const trendData =
    previousScore !== undefined
      ? calculateTrend(score, previousScore)
      : trend && trendPercentage !== undefined
      ? { direction: trend, percentage: trendPercentage }
      : null;

  // Score color based on value
  const scoreColor =
    score >= 9.0
      ? 'text-green-600'
      : score >= 7.5
      ? 'text-blue-600'
      : score >= 6.0
      ? 'text-amber-600'
      : score >= 4.5
      ? 'text-orange-600'
      : 'text-red-600';

  // Background color based on value
  const bgColor =
    score >= 9.0
      ? 'bg-green-50'
      : score >= 7.5
      ? 'bg-blue-50'
      : score >= 6.0
      ? 'bg-amber-50'
      : score >= 4.5
      ? 'bg-orange-50'
      : 'bg-red-50';

  return (
    <div className={`${bgColor} rounded-lg p-6 border border-gray-200 hover:shadow-md transition-shadow`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>

      {/* Score */}
      <div className="mb-2">
        <div className={`text-3xl font-bold ${scoreColor}`}>
          {formatScore(score)}
          <span className="text-lg text-gray-400 font-normal">/10</span>
        </div>
      </div>

      {/* Grade */}
      {grade && (
        <div className="mb-3">
          <span
            className="inline-block px-2 py-1 text-xs font-semibold rounded"
            style={{
              backgroundColor: `${getGradeColor(grade)}20`,
              color: getGradeColor(grade),
            }}
          >
            {grade}
          </span>
        </div>
      )}

      {/* Trend */}
      {trendData && (
        <div className="flex items-center text-sm">
          {trendData.direction === 'up' && (
            <>
              <svg
                className="w-4 h-4 text-green-500 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
              <span className="text-green-600 font-medium">
                +{trendData.percentage.toFixed(1)}%
              </span>
            </>
          )}
          {trendData.direction === 'down' && (
            <>
              <svg
                className="w-4 h-4 text-red-500 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
              <span className="text-red-600 font-medium">
                -{trendData.percentage.toFixed(1)}%
              </span>
            </>
          )}
          {trendData.direction === 'stable' && (
            <>
              <svg
                className="w-4 h-4 text-gray-500 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14"
                />
              </svg>
              <span className="text-gray-600 font-medium">Stable</span>
            </>
          )}
          <span className="text-gray-500 ml-1">vs. previous</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Summary Cards Grid Component
// ============================================================================

interface SummaryCardsProps {
  scores: ScoreBreakdown;
  previousScores?: ScoreBreakdown;
  grade: Grade;
  loading?: boolean;
}

/**
 * Grid of summary cards
 */
export const SummaryCards: React.FC<SummaryCardsProps> = ({
  scores,
  previousScores,
  grade,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="bg-gray-100 rounded-lg p-6 animate-pulse"
          >
            <div className="h-4 bg-gray-200 rounded mb-4 w-2/3"></div>
            <div className="h-8 bg-gray-200 rounded mb-2 w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  const cards: SummaryCardProps[] = [
    {
      title: 'Overall Score',
      score: scores.overall,
      previousScore: previousScores?.overall,
      grade: grade,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    {
      title: 'Technical',
      score: scores.technical,
      previousScore: previousScores?.technical,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      ),
    },
    {
      title: 'Communication',
      score: scores.communication,
      previousScore: previousScores?.communication,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      title: 'Leadership',
      score: scores.leadership,
      previousScore: previousScores?.leadership,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      title: 'Problem Solving',
      score: scores.problemSolving,
      previousScore: previousScores?.problemSolving,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      ),
    },
    {
      title: 'Confidence',
      score: scores.confidence,
      previousScore: previousScores?.confidence,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
      {cards.map((card, index) => (
        <SummaryCard key={index} {...card} />
      ))}
    </div>
  );
};

export default SummaryCards;
