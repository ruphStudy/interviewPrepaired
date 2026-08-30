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
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p className="text-gray-600 mt-2">
            Ready to practice your interview skills? Let's help you prepare for your next opportunity.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Interviews</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.totalInterviews ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">📝</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Completed</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.completedInterviews ?? 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Average Score</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.averageScore ? stats.averageScore.toFixed(1) : '0.0'}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <span className="text-2xl">⭐</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <button
            onClick={() => navigate('/setup')}
            className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl">🎯</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Start New Interview</h3>
            <p className="text-sm text-indigo-100">
              Practice with AI-powered mock interviews
            </p>
          </button>

          <button
            onClick={() => navigate('/history')}
            className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-lg transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl">📚</span>
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">View History</h3>
            <p className="text-sm text-gray-600">
              Review past interviews and performance
            </p>
          </button>

          <button
            onClick={() => navigate('/setup')}
            className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-indigo-300 hover:shadow-lg transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-3xl">💡</span>
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Practice Topics</h3>
            <p className="text-sm text-gray-600">
              Choose from various interview topics
            </p>
          </button>
        </div>

        {/* Recent Interviews */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Recent Interviews</h2>
            <button
              onClick={() => navigate('/history')}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View All →
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="text-gray-500 mt-2">Loading...</p>
            </div>
          ) : recentInterviews.length === 0 ? (
            <div className="p-8 text-center">
              <span className="text-6xl mb-4 block">📝</span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Interviews Yet</h3>
              <p className="text-gray-600 mb-4">
                Start your first interview to track your progress
              </p>
              <button
                onClick={() => navigate('/setup')}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Start Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {recentInterviews.map((interview) => (
                <div
                  key={interview.id}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/report/${interview.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {interview.topic}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            interview.status
                          )}`}
                        >
                          {interview.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {interview.difficulty}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>
                          📝 {interview.answeredQuestions}/{interview.totalQuestions} questions
                        </span>
                        <span>
                          📅 {new Date(interview.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {interview.overallScore !== undefined && (
                      <div className="text-right ml-4">
                        <div
                          className={`text-3xl font-bold ${getScoreColor(interview.overallScore)}`}
                        >
                          {interview.overallScore.toFixed(1)}
                        </div>
                        <div className="text-sm text-gray-500">/ 10.0</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div className="mt-8 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
          <h3 className="text-lg font-bold text-gray-900 mb-3">💡 Interview Tips</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Practice regularly to improve your communication skills</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Review your feedback to identify areas for improvement</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>Try different difficulty levels to challenge yourself</span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default DashboardPage;
