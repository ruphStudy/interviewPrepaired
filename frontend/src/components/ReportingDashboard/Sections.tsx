/**
 * Dashboard Sections
 * 
 * Strengths, Weaknesses, Suggestions, Recommended Topics, Interview History
 */

import React, { useState } from 'react';
import type {
  RecommendedTopic,
  InterviewSession,
  InterviewHistoryItemProps,
} from './types';
import { INTERVIEW_TYPE_LABELS, formatDuration, formatRelativeDate } from './types';

// ============================================================================
// Generic Section Component
// ============================================================================

interface SectionProps {
  title: string;
  items: string[];
  icon?: React.ReactNode;
  emptyMessage?: string;
  maxItems?: number;
  iconColor?: string;
}

const Section: React.FC<SectionProps> = ({
  title,
  items,
  icon,
  emptyMessage = 'No items to display',
  maxItems = 5,
  iconColor = 'text-blue-500',
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayItems = showAll ? items : items.slice(0, maxItems);

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {items.length === 0 ? (
        <p className="text-gray-500 text-sm italic">{emptyMessage}</p>
      ) : (
        <>
          <ul className="space-y-3">
            {displayItems.map((item, index) => (
              <li key={index} className="flex items-start">
                <span className={`flex-shrink-0 mt-1 ${iconColor}`}>
                  {icon || (
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                <span className="ml-3 text-sm text-gray-700">{item}</span>
              </li>
            ))}
          </ul>
          {items.length > maxItems && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {showAll ? 'Show Less' : `Show All (${items.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ============================================================================
// Strengths Section
// ============================================================================

interface StrengthsSectionProps {
  strengths: string[];
}

export const StrengthsSection: React.FC<StrengthsSectionProps> = ({ strengths }) => {
  return (
    <Section
      title="Strengths"
      items={strengths}
      icon={
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      }
      iconColor="text-green-500"
      emptyMessage="Complete more interviews to identify your strengths"
    />
  );
};

// ============================================================================
// Weaknesses Section
// ============================================================================

interface WeaknessesSectionProps {
  weaknesses: string[];
}

export const WeaknessesSection: React.FC<WeaknessesSectionProps> = ({
  weaknesses,
}) => {
  return (
    <Section
      title="Areas for Improvement"
      items={weaknesses}
      icon={
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clipRule="evenodd"
          />
        </svg>
      }
      iconColor="text-amber-500"
      emptyMessage="Great job! No major areas for improvement identified"
    />
  );
};

// ============================================================================
// Suggestions Section
// ============================================================================

interface SuggestionsSectionProps {
  suggestions: string[];
}

export const SuggestionsSection: React.FC<SuggestionsSectionProps> = ({
  suggestions,
}) => {
  return (
    <Section
      title="Improvement Suggestions"
      items={suggestions}
      icon={
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
        </svg>
      }
      iconColor="text-blue-500"
      emptyMessage="Continue practicing to receive personalized suggestions"
      maxItems={10}
    />
  );
};

// ============================================================================
// Recommended Topics Section
// ============================================================================

interface RecommendedTopicsSectionProps {
  topics: RecommendedTopic[];
}

export const RecommendedTopicsSection: React.FC<RecommendedTopicsSectionProps> = ({
  topics,
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-amber-100 text-amber-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Recommended Topics to Study
      </h3>
      {topics.length === 0 ? (
        <p className="text-gray-500 text-sm italic">
          Complete more interviews to receive personalized recommendations
        </p>
      ) : (
        <div className="space-y-4">
          {topics.map((topic, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-base font-semibold text-gray-900">
                  {topic.topic}
                </h4>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(
                    topic.priority
                  )}`}
                >
                  {topic.priority.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{topic.reason}</p>
              <div className="flex items-center text-sm text-gray-500">
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>~{topic.estimatedStudyHours} hours</span>
              </div>
              {topic.resources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500 mb-2">Resources:</div>
                  <div className="flex flex-wrap gap-2">
                    {topic.resources.map((resource, rIndex) => (
                      <a
                        key={rIndex}
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800"
                      >
                        {resource.title}
                        <svg
                          className="w-3 h-3 ml-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Interview History Item
// ============================================================================

const InterviewHistoryItem: React.FC<InterviewHistoryItemProps> = ({
  interview,
  selected = false,
  onClick,
  onViewReport,
  onCompare,
}) => {
  const statusColor =
    interview.status === 'completed'
      ? 'bg-green-100 text-green-800'
      : interview.status === 'in_progress'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-gray-100 text-gray-800';

  const gradeColor =
    interview.overallGrade === 'Excellent'
      ? 'text-green-600'
      : interview.overallGrade === 'Good'
      ? 'text-blue-600'
      : interview.overallGrade === 'Average'
      ? 'text-amber-600'
      : 'text-red-600';

  return (
    <div
      className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-base font-semibold text-gray-900">{interview.title}</h4>
          <p className="text-sm text-gray-500 mt-1">
            {INTERVIEW_TYPE_LABELS[interview.interviewType]} •{' '}
            {formatRelativeDate(interview.startedAt)}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded ${statusColor}`}>
          {interview.status.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="text-xs text-gray-500">Overall Score</div>
          <div className={`text-2xl font-bold ${gradeColor}`}>
            {interview.averageScores.overall.toFixed(1)}
            <span className="text-sm font-normal text-gray-400">/10</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Questions</div>
          <div className="text-lg font-semibold text-gray-900">
            {interview.answeredQuestions}/{interview.totalQuestions}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          Duration: {formatDuration(interview.duration)}
        </span>
        <div className="flex gap-2">
          {onViewReport && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewReport();
              }}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              View Report
            </button>
          )}
          {onCompare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCompare();
              }}
              className="text-gray-600 hover:text-gray-800 font-medium"
            >
              Compare
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Interview History Section
// ============================================================================

interface InterviewHistorySectionProps {
  interviews: InterviewSession[];
  selectedId?: string;
  onSelect?: (interviewId: string) => void;
  onViewReport?: (interviewId: string) => void;
  onCompare?: (interviewId: string) => void;
}

export const InterviewHistorySection: React.FC<InterviewHistorySectionProps> = ({
  interviews,
  selectedId,
  onSelect,
  onViewReport,
  onCompare,
}) => {
  const [showAll, setShowAll] = useState(false);
  const displayInterviews = showAll ? interviews : interviews.slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Interview History</h3>
      {interviews.length === 0 ? (
        <p className="text-gray-500 text-sm italic">
          No interviews yet. Start your first interview!
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {displayInterviews.map((interview) => (
              <InterviewHistoryItem
                key={interview.id}
                interview={interview}
                selected={interview.id === selectedId}
                onClick={() => onSelect?.(interview.id)}
                onViewReport={() => onViewReport?.(interview.id)}
                onCompare={() => onCompare?.(interview.id)}
              />
            ))}
          </div>
          {interviews.length > 5 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 w-full py-2 text-sm text-blue-600 hover:text-blue-800 font-medium border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {showAll ? 'Show Less' : `Show All (${interviews.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default {
  StrengthsSection,
  WeaknessesSection,
  SuggestionsSection,
  RecommendedTopicsSection,
  InterviewHistorySection,
};
