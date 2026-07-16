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
import Header from '../components/Header';
import { interviewApi, InterviewReport } from '../api/interviewApi';

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
      
      const avgTechnical = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).technicalScore || 0), 0) / count;
      const avgCommunication = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).communicationScore || 0), 0) / count;
      const avgLeadership = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).leadershipScore || 0), 0) / count;
      const avgProblemSolving = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).problemSolvingScore || 0), 0) / count;
      const avgConfidence = evaluations.reduce((sum, q) => sum + ((q.evaluation as any).confidenceScore || 0), 0) / count;
      
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
        overall: q.evaluation?.overallScore || 0,
      };

      // Check if we have dynamic dimensions (new format)
      if (q.evaluation?.dimensions) {
        q.evaluation.dimensions.forEach((dim: any) => {
          chartData[dim.name] = dim.score;
        });
      } else {
        // Fallback to old fixed format
        chartData.technical = q.evaluation?.technicalScore || 0;
        chartData.communication = q.evaluation?.communicationScore || 0;
        chartData.leadership = q.evaluation?.leadershipScore || 0;
        chartData.problemSolving = q.evaluation?.problemSolvingScore || 0;
        chartData.confidence = q.evaluation?.confidenceScore || 0;
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
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1'}/interview/report/${interviewId}/pdf`,
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
            row.push(dim.score || 0);
          });
        } else {
          // Old format
          row.push(
            q.evaluation?.technicalScore || 0,
            q.evaluation?.communicationScore || 0,
            q.evaluation?.leadershipScore || 0,
            q.evaluation?.problemSolvingScore || 0,
            q.evaluation?.confidenceScore || 0
          );
        }

        row.push(q.evaluation?.overallScore || 0);
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading report...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="text-center">
              <svg
                className="w-16 h-16 text-red-500 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Report</h2>
            <p className="text-gray-600 mb-6">{error || 'Report not found'}</p>
            <button
              onClick={() => navigate('/setup')}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
            >
              Start New Interview
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  const radarData = getRadarChartData();
  const barData = getBarChartData();
  const historyData = getHistoryChartData();
  const finalReport = report.finalReport;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Report</h1>
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path
                      fillRule="evenodd"
                      d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-semibold mr-1">Topic:</span> {report.interview.topic}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-semibold mr-1">Difficulty:</span> {report.interview.difficulty}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-semibold mr-1">Date:</span>{' '}
                  {new Date(report.interview.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <span className="flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-semibold mr-1">Questions:</span> {report.questions.length} / {report.interview.totalQuestions}
                </span>
              </div>
            </div>
            <div className="mt-4 md:mt-0 flex flex-wrap gap-3">
              <button
                onClick={exportToPDF}
                disabled={exportLoading !== null}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {exportLoading === 'pdf' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                ) : (
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
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
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {exportLoading === 'csv' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                ) : (
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
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
                className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {exportLoading === 'json' ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                ) : (
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
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
        <div className="bg-white rounded-lg shadow-lg mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('details')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'details'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Detailed Analysis
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                  activeTab === 'history'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                History
              </button>
            </nav>
          </div>
        </div>

        <div id="report-content">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Overall Score Card */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg shadow-lg p-8 text-white">
                <div className="text-center">
                  <h2 className="text-lg font-semibold mb-2 opacity-90">Overall Score</h2>
                  <div className="text-7xl font-bold mb-2">
                    {finalReport?.overallScore?.toFixed(1) || '0.0'}
                  </div>
                  <div className="text-2xl opacity-90">out of 10.0</div>
                  <div className="mt-4 inline-block px-6 py-2 bg-white bg-opacity-20 rounded-full text-sm font-semibold">
                    {finalReport?.overallScore && finalReport.overallScore >= 8
                      ? 'Excellent Performance'
                      : finalReport?.overallScore && finalReport.overallScore >= 6
                      ? 'Good Performance'
                      : 'Needs Improvement'}
                  </div>
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
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Performance Radar</h3>
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
                <div className="bg-white rounded-lg shadow-lg p-6">
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
                <div className="bg-white rounded-lg shadow-lg p-6">
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
                <div className="bg-white rounded-lg shadow-lg p-6">
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
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Summary</h3>
                  <p className="text-gray-700 leading-relaxed">{finalReport.summary}</p>
                </div>
              )}

              {/* Next Steps */}
              {finalReport?.nextSteps && finalReport.nextSteps.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Next Steps</h3>
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
            </div>
          )}

          {/* Detailed Analysis Tab */}
          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Per Question Bar Chart */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Scores by Question</h3>
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
                <h3 className="text-xl font-bold text-gray-900">Question-by-Question Analysis</h3>
                {report.questions.map((question, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-lg p-6">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="text-lg font-bold text-gray-900">Question {index + 1}</h4>
                      {question.evaluation && (
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreBgColor(
                            question.evaluation.overallScore
                          )} ${getScoreColor(question.evaluation.overallScore)}`}
                        >
                          {question.evaluation.overallScore.toFixed(1)} / 10
                        </span>
                      )}
                    </div>

                    <div className="mb-4">
                      <p className="font-semibold text-gray-700 mb-2">Question:</p>
                      <p className="text-gray-600">{question.questionText}</p>
                    </div>

                    {question.answerText && (
                      <div className="mb-4">
                        <p className="font-semibold text-gray-700 mb-2">Your Answer:</p>
                        <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">
                          {question.answerText}
                        </p>
                      </div>
                    )}

                    {/* Model/Expected Answer - Show complete ideal answer */}
                    {question.modelAnswer && (
                      <div className="mb-4">
                        <p className="font-semibold text-gray-700 mb-2 flex items-center">
                          <svg className="w-5 h-5 mr-2 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                            <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                          </svg>
                          Expected Answer (Model Response):
                        </p>
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                          <p className="text-sm text-blue-800 mb-2 font-semibold italic">
                            📚 This is what an ideal answer would look like:
                          </p>
                          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {question.modelAnswer}
                          </p>
                        </div>
                      </div>
                    )}

                    {question.expectedPoints && question.expectedPoints.length > 0 && (
                      <div className="mb-4">
                        <p className="font-semibold text-gray-700 mb-2 flex items-center">
                          <svg className="w-5 h-5 mr-1 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                              clipRule="evenodd"
                            />
                          </svg>
                          Key Points to Cover:
                        </p>
                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                          <p className="text-sm text-green-800 mb-2 italic">
                            These are the important points a strong answer should include:
                          </p>
                          <ul className="space-y-2">
                            {question.expectedPoints.map((point, i) => (
                              <li key={i} className="flex items-start text-gray-700">
                                <svg
                                  className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600"
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
                                  {(question.evaluation.technicalScore || 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Technical</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.communicationScore || 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Communication</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.leadershipScore || 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Leadership</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.problemSolvingScore || 0).toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-600">Problem Solving</div>
                              </div>
                              <div className="text-center">
                                <div className="text-2xl font-bold text-gray-900">
                                  {(question.evaluation.confidenceScore || 0).toFixed(1)}
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
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {historyData.length > 0 ? (
                <>
                  {/* History Line Chart */}
                  <div className="bg-white rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Score Progression</h3>
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
                  <div className="bg-white rounded-lg shadow-lg p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Past Interviews</h3>
                    <div className="space-y-4">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition cursor-pointer"
                          onClick={() => navigate(`/report/${item.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{item.topic}</h4>
                              <p className="text-sm text-gray-600">
                                {item.difficulty} • {item.totalQuestions} questions
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`text-2xl font-bold ${getScoreColor(
                                  item.overallScore
                                )}`}
                              >
                                {item.overallScore.toFixed(1)}
                              </div>
                              <div className="text-xs text-gray-600">/ 10.0</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-lg shadow-lg p-12 text-center">
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
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No History Yet</h3>
                  <p className="text-gray-600 mb-6">
                    Complete more interviews to see your progress over time
                  </p>
                  <button
                    onClick={() => navigate('/setup')}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
                  >
                    Start New Interview
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => navigate('/setup')}
            className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
                clipRule="evenodd"
              />
            </svg>
            Start New Interview
          </button>
          <button
            onClick={() => navigate('/history')}
            className="flex items-center justify-center px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
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
      </div>
    </div>
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
    if (score >= 8) return 'from-green-500 to-green-700';
    if (score >= 6) return 'from-yellow-500 to-yellow-700';
    return 'from-red-500 to-red-700';
  };

  return (
    <div className={`bg-gradient-to-br ${getColorClasses(score)} rounded-lg shadow-lg p-6 text-white`}>
      <div className="text-center">
        <div className="text-3xl mb-2">{icon}</div>
        <div className="text-sm font-semibold mb-2 opacity-90">{title}</div>
        <div className="text-4xl font-bold">{score.toFixed(1)}</div>
        <div className="text-xs opacity-75 mt-1">out of 10</div>
      </div>
    </div>
  );
};

export default ReportDashboard;
