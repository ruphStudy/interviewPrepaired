import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { interviewApi, InterviewReport } from '../api/interviewApi';
import { API_BASE_URL } from '../config/api.config';
import { getLanguageByCode } from '../config/languages';

/** Never render the literal text "undefined"/"null"/placeholder or an empty value as an expected answer. */
function hasValidModelAnswer(modelAnswer: unknown): modelAnswer is string {
  return (
    typeof modelAnswer === 'string' &&
    modelAnswer.trim().length > 0 &&
    modelAnswer !== 'undefined' &&
    modelAnswer !== 'null' &&
    modelAnswer !== 'Model answer generation unavailable.'
  );
}

/** Adaptive precision so a real nonzero cost never displays as "$0.00". */
function formatCostUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

// USD is the actual billed currency (from OpenAI's own USD pricing) — this is
// only a reference conversion for display, not a second "actual" figure.
// Approximate rate, update periodically; not tied to an exact FX date/rate.
const USD_TO_INR_RATE = 83;

function formatCostInr(usdValue: number): string {
  const inr = usdValue * USD_TO_INR_RATE;
  if (inr === 0) return '₹0.00';
  if (inr >= 1) return `₹${inr.toFixed(2)}`;
  if (inr >= 0.01) return `₹${inr.toFixed(4)}`;
  return `₹${inr.toFixed(6)}`;
}

// Types
interface InterviewHistoryItem {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  overallScore: number;
  totalQuestions: number;
  completedQuestions: number;
  createdAt: string;
  completedAt?: string;
}

interface ScoreData {
  subject: string;
  score: number;
  fullMark: 10;
}

interface HistoryScoreData {
  date: string;
  score: number;
}

// Main Component
const ReportDashboard: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();

  // State
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'details' | 'history'>('overview');
  const [exportLoading, setExportLoading] = useState<'pdf' | 'csv' | 'json' | null>(null);

  // Fetch Report Data
  useEffect(() => {
    const fetchReport = async () => {
      if (!interviewId) {
        setError('Interview ID is required');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await interviewApi.getReport(interviewId);
        setReport(response.data.report);
        setError(null);
      } catch (err: any) {
        setError(err.message || 'Failed to load report');
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [interviewId]);

  // Fetch Interview History
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        // This would be a new API endpoint: GET /api/interview/history
        // For now, using mock data structure
        const historyData: InterviewHistoryItem[] = [];
        setHistory(historyData);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    };

    fetchHistory();
  }, []);

  // Prepare Radar Chart Data
  const getRadarChartData = (): ScoreData[] => {
    if (!report?.finalReport) return [];
    
    // Check if we have dimensions in the first question (new format)
    const firstQuestion = report.questions?.[0];
    if (firstQuestion?.evaluation?.dimensions) {
      // Use dynamic dimensions
      const dimensionMap = new Map<string, { sum: number; count: number; label: string }>();
      
      report.questions.forEach(q => {
        if (q.evaluation?.dimensions) {
          q.evaluation.dimensions.forEach((dim: any) => {
            const existing = dimensionMap.get(dim.name) || { sum: 0, count: 0, label: dim.label };
            existing.sum += dim.score;
            existing.count += 1;
            dimensionMap.set(dim.name, existing);
          });
        }
      });

      return Array.from(dimensionMap.entries()).map(([_name, data]) => ({
        subject: data.label,
        score: data.count > 0 ? data.sum / data.count : 0,
        fullMark: 10,
      }));
    }

    // Fallback: calculate from old fixed format if available
    if (report.questions.some(q => q.evaluation && 'technicalScore' in (q.evaluation as any))) {
      const evaluations = report.questions.filter(q => q.evaluation);
      const count = evaluations.length || 1;
      
      const avgTechnical = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).technicalScore ?? 0), 0) / count;
      const avgCommunication = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).communicationScore ?? 0), 0) / count;
      const avgLeadership = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).leadershipScore ?? 0), 0) / count;
      const avgProblemSolving = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).problemSolvingScore ?? 0), 0) / count;
      const avgConfidence = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).confidenceScore ?? 0), 0) / count;
      
      return [
        { subject: 'Technical', score: avgTechnical, fullMark: 10 },
        { subject: 'Communication', score: avgCommunication, fullMark: 10 },
        { subject: 'Leadership', score: avgLeadership, fullMark: 10 },
        { subject: 'Problem Solving', score: avgProblemSolving, fullMark: 10 },
        { subject: 'Confidence', score: avgConfidence, fullMark: 10 },
      ];
    }
    
    // No dimension data available
    return [];
  };

  // Prepare Bar Chart Data (Per Question)
  const getBarChartData = () => {
    if (!report?.questions) return [];

    return report.questions.map((q, index) => {
      const chartData: any = {
        question: `Q${index + 1}`,
        overall: q.evaluation?.overallScore ?? 0,
      };

      // Check if we have dynamic dimensions (new format)
      if (q.evaluation?.dimensions) {
        q.evaluation.dimensions.forEach((dim: any) => {
          chartData[dim.name] = dim.score;
        });
      } else {
        // Fallback to old fixed format
        chartData.technical = q.evaluation?.technicalScore ?? 0;
        chartData.communication = q.evaluation?.communicationScore ?? 0;
        chartData.leadership = q.evaluation?.leadershipScore ?? 0;
        chartData.problemSolving = q.evaluation?.problemSolvingScore ?? 0;
        chartData.confidence = q.evaluation?.confidenceScore ?? 0;
      }

      return chartData;
    });
  };

  // Prepare History Line Chart Data
  const getHistoryChartData = (): HistoryScoreData[] => {
    return history.map((item) => ({
      date: new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: item.overallScore,
    }));
  };

  // Export Functions
  const exportToPDF = async () => {
    setExportLoading('pdf');
    try {
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error('Not authenticated');

      // Call backend API to generate PDF
      const response = await fetch(
        `${API_BASE_URL}/interview/report/${interviewId}/pdf`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interview-report-${interviewId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExportLoading(null);
    }
  };

  const exportToCSV = () => {
    setExportLoading('csv');
    try {
      if (!report) throw new Error('No report data');

      // Prepare CSV data with dynamic dimensions
      const firstQuestion = report.questions.find(q => q.evaluation);
      let dimensionHeaders: string[] = [];
      
      if (firstQuestion?.evaluation?.dimensions) {
        // New format - use dynamic dimensions
        dimensionHeaders = firstQuestion.evaluation.dimensions.map((dim: any) => dim.label);
      } else {
        // Old format - use fixed scores
        dimensionHeaders = [
          'Technical Score',
          'Communication Score',
          'Leadership Score',
          'Problem Solving Score',
          'Confidence Score',
        ];
      }

      const headers = [
        'Question Number',
        'Question Text',
        'Answer Text',
        ...dimensionHeaders,
        'Overall Score',
      ];

      const rows = report.questions.map((q, index) => {
        const row: any[] = [
          index + 1,
          `"${q.questionText.replace(/"/g, '""')}"`,
          `"${q.answerText?.replace(/"/g, '""') || 'N/A'}"`,
        ];

        // Add dimension scores
        if (q.evaluation?.dimensions) {
          // New format
          q.evaluation.dimensions.forEach((dim: any) => {
            row.push(dim.score ?? 0);
          });
        } else {
          // Old format
          row.push(
            q.evaluation?.technicalScore ?? 0,
            q.evaluation?.communicationScore ?? 0,
            q.evaluation?.leadershipScore ?? 0,
            q.evaluation?.problemSolvingScore ?? 0,
            q.evaluation?.confidenceScore ?? 0
          );
        }

        row.push(q.evaluation?.overallScore ?? 0);
        return row;
      });

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interview-report-${interviewId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
      alert('Failed to export CSV');
    } finally {
      setExportLoading(null);
    }
  };

  const exportToJSON = () => {
    setExportLoading('json');
    try {
      if (!report) throw new Error('No report data');

      // Prepare JSON data
      const jsonData = {
        interviewId: report.interview.id,
        topic: report.interview.topic,
        difficulty: report.interview.difficulty,
        experienceYears: report.interview.experienceYears,
        totalQuestions: report.interview.totalQuestions,
        status: report.interview.status,
        createdAt: report.interview.createdAt,
        completedAt: report.interview.completedAt,
        finalReport: report.finalReport,
        aiCost: report.aiCost,
        questions: report.questions.map((q) => ({
          questionText: q.questionText,
          answerText: q.answerText,
          duration: q.duration,
          evaluation: q.evaluation,
          answeredAt: q.answeredAt,
        })),
      };

      // Download JSON
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `interview-report-${interviewId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('JSON export failed:', err);
      alert('Failed to export JSON');
    } finally {
      setExportLoading(null);
    }
  };

  // Score Color
  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 8) return 'bg-green-100';
    if (score >= 6) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // Loading State
  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <div className="h-10 w-10 rounded-full border-2 border-gray-200 border-t-primary-600 mx-auto mb-4 animate-spin"></div>
            <p className="text-gray-500 text-sm font-medium">Loading report...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  // Error State
  if (error || !report) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <svg className="w-12 h-12 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="section-title text-lg mb-2">Error Loading Report</h2>
            <p className="text-sm text-gray-500 mb-6">{error || 'Report not found'}</p>
            <button onClick={() => navigate('/setup')} className="btn btn-primary">
              Start New Interview
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  const radarData = getRadarChartData();
  const barData = getBarChartData();
  const historyData = getHistoryChartData();
  const finalReport = report.finalReport;
  const aiCost = report.aiCost;
  // 0 is a valid score, so this must be a nullish check, not `||`.
  const overallScore =
    typeof report.finalReport?.overallScore === 'number'
      ? report.finalReport.overallScore
      : report.statistics?.averageScore ?? 0;

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8">
        {/* Header */}
        <div className="card mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="page-title text-2xl mb-2">Interview Report</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path
                      fillRule="evenodd"
                      d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium text-gray-700 mr-1">Topic:</span> {report.interview.topic}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-medium text-gray-700 mr-1">Difficulty:</span> {report.interview.difficulty}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium text-gray-700 mr-1">Date:</span>{' '}
                  {new Date(report.interview.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium text-gray-700 mr-1">Questions:</span> {report.questions.length} / {report.interview.totalQuestions}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18" />
                  </svg>
                  <span className="font-medium text-gray-700 mr-1">Language:</span>{' '}
                  {getLanguageByCode(report.interview.interviewLanguage).nativeLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={exportToPDF}
                disabled={exportLoading !== null}
                className="btn btn-secondary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'pdf' ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                PDF
              </button>
              <button
                onClick={exportToCSV}
                disabled={exportLoading !== null}
                className="btn btn-secondary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'csv' ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                CSV
              </button>
              <button
                onClick={exportToJSON}
                disabled={exportLoading !== null}
                className="btn btn-secondary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'json' ? (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                JSON
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs mb-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('details')}
                className={`tab ${activeTab === 'details' ? 'tab-active' : ''}`}
              >
                Detailed Analysis
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`}
              >
                History
              </button>
        </div>

        <div id="report-content">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Overall Score Card */}
              <div className="bg-primary-700 rounded-xl shadow-card p-8 text-white text-center">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-100">Overall Score</h2>
                <div className="text-6xl sm:text-7xl font-bold mt-2 mb-1 tracking-tight">{overallScore.toFixed(1)}</div>
                <div className="text-primary-100 text-sm">out of 10.0</div>
                <div className="mt-4 inline-flex items-center px-4 py-1.5 bg-white/15 rounded-full text-sm font-semibold">
                  {overallScore >= 8
                    ? 'Excellent Performance'
                    : overallScore >= 6
                    ? 'Good Performance'
                    : 'Needs Improvement'}
                </div>
              </div>

              {/* Score Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Dynamic Score Cards based on actual dimensions */}
                {getRadarChartData().map((data, index) => {
                  // Simple emoji mapping
                  const emojiMap: { [key: string]: string } = {
                    'Technical': '🔧',
                    'Technical Knowledge': '🔧',
                    'Communication': '💬',
                    'Leadership': '👥',
                    'Problem Solving': '🧩',
                    'Confidence': '💪',
                    'Persuasion': '🎯',
                    'Customer Handling': '🤝',
                    'Subject Knowledge': '📚',
                    'Domain Knowledge': '📚',
                    'Classroom Management': '🎓',
                    'Student Engagement': '✨',
                    'Conflict Resolution': '🤲',
                    'Strategic Thinking': '🧠',
                    'Culture Fit': '🏢',
                    'Professionalism': '👔',
                    'Motivation': '🔥',
                  };
                  const emoji = emojiMap[data.subject] || '📊';
                  
                  return (
                    <ScoreCard
                      key={index}
                      title={data.subject}
                      score={data.score}
                      icon={emoji}
                    />
                  );
                })}
              </div>

              {/* Radar Chart */}
              <div className="card">
                <h3 className="section-title text-lg mb-4">Performance Radar</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: '#6b7280', fontSize: 12 }}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#6b7280' }} />
                    <Radar
                      name="Score"
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Strengths, Weaknesses, Suggestions Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Strengths */}
                <div className="card">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Strengths</h3>
                  </div>
                  <ul className="space-y-2">
                    {finalReport?.strengthsOverview && finalReport.strengthsOverview.length > 0 ? (
                      finalReport.strengthsOverview.map((strength: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <span className="text-green-600 mr-2 mt-1">✓</span>
                          <span className="text-gray-700">{strength}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-500 italic">No strengths recorded</li>
                    )}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="card">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Weaknesses</h3>
                  </div>
                  <ul className="space-y-2">
                    {finalReport?.weaknessesOverview && finalReport.weaknessesOverview.length > 0 ? (
                      finalReport.weaknessesOverview.map((weakness: string, index: number) => (
                        <li key={index} className="flex items-start">
                          <span className="text-red-600 mr-2 mt-1">✗</span>
                          <span className="text-gray-700">{weakness}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-500 italic">No weaknesses recorded</li>
                    )}
                  </ul>
                </div>

                {/* Suggestions */}
                <div className="card">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Suggestions</h3>
                  </div>
                  <ul className="space-y-2">
                    {finalReport?.recommendations && finalReport.recommendations.length > 0 ? (
                      finalReport.recommendations.map((suggestion, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-blue-600 mr-2 mt-1">→</span>
                          <span className="text-gray-700">{suggestion}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-500 italic">No suggestions available</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Summary */}
              {finalReport?.summary && (
                <div className="card">
                  <h3 className="section-title text-lg mb-4">Summary</h3>
                  <p className="text-gray-700 leading-relaxed">{finalReport.summary}</p>
                </div>
              )}

              {/* Next Steps */}
              {finalReport?.nextSteps && finalReport.nextSteps.length > 0 && (
                <div className="card">
                  <h3 className="section-title text-lg mb-4">Next Steps</h3>
                  <ol className="space-y-3">
                    {finalReport.nextSteps.map((step, index) => (
                      <li key={index} className="flex items-start">
                        <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                          {index + 1}
                        </span>
                        <span className="text-gray-700 pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* AI Usage & Cost */}
              <div className="card">
                <h3 className="section-title text-lg mb-1">AI Usage & Cost</h3>
                {aiCost ? (
                  <>
                    <p className="helper-text mb-1">Based on actual API usage recorded for this interview.</p>
                    <p className="helper-text mb-4">
                      INR is an approximate reference conversion (1 USD ≈ ₹{USD_TO_INR_RATE}), not a second actual figure — USD is the real billed currency.
                    </p>
                    {!aiCost.pricingComplete && (
                      <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-amber-800">
                          Partial cost — pricing unavailable for one or more model calls. The total below excludes those calls.
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="stat-tile">
                        <p className="stat-tile-value">{formatCostUsd(aiCost.totalCostUsd)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">≈ {formatCostInr(aiCost.totalCostUsd)}</p>
                        <p className="stat-tile-label">AI Cost</p>
                      </div>
                      <div className="stat-tile">
                        <p className="stat-tile-value">{aiCost.totalTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Total Tokens</p>
                      </div>
                      <div className="stat-tile">
                        <p className="stat-tile-value">{aiCost.callCount}</p>
                        <p className="stat-tile-label">AI Calls</p>
                      </div>
                      <div className="stat-tile">
                        <p className="stat-tile-value">{aiCost.inputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Input Tokens</p>
                      </div>
                      <div className="stat-tile">
                        <p className="stat-tile-value">{aiCost.outputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Output Tokens</p>
                      </div>
                      <div className="stat-tile">
                        <p className="stat-tile-value">{aiCost.cachedInputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Cached Input Tokens</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">AI usage was not tracked for this interview.</p>
                )}
              </div>
            </div>
          )}

          {/* Detailed Analysis Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Per Question Bar Chart */}
              <div className="card">
                <h3 className="section-title text-lg mb-4">Scores by Question</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="question" tick={{ fill: '#6b7280' }} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#6b7280' }} />
                    <Tooltip />
                    <Legend />
                    {/* Dynamic bars based on available dimensions */}
                    {(() => {
                      const firstQuestion = report.questions.find(q => q.evaluation);
                      if (firstQuestion?.evaluation?.dimensions) {
                        // New format - render bars for each dimension
                        const colors = ['#ef4444', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];
                        return firstQuestion.evaluation.dimensions.map((dim: any, index: number) => (
                          <Bar 
                            key={dim.name}
                            dataKey={dim.name} 
                            fill={colors[index % colors.length]} 
                            name={dim.label} 
                          />
                        ));
                      } else {
                        // Old format - render fixed bars
                        return (
                          <>
                            <Bar dataKey="technical" fill="#ef4444" name="Technical" />
                            <Bar dataKey="communication" fill="#3b82f6" name="Communication" />
                            <Bar dataKey="leadership" fill="#8b5cf6" name="Leadership" />
                            <Bar dataKey="problemSolving" fill="#10b981" name="Problem Solving" />
                            <Bar dataKey="confidence" fill="#f59e0b" name="Confidence" />
                          </>
                        );
                      }
                    })()}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Question Details */}
              <div className="space-y-4">
                <h3 className="section-title text-lg">Question-by-Question Analysis</h3>
                {report.questions.map((question, index) => (
                  <div key={index} className="card">
                    <div className="flex items-start justify-between mb-4 pb-4 border-b border-gray-100">
                      <h4 className="section-title">Question {index + 1}</h4>
                      {question.evaluation && (
                        <span
                          className={`badge ${getScoreBgColor(
                            question.evaluation.overallScore
                          )} ${getScoreColor(question.evaluation.overallScore)}`}
                        >
                          {question.evaluation.overallScore.toFixed(1)} / 10
                        </span>
                      )}
                    </div>

                    <div className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Question</p>
                      <p className="text-gray-800">{question.questionText}</p>
                    </div>

                    {question.answerText && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Your Answer</p>
                        <p className="text-gray-600 surface-muted p-3.5">
                          {question.answerText}
                        </p>
                      </div>
                    )}

                    {/* Expected Interview Answer - Company Standard */}
                    {hasValidModelAnswer(question.modelAnswer) && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-1.5 flex items-center gap-1.5">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                          </svg>
                          Expected Interview Answer
                        </p>
                        <div className="bg-primary-50/60 border border-primary-100 p-4 rounded-lg">
                          <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
                            {question.modelAnswer}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Points Expected */}
                    {question.expectedPoints && question.expectedPoints.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1.5 flex items-center gap-1.5">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Key Points Expected
                        </p>
                        <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-lg">
                          <ul className="space-y-1.5">
                            {question.expectedPoints.map((point, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <svg
                                  className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {question.evaluation?.pointComparison && question.evaluation.pointComparison.length > 0 && (
                      <div className="mb-4">
                        <p className="font-semibold text-gray-700 mb-3">How You Performed on Key Points:</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border border-gray-300 rounded-lg">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b">Expected Point</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b">Status</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b">Your Evidence</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b">How to Improve</th>
                              </tr>
                            </thead>
                            <tbody>
                              {question.evaluation.pointComparison.map((point, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="px-4 py-3 text-sm text-gray-800 border-b">{point.expectedPoint}</td>
                                  <td className="px-4 py-3 text-sm border-b">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                      point.status === 'covered' ? 'bg-green-100 text-green-800' :
                                      point.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                                      point.status === 'missing' ? 'bg-gray-100 text-gray-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {point.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700 border-b">
                                    {point.candidateEvidence || <span className="italic text-gray-400">No evidence found</span>}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600 border-b">{point.improvementPoint}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {question.evaluation && (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                          {/* Dynamic Dimensions (new format) */}
                          {question.evaluation.dimensions && question.evaluation.dimensions.length > 0 ? (
                            question.evaluation.dimensions.map((dim: any) => (
                              <div key={dim.name} className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {dim.score.toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">{dim.label}</div>
                              </div>
                            ))
                          ) : (
                            /* Fixed Scores (old format - backward compatibility) */
                            <>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.technicalScore ?? 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Technical</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.communicationScore ?? 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Communication</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.leadershipScore ?? 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Leadership</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.problemSolvingScore ?? 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Problem Solving</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.confidenceScore ?? 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Confidence</div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {question.evaluation.strengths && question.evaluation.strengths.length > 0 && (
                            <div>
                              <p className="font-semibold text-green-700 mb-2 flex items-center">
                                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Strengths
                              </p>
                              <ul className="text-sm text-gray-600 space-y-1">
                                {question.evaluation.strengths.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {question.evaluation.weaknesses && question.evaluation.weaknesses.length > 0 && (
                            <div>
                              <p className="font-semibold text-red-700 mb-2 flex items-center">
                                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                Weaknesses
                              </p>
                              <ul className="text-sm text-gray-600 space-y-1">
                                {question.evaluation.weaknesses.map((w, i) => (
                                  <li key={i}>• {w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {question.evaluation.suggestions && question.evaluation.suggestions.length > 0 && (
                            <div>
                              <p className="font-semibold text-blue-700 mb-2 flex items-center">
                                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                                </svg>
                                Suggestions
                              </p>
                              <ul className="text-sm text-gray-600 space-y-1">
                                {question.evaluation.suggestions.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {question.duration && (
                      <div className="mt-4 text-sm text-gray-600">
                        <span className="font-semibold">Duration:</span>{' '}
                        {Math.floor(question.duration / 60)}:{(question.duration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* AI Usage & Cost Breakdown */}
              <div className="card">
                <h3 className="section-title text-lg mb-1">AI Usage & Cost Breakdown</h3>
                {aiCost ? (
                  <>
                    <p className="helper-text mb-1">Based on actual API usage recorded for this interview.</p>
                    <p className="helper-text mb-4">
                      INR is an approximate reference conversion (1 USD ≈ ₹{USD_TO_INR_RATE}), not a second actual figure — USD is the real billed currency.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                            <th className="py-2 pr-4">Operation</th>
                            <th className="py-2 pr-4 text-right">Calls</th>
                            <th className="py-2 pr-4 text-right">Input</th>
                            <th className="py-2 pr-4 text-right">Cached</th>
                            <th className="py-2 pr-4 text-right">Output</th>
                            <th className="py-2 pr-4 text-right">Cost (USD)</th>
                            <th className="py-2 pr-0 text-right">Cost (INR, approx)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {aiCost.breakdown.map((row) => (
                            <tr key={row.operation}>
                              <td className="py-2 pr-4 text-gray-800">{row.operation}</td>
                              <td className="py-2 pr-4 text-right text-gray-600">{row.callCount}</td>
                              <td className="py-2 pr-4 text-right text-gray-600">{row.inputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right text-gray-600">{row.cachedInputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right text-gray-600">{row.outputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right font-medium text-gray-900">{formatCostUsd(row.costUsd)}</td>
                              <td className="py-2 pr-0 text-right text-gray-500">{formatCostInr(row.costUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 font-semibold text-gray-900">
                            <td className="py-2 pr-4">TOTAL</td>
                            <td className="py-2 pr-4 text-right">{aiCost.callCount}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.inputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.cachedInputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.outputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{formatCostUsd(aiCost.totalCostUsd)}</td>
                            <td className="py-2 pr-0 text-right text-gray-600">{formatCostInr(aiCost.totalCostUsd)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {!aiCost.pricingComplete && (
                      <p className="mt-3 text-xs text-amber-700">
                        Partial cost — pricing unavailable for one or more model calls.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">AI usage was not tracked for this interview.</p>
                )}
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {historyData.length > 0 ? (
                <>
                  {/* History Line Chart */}
                  <div className="card">
                    <h3 className="section-title text-lg mb-4">Score Progression</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={historyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" tick={{ fill: '#6b7280' }} />
                        <YAxis domain={[0, 10]} tick={{ fill: '#6b7280' }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ fill: '#3b82f6', r: 4 }}
                          name="Overall Score"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* History List */}
                  <div className="card">
                    <h3 className="section-title text-lg mb-4">Past Interviews</h3>
                    <div className="divide-y divide-gray-100">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-3.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/report/${item.id}`)}
                        >
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">{item.topic}</h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.difficulty} &middot; {item.totalQuestions} questions &middot;{' '}
                              {new Date(item.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div className={`text-xl font-bold ${getScoreColor(item.overallScore)}`}>
                              {item.overallScore.toFixed(1)}
                            </div>
                            <div className="text-[11px] text-gray-400">/ 10.0</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card p-12 text-center">
                  <svg
                    className="w-12 h-12 text-gray-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="section-title mb-1.5">No History Yet</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Complete more interviews to see your progress over time
                  </p>
                  <button
                    onClick={() => navigate('/setup')}
                    className="btn btn-primary"
                  >
                    Start New Interview
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button onClick={() => navigate('/setup')} className="btn btn-primary px-6">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
            Start New Interview
          </button>
          <button onClick={() => navigate('/history')} className="btn btn-secondary px-6">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fillRule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clipRule="evenodd"
              />
            </svg>
            View All History
          </button>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

// Score Card Component
interface ScoreCardProps {
  title: string;
  score: number;
  icon: string;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ title, score, icon }) => {
  const getColorClasses = (score: number) => {
    if (score >= 8) return 'text-emerald-600';
    if (score >= 6) return 'text-amber-600';
    return 'text-red-500';
  };

  return (
    <div className="card-flat text-center">
      <div className="text-2xl mb-1.5">{icon}</div>
      <div className="text-xs font-medium text-gray-500 mb-1.5">{title}</div>
      <div className={`text-3xl font-bold ${getColorClasses(score)}`}>{score.toFixed(1)}</div>
      <div className="text-xs text-gray-400 mt-0.5">out of 10</div>
    </div>
  );
};

export default ReportDashboard;
