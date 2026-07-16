import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Download,
  Home,
  TrendingUp,
  TrendingDown,
  Award,
  AlertCircle,
  Lightbulb,
  Loader2,
} from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { interviewAPI } from '../services/api';
import { InterviewReport } from '../types';
import toast from 'react-hot-toast';

export default function InterviewReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    if (!id) return;

    setIsLoading(true);
    try {
      const { report: reportData } = await interviewAPI.getReport(id);
      setReport(reportData);
    } catch (error) {
      console.error('Error loading report:', error);
      toast.error('Failed to load report');
      navigate('/history');
    } finally {
      setIsLoading(false);
    }
  };

  const exportReport = () => {
    if (!report) return;

    const data = {
      interview: report.interview,
      questions: report.questions,
      scores: report.averageScores,
      summary: report.summary,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-report-${report.interview.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success('Report exported successfully!');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin mx-auto text-primary-600" size={48} />
          <p className="text-gray-600 dark:text-gray-400">Generating your report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto text-gray-400 mb-4" size={48} />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Report Not Found
        </h2>
        <Link to="/history" className="text-primary-600 hover:underline">
          Go to History
        </Link>
      </div>
    );
  }

  const { interview, questions, averageScores, summary } = report;

  const radarData = [
    { subject: 'Technical', score: averageScores.technical },
    { subject: 'Communication', score: averageScores.communication },
    { subject: 'Leadership', score: averageScores.leadership },
    { subject: 'Problem Solving', score: averageScores.problemSolving },
    { subject: 'Confidence', score: averageScores.confidence },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Interview Report
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {interview.topic} • {interview.difficulty} • {questions.length} Questions
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              {new Date(interview.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <button onClick={exportReport} className="btn btn-secondary flex items-center space-x-2">
            <Download size={20} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Overall Score */}
      <div className="card text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Overall Performance
        </h2>
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="w-32 h-32 rounded-full border-8 border-primary-600 flex items-center justify-center">
              <span className={`text-4xl font-bold ${getScoreColor(averageScores.overall)}`}>
                {averageScores.overall.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-4">out of 10</p>
      </div>

      {/* Score Breakdown */}
      <div className="grid md:grid-cols-5 gap-4">
        <ScoreCard title="Technical" score={averageScores.technical} />
        <ScoreCard title="Communication" score={averageScores.communication} />
        <ScoreCard title="Leadership" score={averageScores.leadership} />
        <ScoreCard title="Problem Solving" score={averageScores.problemSolving} />
        <ScoreCard title="Confidence" score={averageScores.confidence} />
      </div>

      {/* Radar Chart */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Skills Radar
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis domain={[0, 10]} />
            <Radar
              name="Scores"
              dataKey="score"
              stroke="#0284c7"
              fill="#0284c7"
              fillOpacity={0.6}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Strengths */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="text-green-600" size={24} />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Strengths</h2>
        </div>
        <ul className="space-y-2">
          {summary.strengths.slice(0, 5).map((strength, index) => (
            <li key={index} className="flex items-start space-x-2">
              <span className="text-green-600 mt-1">✓</span>
              <span className="text-gray-700 dark:text-gray-300">{strength}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Weaknesses */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <TrendingDown className="text-red-600" size={24} />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Areas for Improvement
          </h2>
        </div>
        <ul className="space-y-2">
          {summary.weaknesses.slice(0, 5).map((weakness, index) => (
            <li key={index} className="flex items-start space-x-2">
              <span className="text-red-600 mt-1">✗</span>
              <span className="text-gray-700 dark:text-gray-300">{weakness}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Improvements */}
      <div className="card">
        <div className="flex items-center space-x-2 mb-4">
          <Lightbulb className="text-yellow-600" size={24} />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Improvement Suggestions
          </h2>
        </div>
        <ul className="space-y-2">
          {summary.improvements.slice(0, 5).map((improvement, index) => (
            <li key={index} className="flex items-start space-x-2">
              <span className="text-yellow-600 mt-1">💡</span>
              <span className="text-gray-700 dark:text-gray-300">{improvement}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex justify-center space-x-4 pb-8">
        <Link to="/" className="btn btn-primary flex items-center space-x-2">
          <Home size={20} />
          <span>Back to Dashboard</span>
        </Link>
        <Link to="/setup" className="btn btn-secondary">
          Start New Interview
        </Link>
      </div>
    </div>
  );
}

function ScoreCard({ title, score }: { title: string; score: number }) {
  const getColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="card text-center">
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{title}</p>
      <div className={`w-16 h-16 rounded-full ${getColor(score)} mx-auto flex items-center justify-center mb-2`}>
        <span className="text-2xl font-bold text-white">{score.toFixed(1)}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
        <div
          className={`${getColor(score)} h-1 rounded-full`}
          style={{ width: `${(score / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}
