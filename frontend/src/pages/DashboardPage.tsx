import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';
import {
  MessagesSquare,
  CheckCircle2,
  Gauge,
  Trophy,
  Sparkles,
  ArrowRight,
  ChevronRight,
  History,
  Plus,
  ClipboardCheck,
} from 'lucide-react';

interface RecentInterview {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  overallScore?: number;
  totalQuestions: number;
  answeredQuestions: number;
  createdAt: string;
}

interface UserStats {
  totalInterviews: number;
  completedInterviews: number;
  averageScore: number;
  highestScore: number;
  lastInterviewScore: number;
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [recentInterviews, setRecentInterviews] = useState<RecentInterview[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [interviewsResponse, statsResponse] = await Promise.all([
        axios.get(
          `${API_BASE_URL}/interview/history?page=1&limit=5`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        axios.get(
          `${API_BASE_URL}/interview/stats`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      setRecentInterviews(interviewsResponse.data.data.interviews);
      setStats(statsResponse.data.data.stats);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'evaluated':
        return 'badge-success';
      case 'completed':
        return 'badge-info';
      case 'in-progress':
        return 'badge-warning';
      default:
        return 'badge-neutral';
    }
  };

  const getScoreColorClass = (score: number) => {
    if (score >= 8) return 'text-mentor-success';
    if (score >= 6) return 'text-primary-600';
    if (score >= 4) return 'text-mentor-warning';
    return 'text-mentor-error';
  };

  const hasProgress = !!stats && stats.averageScore > 0;
  const hasCompletedInterview = !!stats && stats.completedInterviews > 0;

  const statCards = [
    { label: 'Total Interviews', value: String(stats?.totalInterviews ?? 0), icon: MessagesSquare, iconBg: 'bg-mentor-aqua' },
    { label: 'Completed', value: String(stats?.completedInterviews ?? 0), icon: CheckCircle2, iconBg: 'bg-mentor-mint' },
    { label: 'Average Score', value: (stats?.averageScore ?? 0).toFixed(1), icon: Gauge, iconBg: 'bg-mentor-soft' },
    { label: 'Highest Score', value: (stats?.highestScore ?? 0).toFixed(1), icon: Trophy, iconBg: 'bg-amber-50' },
  ];

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        {/* Welcome Section */}
        <div className="page-header">
          <h1 className="page-title">Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="page-subtitle">Let's keep building your interview confidence.</p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button onClick={() => navigate('/setup')} className="btn btn-secondary">
            <Plus size={16} />
            New Interview
          </button>
          <button onClick={() => navigate('/history')} className="btn btn-secondary">
            <History size={16} />
            View History
          </button>
        </div>

        {/* Progress + AI Coach */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Preparation Score */}
          <div className="card lg:col-span-2">
            <h2 className="section-title mb-4">Preparation Score</h2>

            {hasProgress && stats ? (
              <>
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-4xl font-bold text-mentor-text">{stats.averageScore.toFixed(1)}</span>
                  <span className="text-sm text-mentor-text-muted">/ 10</span>
                </div>

                <div className="h-2.5 rounded-full bg-mentor-surface overflow-hidden mb-6">
                  <div
                    className="h-full rounded-full bg-primary-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, (stats.averageScore / 10) * 100))}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-mentor-border">
                  <div>
                    <p className="text-xs text-mentor-text-muted mb-1">Completed</p>
                    <p className="text-lg font-semibold text-mentor-text">{stats.completedInterviews}</p>
                  </div>
                  <div>
                    <p className="text-xs text-mentor-text-muted mb-1">Highest Score</p>
                    <p className="text-lg font-semibold text-mentor-text">{stats.highestScore.toFixed(1)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-mentor-text-muted mb-1">Last Score</p>
                    <p className="text-lg font-semibold text-mentor-text">{stats.lastInterviewScore.toFixed(1)}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-4">
                <p className="text-sm text-mentor-text-secondary">
                  Complete your first interview to start tracking progress.
                </p>
              </div>
            )}
          </div>

          {/* AI Coach / Next Action */}
          <div className="card bg-mentor-mint lg:col-span-1 flex flex-col">
            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center mb-4">
              <Sparkles size={20} className="text-primary-600" />
            </div>
            <h3 className="section-title mb-1.5">
              {hasCompletedInterview ? 'Keep your momentum going' : 'Start your first practice interview'}
            </h3>
            <p className="text-sm text-mentor-text-secondary mb-4 flex-1">
              {hasCompletedInterview
                ? 'Review your latest feedback or start another practice session.'
                : 'Choose a role or topic and get personalized feedback.'}
            </p>
            {hasCompletedInterview && stats && stats.lastInterviewScore > 0 && (
              <p className="text-xs text-mentor-text-muted mb-4">
                Last score: {stats.lastInterviewScore.toFixed(1)} / 10
              </p>
            )}
            <button onClick={() => navigate('/setup')} className="btn btn-primary w-full justify-center">
              {hasCompletedInterview ? 'Practice Again' : 'Start Interview'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map(({ label, value, icon: Icon, iconBg }) => (
            <div key={label} className="card-flat flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-mentor-text-muted mb-1">{label}</p>
                <p className="text-2xl font-bold text-mentor-text">{value}</p>
              </div>
              <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon size={20} className="text-primary-600" />
              </div>
            </div>
          ))}
        </div>

        {/* Recent Interviews */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-mentor-border flex items-center justify-between">
            <h2 className="section-title">Recent Interviews</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View All
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center">
              <div className="inline-block h-8 w-8 rounded-full border-2 border-mentor-border border-t-primary-600 animate-spin"></div>
              <p className="text-mentor-text-muted text-sm mt-3">Loading...</p>
            </div>
          ) : recentInterviews.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
                <MessagesSquare size={22} className="text-primary-600" />
              </div>
              <h3 className="section-title mb-1.5">No interviews yet</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">
                Start your first mock interview and begin tracking your progress.
              </p>
              <button onClick={() => navigate('/setup')} className="btn btn-primary">
                Start Interview
              </button>
            </div>
          ) : (
            <div className="divide-y divide-mentor-border">
              {recentInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-mentor-surface cursor-pointer transition-colors"
                  onClick={() => navigate(`/report/${interview.id}`)}
                >
                  <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                    <ClipboardCheck size={18} className="text-primary-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-mentor-text truncate">{interview.topic}</h3>
                      <span className={`badge ${getStatusBadgeClass(interview.status)}`}>{interview.status}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-mentor-text-muted flex-wrap">
                      <span className="capitalize">{interview.difficulty}</span>
                      <span>&middot;</span>
                      <span>{interview.answeredQuestions}/{interview.totalQuestions} questions</span>
                      <span>&middot;</span>
                      <span>{new Date(interview.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {interview.overallScore !== undefined && (
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${getScoreColorClass(interview.overallScore)}`}>
                        {interview.overallScore.toFixed(1)}
                      </div>
                      <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                    </div>
                  )}

                  <ChevronRight size={18} className="text-mentor-text-muted shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="mt-6 surface-muted p-6">
          <h3 className="section-title mb-3">Small habits, better interviews</h3>
          <ul className="space-y-2.5 text-sm text-mentor-text-secondary">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-primary-600 mt-0.5 shrink-0" />
              <span>Practice regularly to improve your communication skills</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-primary-600 mt-0.5 shrink-0" />
              <span>Review your feedback to identify areas for improvement</span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 size={16} className="text-primary-600 mt-0.5 shrink-0" />
              <span>Try different difficulty levels to challenge yourself</span>
            </li>
          </ul>
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default DashboardPage;
