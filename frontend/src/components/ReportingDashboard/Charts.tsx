/**
 * Chart Components
 * 
 * Radar Chart, Trend Chart, and Topic Performance Chart
 */

import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type {
  RadarDataPoint,
  ScoreTrendPoint,
  TopicPerformance,
  ScoreBreakdown,
} from './types';
import { CHART_COLORS, DIMENSION_LABELS } from './types';

// ============================================================================
// Chart Container
// ============================================================================

interface ChartContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
  loading?: boolean;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  subtitle,
  children,
  height = 400,
  loading = false,
}) => {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {loading ? (
        <div
          className="flex items-center justify-center bg-gray-50 rounded animate-pulse"
          style={{ height }}
        >
          <div className="text-gray-400">Loading chart...</div>
        </div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
    </div>
  );
};

// ============================================================================
// Radar Chart Component
// ============================================================================

interface ScoreRadarChartProps {
  scores: ScoreBreakdown;
  loading?: boolean;
}

export const ScoreRadarChart: React.FC<ScoreRadarChartProps> = ({
  scores,
  loading = false,
}) => {
  const data: RadarDataPoint[] = [
    { dimension: 'Technical', score: scores.technical, fullMark: 10 },
    { dimension: 'Communication', score: scores.communication, fullMark: 10 },
    { dimension: 'Leadership', score: scores.leadership, fullMark: 10 },
    { dimension: 'Problem Solving', score: scores.problemSolving, fullMark: 10 },
    { dimension: 'Confidence', score: scores.confidence, fullMark: 10 },
  ];

  return (
    <ChartContainer
      title="Performance Radar"
      subtitle="Overall performance across all dimensions"
      loading={loading}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: '#6b7280', fontSize: 12 }}
          />
          <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#6b7280' }} />
          <Radar
            name="Score"
            dataKey="score"
            stroke={CHART_COLORS.primary}
            fill={CHART_COLORS.primary}
            fillOpacity={0.6}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number) => [`${value.toFixed(1)}/10`, 'Score']}
          />
        </RadarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

// ============================================================================
// Trend Chart Component
// ============================================================================

interface ScoreTrendChartProps {
  data: ScoreTrendPoint[];
  loading?: boolean;
}

export const ScoreTrendChart: React.FC<ScoreTrendChartProps> = ({
  data,
  loading = false,
}) => {
  return (
    <ChartContainer
      title="Score Trend"
      subtitle="Performance improvement over time"
      loading={loading}
      height={350}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          />
          <YAxis
            domain={[0, 10]}
            tick={{ fill: '#6b7280', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            labelFormatter={(value) => new Date(value).toLocaleDateString()}
            formatter={(value: number) => value.toFixed(1)}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="overall"
            name="Overall"
            stroke={CHART_COLORS.primary}
            strokeWidth={3}
            dot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="technical"
            name="Technical"
            stroke={CHART_COLORS.technical}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="communication"
            name="Communication"
            stroke={CHART_COLORS.communication}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="leadership"
            name="Leadership"
            stroke={CHART_COLORS.leadership}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

// ============================================================================
// Topic Performance Chart Component
// ============================================================================

interface TopicPerformanceChartProps {
  data: TopicPerformance[];
  loading?: boolean;
}

export const TopicPerformanceChart: React.FC<TopicPerformanceChartProps> = ({
  data,
  loading = false,
}) => {
  // Sort by average score descending
  const sortedData = [...data].sort((a, b) => b.averageScore - a.averageScore);

  return (
    <ChartContainer
      title="Topic Performance"
      subtitle="Average scores by interview topic"
      loading={loading}
      height={350}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sortedData} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis type="number" domain={[0, 10]} tick={{ fill: '#6b7280', fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="topic"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            width={120}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value: number, name: string) => [
              `${value.toFixed(1)}/10`,
              'Average Score',
            ]}
            labelFormatter={(label) => `Topic: ${label}`}
          />
          <Bar
            dataKey="averageScore"
            fill={CHART_COLORS.primary}
            radius={[0, 8, 8, 0]}
          >
            {sortedData.map((entry, index) => (
              <Bar
                key={`bar-${index}`}
                fill={
                  entry.averageScore >= 8
                    ? CHART_COLORS.success
                    : entry.averageScore >= 6
                    ? CHART_COLORS.primary
                    : CHART_COLORS.warning
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};

export default {
  ChartContainer,
  ScoreRadarChart,
  ScoreTrendChart,
  TopicPerformanceChart,
};
