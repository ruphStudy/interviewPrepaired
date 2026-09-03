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
import {
  Download,
  Table2,
  Braces,
  CheckCircle2,
  Target,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  BookOpenCheck,
  Loader2,
  AlertCircle,
  Cpu,
  Coins,
  Languages,
  Sparkles,
  History as HistoryIcon,
} from 'lucide-react';

// Shared white/mentor-border tooltip so all three chart types (radar/bar/line) render consistently.
const chartTooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #DDEBE7',
  borderRadius: 8,
  fontSize: 12,
  color: '#172A32',
  boxShadow: '0 4px 18px rgba(25, 70, 65, 0.06)',
};

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

  // Score Color — Calm Mentor semantic tiers (display-only; does not affect the score itself)
  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-mentor-success';
    if (score >= 6) return 'text-primary-600';
    if (score >= 4) return 'text-mentor-warning';
    return 'text-mentor-error';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 8) return 'bg-mentor-mint';
    if (score >= 6) return 'bg-mentor-soft';
    if (score >= 4) return 'bg-amber-50';
    return 'bg-mentor-error/10';
  };

  // Loading State
  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Preparing your report...</p>
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
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Error Loading Report</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">{error || 'Report not found'}</p>
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
              <h1 className="page-title text-2xl mb-2">Interview Performance Report</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-mentor-text-secondary">
                <span>
                  <span className="font-medium text-mentor-text mr-1">Topic:</span> {report.interview.topic}
                </span>
                <span>
                  <span className="font-medium text-mentor-text mr-1">Difficulty:</span> {report.interview.difficulty}
                </span>
                <span>
                  <span className="font-medium text-mentor-text mr-1">Date:</span>{' '}
                  {new Date(report.interview.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <span>
                  <span className="font-medium text-mentor-text mr-1">Questions:</span> {report.questions.length} /{' '}
                  {report.interview.totalQuestions}
                </span>
                <span className="flex items-center">
                  <Languages size={14} className="mr-1.5 text-mentor-text-muted" />
                  <span className="font-medium text-mentor-text mr-1">Language:</span>{' '}
                  {getLanguageByCode(report.interview.interviewLanguage).nativeLabel}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={exportToPDF}
                disabled={exportLoading !== null}
                className="btn btn-primary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {exportLoading === 'pdf' ? 'Downloading...' : 'Download PDF'}
              </button>
              <button
                onClick={exportToCSV}
                disabled={exportLoading !== null}
                className="btn btn-secondary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'csv' ? <Loader2 size={16} className="animate-spin" /> : <Table2 size={16} />}
                {exportLoading === 'csv' ? 'Downloading...' : 'CSV'}
              </button>
              <button
                onClick={exportToJSON}
                disabled={exportLoading !== null}
                className="btn btn-secondary text-sm px-3.5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exportLoading === 'json' ? <Loader2 size={16} className="animate-spin" /> : <Braces size={16} />}
                {exportLoading === 'json' ? 'Downloading...' : 'JSON'}
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
                Question Analysis
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`tab ${activeTab === 'history' ? 'tab-active' : ''}`}
              >
                Progress History
              </button>
        </div>

        <div id="report-content">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Overall Score + Snapshot */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="card lg:col-span-1 flex flex-col items-center justify-center text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-mentor-text-muted mb-2">
                    Overall Score
                  </p>
                  <div className="text-6xl font-bold text-primary-600 tracking-tight">{overallScore.toFixed(1)}</div>
                  <div className="text-sm text-mentor-text-muted mb-4">out of 10.0</div>
                  <div className="w-full h-2 rounded-full bg-mentor-surface overflow-hidden mb-4">
                    <div
                      className="h-full rounded-full bg-primary-600 transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, (overallScore / 10) * 100))}%` }}
                    />
                  </div>
                  <span className={`badge ${getScoreBgColor(overallScore)} ${getScoreColor(overallScore)}`}>
                    {overallScore >= 8 ? 'Excellent Performance' : overallScore >= 6 ? 'Good Performance' : 'Needs Improvement'}
                  </span>
                </div>

                <div className="card lg:col-span-2">
                  <h2 className="section-title text-lg mb-3">Your interview snapshot</h2>
                  {finalReport?.summary ? (
                    <p className="text-sm text-mentor-text-secondary leading-relaxed">{finalReport.summary}</p>
                  ) : (
                    <p className="text-sm text-mentor-text-muted italic">No summary available for this interview.</p>
                  )}
                </div>
              </div>

              {/* Key Dimension Cards */}
              {radarData.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {radarData.map((data, index) => (
                    <ScoreCard key={index} title={data.subject} score={data.score} />
                  ))}
                </div>
              )}

              {/* Radar + Strengths/Improve */}
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
                <div className="card">
                  <h3 className="section-title text-lg mb-4">Performance Radar</h3>
                  <ResponsiveContainer width="100%" height={360}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#DDEBE7" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#50636A', fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#829399' }} />
                      <Radar name="Score" dataKey="score" stroke="#0D9488" fill="#0D9488" fillOpacity={0.25} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                <div className="flex flex-col gap-6">
                  {/* Strengths */}
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 size={18} className="text-mentor-success" />
                      <h3 className="text-sm font-semibold text-mentor-text">Strengths</h3>
                    </div>
                    <ul className="space-y-2">
                      {finalReport?.strengthsOverview && finalReport.strengthsOverview.length > 0 ? (
                        finalReport.strengthsOverview.map((strength: string, index: number) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                            <CheckCircle2 size={14} className="text-mentor-success mt-0.5 shrink-0" />
                            <span>{strength}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-mentor-text-muted italic">No strengths recorded</li>
                      )}
                    </ul>
                  </div>

                  {/* Areas to Improve */}
                  <div className="card">
                    <div className="flex items-center gap-2 mb-3">
                      <Target size={18} className="text-mentor-warning" />
                      <h3 className="text-sm font-semibold text-mentor-text">Areas to Improve</h3>
                    </div>
                    <ul className="space-y-2">
                      {finalReport?.weaknessesOverview && finalReport.weaknessesOverview.length > 0 ? (
                        finalReport.weaknessesOverview.map((weakness: string, index: number) => (
                          <li key={index} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                            <TrendingUp size={14} className="text-mentor-warning mt-0.5 shrink-0" />
                            <span>{weakness}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-sm text-mentor-text-muted italic">No improvement areas recorded</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Recommended Next Steps */}
              {finalReport?.recommendations && finalReport.recommendations.length > 0 && (
                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb size={18} className="text-primary-600" />
                    <h3 className="section-title text-lg">Recommended next steps</h3>
                  </div>
                  <ul className="space-y-2">
                    {finalReport.recommendations.map((suggestion, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                        <span className="text-primary-600 mt-0.5">&rarr;</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Steps (ordered action plan) */}
              {finalReport?.nextSteps && finalReport.nextSteps.length > 0 && (
                <div className="card">
                  <h3 className="section-title text-lg mb-4">Next Steps</h3>
                  <ol className="space-y-3">
                    {finalReport.nextSteps.map((step, index) => (
                      <li key={index} className="flex items-start">
                        <span className="flex-shrink-0 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center text-sm font-semibold mr-3">
                          {index + 1}
                        </span>
                        <span className="text-mentor-text-secondary pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* AI Usage & Cost — secondary technical transparency section */}
              <div className="surface-muted p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu size={16} className="text-mentor-text-muted" />
                  <h3 className="text-sm font-semibold text-mentor-text">AI Usage</h3>
                </div>
                {aiCost ? (
                  <>
                    <p className="helper-text mb-1">Based on actual API usage recorded for this interview.</p>
                    <p className="helper-text mb-4">
                      INR is an approximate reference conversion (1 USD ≈ ₹{USD_TO_INR_RATE}), not a second actual figure — USD is the real billed currency.
                    </p>
                    {!aiCost.pricingComplete && (
                      <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <AlertCircle size={16} className="text-mentor-warning mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">
                          Partial cost — pricing unavailable for one or more model calls. The total below excludes those calls.
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <div className="flex items-center justify-center gap-1">
                          <Coins size={12} className="text-mentor-text-muted" />
                          <p className="stat-tile-value">{formatCostUsd(aiCost.totalCostUsd)}</p>
                        </div>
                        <p className="text-xs text-mentor-text-muted mt-0.5">≈ {formatCostInr(aiCost.totalCostUsd)}</p>
                        <p className="stat-tile-label">AI Cost</p>
                      </div>
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <p className="stat-tile-value">{aiCost.totalTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Total Tokens</p>
                      </div>
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <p className="stat-tile-value">{aiCost.callCount}</p>
                        <p className="stat-tile-label">AI Calls</p>
                      </div>
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <p className="stat-tile-value">{aiCost.inputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Input Tokens</p>
                      </div>
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <p className="stat-tile-value">{aiCost.outputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Output Tokens</p>
                      </div>
                      <div className="stat-tile bg-white dark:bg-future-elevated">
                        <p className="stat-tile-value">{aiCost.cachedInputTokens.toLocaleString()}</p>
                        <p className="stat-tile-label">Cached Input Tokens</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-mentor-text-muted">AI usage was not tracked for this interview.</p>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#DDEBE7" />
                    <XAxis dataKey="question" tick={{ fill: '#50636A' }} />
                    <YAxis domain={[0, 10]} tick={{ fill: '#50636A' }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend />
                    {/* Dynamic bars based on available dimensions */}
                    {(() => {
                      const firstQuestion = report.questions.find(q => q.evaluation);
                      // Restrained teal-family palette — related tones instead of a rainbow.
                      const colors = ['#0D9488', '#5EEAD4', '#0F766E', '#2DD4BF', '#134E4A', '#99F6E4', '#14B8A6'];
                      if (firstQuestion?.evaluation?.dimensions) {
                        // New format - render bars for each dimension
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
                            <Bar dataKey="technical" fill={colors[0]} name="Technical" />
                            <Bar dataKey="communication" fill={colors[1]} name="Communication" />
                            <Bar dataKey="leadership" fill={colors[2]} name="Leadership" />
                            <Bar dataKey="problemSolving" fill={colors[3]} name="Problem Solving" />
                            <Bar dataKey="confidence" fill={colors[4]} name="Confidence" />
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
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <span className="badge badge-info shrink-0">Q{index + 1}</span>
                      {question.evaluation && (
                        <span
                          className={`badge shrink-0 ${getScoreBgColor(
                            question.evaluation.overallScore
                          )} ${getScoreColor(question.evaluation.overallScore)}`}
                        >
                          {question.evaluation.overallScore.toFixed(1)} / 10
                        </span>
                      )}
                    </div>

                    <div className="mb-4 pb-4 border-b border-mentor-border">
                      <p className="text-mentor-text font-medium leading-relaxed">{question.questionText}</p>
                    </div>

                    {question.answerText && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-mentor-text-muted mb-1.5 flex items-center gap-1.5">
                          <MessageSquare size={14} />
                          Your Answer
                        </p>
                        <p className="text-sm text-mentor-text-secondary surface-muted p-3.5 leading-relaxed">
                          {question.answerText}
                        </p>
                      </div>
                    )}

                    {/* Expected Interview Answer - Company Standard */}
                    {hasValidModelAnswer(question.modelAnswer) && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 mb-1.5 flex items-center gap-1.5">
                          <BookOpenCheck size={14} />
                          Expected Interview Answer
                        </p>
                        <div className="bg-mentor-soft border border-primary-100 p-4 rounded-lg">
                          <div className="text-mentor-text-secondary leading-relaxed whitespace-pre-wrap text-sm">
                            {question.modelAnswer}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Points Expected */}
                    {question.expectedPoints && question.expectedPoints.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1.5 flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          Key Points Expected
                        </p>
                        <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-lg">
                          <ul className="space-y-1.5">
                            {question.expectedPoints.map((point, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-mentor-text-secondary">
                                <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                                <span>{point}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {question.evaluation?.pointComparison && question.evaluation.pointComparison.length > 0 && (
                      <div className="mb-4">
                        <p className="font-semibold text-sm text-mentor-text mb-3">How You Performed on Key Points:</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full border border-mentor-border rounded-lg">
                            <thead className="bg-mentor-surface">
                              <tr>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-mentor-text border-b border-mentor-border">Expected Point</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-mentor-text border-b border-mentor-border">Status</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-mentor-text border-b border-mentor-border">Your Evidence</th>
                                <th className="px-4 py-2 text-left text-sm font-semibold text-mentor-text border-b border-mentor-border">How to Improve</th>
                              </tr>
                            </thead>
                            <tbody>
                              {question.evaluation.pointComparison.map((point, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-future-card' : 'bg-mentor-surface/60 dark:bg-future-elevated/60'}>
                                  <td className="px-4 py-3 text-sm text-mentor-text dark:text-future-text border-b border-mentor-border dark:border-future-border">{point.expectedPoint}</td>
                                  <td className="px-4 py-3 text-sm border-b border-mentor-border dark:border-future-border">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                      point.status === 'covered' ? 'bg-mentor-mint text-mentor-success dark:bg-future-success/10 dark:text-future-success' :
                                      point.status === 'partial' ? 'bg-amber-50 text-mentor-warning dark:bg-future-warning/10 dark:text-future-warning' :
                                      point.status === 'missing' ? 'bg-gray-100 text-mentor-text-muted dark:bg-future-elevated dark:text-future-muted' :
                                      'bg-mentor-error/10 text-mentor-error dark:bg-future-error/10 dark:text-future-error'
                                    }`}>
                                      {point.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-mentor-text-secondary dark:text-future-secondary border-b border-mentor-border dark:border-future-border">
                                    {point.candidateEvidence || <span className="italic text-mentor-text-muted dark:text-future-muted">No evidence found</span>}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-mentor-text-secondary border-b border-mentor-border">{point.improvementPoint}</td>
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
                                <div className="text-xl font-bold text-mentor-text">{dim.score.toFixed(1)}</div>
                                <div className="text-xs text-mentor-text-muted mb-1.5">{dim.label}</div>
                                <div className="h-1.5 rounded-full bg-mentor-surface overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-primary-600"
                                    style={{ width: `${Math.min(100, Math.max(0, (dim.score / 10) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            /* Fixed Scores (old format - backward compatibility) */
                            <>
                              {[
                                { label: 'Technical', value: question.evaluation.technicalScore },
                                { label: 'Communication', value: question.evaluation.communicationScore },
                                { label: 'Leadership', value: question.evaluation.leadershipScore },
                                { label: 'Problem Solving', value: question.evaluation.problemSolvingScore },
                                { label: 'Confidence', value: question.evaluation.confidenceScore },
                              ].map(({ label, value }) => (
                                <div key={label} className="text-center">
                                  <div className="text-xl font-bold text-mentor-text">{(value ?? 0).toFixed(1)}</div>
                                  <div className="text-xs text-mentor-text-muted mb-1.5">{label}</div>
                                  <div className="h-1.5 rounded-full bg-mentor-surface overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-primary-600"
                                      style={{ width: `${Math.min(100, Math.max(0, ((value ?? 0) / 10) * 100))}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {question.evaluation.strengths && question.evaluation.strengths.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-mentor-success mb-2 flex items-center gap-1.5">
                                <CheckCircle2 size={16} />
                                What worked well
                              </p>
                              <ul className="text-sm text-mentor-text-secondary space-y-1">
                                {question.evaluation.strengths.map((s, i) => (
                                  <li key={i}>• {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {question.evaluation.weaknesses && question.evaluation.weaknesses.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-mentor-warning mb-2 flex items-center gap-1.5">
                                <Target size={16} />
                                Could be stronger
                              </p>
                              <ul className="text-sm text-mentor-text-secondary space-y-1">
                                {question.evaluation.weaknesses.map((w, i) => (
                                  <li key={i}>• {w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {question.evaluation.suggestions && question.evaluation.suggestions.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-primary-700 mb-2 flex items-center gap-1.5">
                                <Lightbulb size={16} />
                                Suggestions
                              </p>
                              <ul className="text-sm text-mentor-text-secondary space-y-1">
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
                      <div className="mt-4 text-sm text-mentor-text-secondary">
                        <span className="font-semibold text-mentor-text">Duration:</span>{' '}
                        {Math.floor(question.duration / 60)}:{(question.duration % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* AI Usage & Cost Breakdown — secondary technical transparency section */}
              <div className="surface-muted p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Cpu size={16} className="text-mentor-text-muted" />
                  <h3 className="text-sm font-semibold text-mentor-text">AI Usage &amp; Cost Breakdown</h3>
                </div>
                {aiCost ? (
                  <>
                    <p className="helper-text mb-1">Based on actual API usage recorded for this interview.</p>
                    <p className="helper-text mb-4">
                      INR is an approximate reference conversion (1 USD ≈ ₹{USD_TO_INR_RATE}), not a second actual figure — USD is the real billed currency.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-mentor-border text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                            <th className="py-2 pr-4">Operation</th>
                            <th className="py-2 pr-4 text-right">Calls</th>
                            <th className="py-2 pr-4 text-right">Input</th>
                            <th className="py-2 pr-4 text-right">Cached</th>
                            <th className="py-2 pr-4 text-right">Output</th>
                            <th className="py-2 pr-4 text-right">Cost (USD)</th>
                            <th className="py-2 pr-0 text-right">Cost (INR, approx)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-mentor-border">
                          {aiCost.breakdown.map((row) => (
                            <tr key={row.operation}>
                              <td className="py-2 pr-4 text-mentor-text">{row.operation}</td>
                              <td className="py-2 pr-4 text-right text-mentor-text-secondary">{row.callCount}</td>
                              <td className="py-2 pr-4 text-right text-mentor-text-secondary">{row.inputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right text-mentor-text-secondary">{row.cachedInputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right text-mentor-text-secondary">{row.outputTokens.toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right font-medium text-mentor-text">{formatCostUsd(row.costUsd)}</td>
                              <td className="py-2 pr-0 text-right text-mentor-text-muted">{formatCostInr(row.costUsd)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-mentor-border font-semibold text-mentor-text">
                            <td className="py-2 pr-4">TOTAL</td>
                            <td className="py-2 pr-4 text-right">{aiCost.callCount}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.inputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.cachedInputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{aiCost.outputTokens.toLocaleString()}</td>
                            <td className="py-2 pr-4 text-right">{formatCostUsd(aiCost.totalCostUsd)}</td>
                            <td className="py-2 pr-0 text-right text-mentor-text-secondary">{formatCostInr(aiCost.totalCostUsd)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {!aiCost.pricingComplete && (
                      <p className="mt-3 text-xs text-mentor-warning">
                        Partial cost — pricing unavailable for one or more model calls.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-mentor-text-muted">AI usage was not tracked for this interview.</p>
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
                        <CartesianGrid strokeDasharray="3 3" stroke="#DDEBE7" />
                        <XAxis dataKey="date" tick={{ fill: '#50636A' }} />
                        <YAxis domain={[0, 10]} tick={{ fill: '#50636A' }} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="#0D9488"
                          strokeWidth={2}
                          dot={{ fill: '#0D9488', r: 4 }}
                          name="Overall Score"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* History List */}
                  <div className="card">
                    <h3 className="section-title text-lg mb-4">Past Interviews</h3>
                    <div className="divide-y divide-mentor-border">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between py-3.5 px-2 -mx-2 rounded-lg hover:bg-mentor-surface transition-colors cursor-pointer"
                          onClick={() => navigate(`/report/${item.id}`)}
                        >
                          <div>
                            <h4 className="text-sm font-semibold text-mentor-text">{item.topic}</h4>
                            <p className="text-xs text-mentor-text-muted mt-0.5">
                              {item.difficulty} &middot; {item.totalQuestions} questions &middot;{' '}
                              {new Date(item.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            <div className={`text-xl font-bold ${getScoreColor(item.overallScore)}`}>
                              {item.overallScore.toFixed(1)}
                            </div>
                            <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="card p-12 text-center">
                  <TrendingUp className="w-12 h-12 text-mentor-text-muted mx-auto mb-4" strokeWidth={1.5} />
                  <h3 className="section-title mb-1.5">No interview history yet</h3>
                  <p className="text-sm text-mentor-text-secondary mb-6">
                    Complete more interviews to see your progress over time.
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
            <Sparkles size={16} />
            Start New Interview
          </button>
          <button onClick={() => navigate('/history')} className="btn btn-secondary px-6">
            <HistoryIcon size={16} />
            View All History
          </button>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

// Score Card Component — dimension label + score/10 + progress line, no icon/emoji
interface ScoreCardProps {
  title: string;
  score: number;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ title, score }) => {
  const getColorClasses = (score: number) => {
    if (score >= 8) return 'text-mentor-success';
    if (score >= 6) return 'text-primary-600';
    if (score >= 4) return 'text-mentor-warning';
    return 'text-mentor-error';
  };

  return (
    <div className="card-flat text-center">
      <div className="text-xs font-medium text-mentor-text-muted mb-1.5">{title}</div>
      <div className={`text-3xl font-bold ${getColorClasses(score)}`}>{score.toFixed(1)}</div>
      <div className="text-xs text-mentor-text-muted mt-0.5 mb-2">out of 10</div>
      <div className="h-1.5 rounded-full bg-mentor-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-primary-600"
          style={{ width: `${Math.min(100, Math.max(0, (score / 10) * 100))}%` }}
        />
      </div>
    </div>
  );
};

export default ReportDashboard;
