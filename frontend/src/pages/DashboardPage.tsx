import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'evaluated':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-blue-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="page-shell">
      <Header />

      <main className="page-container py-8">
        {/* Welcome Section */}
        <div className="page-header">
          <h1 className="page-title">Welcome back, {user?.name?.split(' ')[0]}!</h1>
          <p className="page-subtitle">
            Ready to practice your interview skills? Let's help you prepare for your next opportunity.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="card-flat flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Total Interviews</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalInterviews ?? 0}</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-primary-50 flex items-center justify-center text-xl">📝</div>
          </div>

          <div className="card-flat flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Completed</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.completedInterviews ?? 0}</p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-emerald-50 flex items-center justify-center text-xl">✅</div>
          </div>

          <div className="card-flat flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Average Score</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats?.averageScore ? stats.averageScore.toFixed(1) : '0.0'}
              </p>
            </div>
            <div className="w-11 h-11 rounded-lg bg-amber-50 flex items-center justify-center text-xl">⭐</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => navigate('/setup')}
            className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-6 text-left shadow-card hover:shadow-card-hover transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">🎯</span>
              <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-base font-semibold mb-1">Start New Interview</h3>
            <p className="text-sm text-primary-100">Practice with AI-powered mock interviews</p>
          </button>

          <button
            onClick={() => navigate('/history')}
            className="card-flat text-left hover:border-primary-300 hover:shadow-card transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">📚</span>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">View History</h3>
            <p className="text-sm text-gray-500">Review past interviews and performance</p>
          </button>

          <button
            onClick={() => navigate('/setup')}
            className="card-flat text-left hover:border-primary-300 hover:shadow-card transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-2xl">💡</span>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Practice Topics</h3>
            <p className="text-sm text-gray-500">Choose from various interview topics</p>
          </button>
        </div>

        {/* Recent Interviews */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="section-title">Recent Interviews</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              View All &rarr;
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center">
              <div className="inline-block h-8 w-8 rounded-full border-2 border-gray-200 border-t-primary-600 animate-spin"></div>
              <p className="text-gray-400 text-sm mt-3">Loading...</p>
            </div>
          ) : recentInterviews.length === 0 ? (
            <div className="p-10 text-center">
              <span className="text-4xl mb-3 block">📝</span>
              <h3 className="section-title mb-1.5">No Interviews Yet</h3>
              <p className="text-sm text-gray-500 mb-5">Start your first interview to track your progress</p>
              <button onClick={() => navigate('/setup')} className="btn btn-primary">
                Start Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/report/${interview.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <h3 className="text-sm font-semibold text-gray-900">{interview.topic}</h3>
                        <span className={`badge ${getStatusColor(interview.status)}`}>
                          {interview.status}
                        </span>
                        <span className="text-xs text-gray-400">{interview.difficulty}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{interview.answeredQuestions}/{interview.totalQuestions} questions</span>
                        <span>&middot;</span>
                        <span>{new Date(interview.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {interview.overallScore !== undefined && (
                      <div className="text-right ml-4 shrink-0">
                        <div className={`text-xl font-bold ${getScoreColor(interview.overallScore)}`}>
                          {interview.overallScore.toFixed(1)}
                        </div>
                        <div className="text-[11px] text-gray-400">/ 10.0</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="mt-6 surface-muted p-6">
          <h3 className="section-title mb-3">Interview Tips</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-primary-600 mt-0.5">✓</span>
              <span>Practice regularly to improve your communication skills</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600 mt-0.5">✓</span>
              <span>Review your feedback to identify areas for improvement</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-600 mt-0.5">✓</span>
              <span>Try different difficulty levels to challenge yourself</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
