import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalInterviews: number;
  completedInterviews: number;
  evaluatedInterviews: number;
  averageScore: number;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  isActive: boolean;
  createdAt: string;
  stats?: {
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
  };
}

interface Interview {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  totalQuestions: number;
  overallScore: number;
  userName: string;
  userEmail: string;
  createdAt: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token, isAdmin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users' | 'interviews' | 'analytics'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Dashboard data
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topicStats, setTopicStats] = useState<Array<{ topic: string; count: number }>>([]);
  const [recentInterviews, setRecentInterviews] = useState<any[]>([]);

  // Users data
  const [users, setUsers] = useState<User[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');

  // Interviews data
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsPage, setInterviewsPage] = useState(1);
  const [interviewsTotal, setInterviewsTotal] = useState(0);

  // Analytics data
  const [interviewTrend, setInterviewTrend] = useState<any[]>([]);
  const [scoresByDifficulty, setScoresByDifficulty] = useState<any[]>([]);

  // Redirect if not admin
  useEffect(() => {
    if (!isAdmin) {
      navigate('/setup');
    }
  }, [isAdmin, navigate]);

  // Fetch dashboard data
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboard();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'interviews') {
      fetchInterviews();
    } else if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, usersPage, usersSearch, interviewsPage]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data.data.stats);
      setTopicStats(response.data.data.topicStats);
      setRecentInterviews(response.data.data.recentInterviews);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/admin/users?page=${usersPage}&limit=10${usersSearch ? `&search=${usersSearch}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers(response.data.data.users);
      setUsersTotal(response.data.data.pagination.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/admin/interviews?page=${interviewsPage}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInterviews(response.data.data.interviews);
      setInterviewsTotal(response.data.data.pagination.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load interviews');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInterviewTrend(response.data.data.interviewTrend);
      setScoresByDifficulty(response.data.data.scoresByDifficulty);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This will also delete all their interviews.')) {
      return;
    }
    try {
      await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const toggleUserActive = async (userId: string, isActive: boolean) => {
    try {
      await axios.put(
        `${API_BASE_URL}/admin/users/${userId}`,
        { isActive: !isActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update user');
    }
  };

  const deleteInterview = async (interviewId: string) => {
    if (!confirm('Are you sure you want to delete this interview?')) {
      return;
    }
    try {
      await axios.delete(`${API_BASE_URL}/admin/interviews/${interviewId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchInterviews();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete interview');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => navigate('/setup')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              User View
            </button>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {['dashboard', 'users', 'interviews', 'analytics'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`${
                  activeTab === tab
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && stats && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <StatCard title="Total Users" value={stats.totalUsers} icon="👥" />
                  <StatCard title="Active Users" value={stats.activeUsers} icon="✅" />
                  <StatCard title="Total Interviews" value={stats.totalInterviews} icon="📝" />
                  <StatCard title="Completed" value={stats.completedInterviews} icon="✔️" />
                  <StatCard title="Evaluated" value={stats.evaluatedInterviews} icon="📊" />
                  <StatCard title="Avg Score" value={stats.averageScore.toFixed(2)} icon="⭐" />
                </div>

                {/* Popular Topics */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">Popular Topics</h3>
                  <div className="space-y-2">
                    {topicStats.map((topic, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-gray-700">{topic.topic}</span>
                        <span className="text-gray-500">{topic.count} interviews</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Interviews */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold">Recent Interviews</h3>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Topic</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentInterviews.map((interview) => (
                        <tr key={interview.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{interview.topic}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{interview.userName}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              interview.status === 'evaluated' ? 'bg-green-100 text-green-800' :
                              interview.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {interview.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(interview.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <div className="text-sm text-gray-600">Total: {usersTotal} users</div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user._id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                            <button
                              onClick={() => toggleUserActive(user._id, user.isActive)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => deleteUser(user._id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setUsersPage(p => Math.max(1, p - 1))}
                    disabled={usersPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {usersPage} of {Math.ceil(usersTotal / 10)}</span>
                  <button
                    onClick={() => setUsersPage(p => p + 1)}
                    disabled={usersPage >= Math.ceil(usersTotal / 10)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Interviews Tab */}
            {activeTab === 'interviews' && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">Total: {interviewsTotal} interviews</div>

                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Topic</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Difficulty</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {interviews.map((interview) => (
                        <tr key={interview.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{interview.topic}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{interview.userName}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{interview.difficulty}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              interview.status === 'evaluated' ? 'bg-green-100 text-green-800' :
                              interview.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {interview.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {interview.overallScore ? interview.overallScore.toFixed(2) : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => navigate(`/report/${interview.id}`)}
                              className="text-indigo-600 hover:text-indigo-900 mr-2"
                            >
                              View
                            </button>
                            <button
                              onClick={() => deleteInterview(interview.id)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setInterviewsPage(p => Math.max(1, p - 1))}
                    disabled={interviewsPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {interviewsPage} of {Math.ceil(interviewsTotal / 10)}</span>
                  <button
                    onClick={() => setInterviewsPage(p => p + 1)}
                    disabled={interviewsPage >= Math.ceil(interviewsTotal / 10)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                {/* Interview Trend */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">Interview Trend (Last 30 Days)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={interviewTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="count" stroke="#4F46E5" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Scores by Difficulty */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold mb-4">Average Scores by Difficulty</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={scoresByDifficulty}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="_id" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="averageScore" fill="#4F46E5" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: number | string; icon: string }> = ({ title, value, icon }) => (
  <div className="bg-white rounded-lg shadow p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
      <div className="text-4xl">{icon}</div>
    </div>
  </div>
);

export default AdminDashboard;
