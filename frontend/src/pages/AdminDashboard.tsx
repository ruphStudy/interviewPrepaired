import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';
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

interface PaymentOrder {
  id: string;
  userId: string;
  userEmail?: string;
  purchaseType: string;
  planCode?: string;
  creditPackCode?: string;
  amountPaise: number;
  currency: string;
  status: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  failureCode?: string;
  createdAt: string;
  paidAt?: string;
  refundedAt?: string;
  refundedAmountPaise?: number;
}

interface OperationalJob {
  id: string;
  jobType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  failureCode?: string;
  failureMessage?: string;
  manualRetryCount: number;
  createdAt: string;
}

interface PrivacyAuditEntry {
  action: string;
  actorUserId?: string;
  subjectUserId?: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
  failureCode?: string;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { token, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'users' | 'interviews' | 'analytics' | 'payments' | 'jobs' | 'privacy'
  >('dashboard');
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

  // Payment orders data (PR-BILL-8 — support troubleshooting: stuck/failed payments, refunds)
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrder[]>([]);
  const [paymentOrdersPage, setPaymentOrdersPage] = useState(1);
  const [paymentOrdersTotal, setPaymentOrdersTotal] = useState(0);
  const [paymentOrdersStatus, setPaymentOrdersStatus] = useState('');

  // Operational jobs data (PR-OPS-1/2 — support/ops visibility into dead-lettered/failed jobs)
  const [operationalJobs, setOperationalJobs] = useState<OperationalJob[]>([]);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsStatus, setJobsStatus] = useState('');

  // Privacy audit data (PR-PRIVACY-5 — read-only trail for support tickets)
  const [privacyAudit, setPrivacyAudit] = useState<PrivacyAuditEntry[]>([]);
  const [privacyPage, setPrivacyPage] = useState(1);
  const [privacyTotal, setPrivacyTotal] = useState(0);

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
    } else if (activeTab === 'payments') {
      fetchPaymentOrders();
    } else if (activeTab === 'jobs') {
      fetchOperationalJobs();
    } else if (activeTab === 'privacy') {
      fetchPrivacyAudit();
    }
  }, [
    activeTab,
    usersPage,
    usersSearch,
    interviewsPage,
    paymentOrdersPage,
    paymentOrdersStatus,
    jobsPage,
    jobsStatus,
    privacyPage,
  ]);

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

  const fetchPaymentOrders = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/admin/payment-orders?page=${paymentOrdersPage}&limit=10${
          paymentOrdersStatus ? `&status=${paymentOrdersStatus}` : ''
        }`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPaymentOrders(response.data.data.orders);
      setPaymentOrdersTotal(response.data.data.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payment orders');
    } finally {
      setLoading(false);
    }
  };

  const reconcilePaymentOrder = async (orderId: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/payment-orders/${orderId}/reconcile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(`Reconciliation result:\n${JSON.stringify(response.data.data, null, 2)}`);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reconcile payment order');
    }
  };

  const refundPaymentOrder = async (order: PaymentOrder) => {
    const reason = window.prompt(
      `Refund reason for order ${order.id} (₹${(order.amountPaise / 100).toFixed(2)}):`
    );
    if (!reason) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/payment-orders/${order.id}/refund`,
        { reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPaymentOrders();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to refund payment order');
    }
  };

  const fetchOperationalJobs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/admin/operational-jobs?page=${jobsPage}&limit=10${
          jobsStatus ? `&status=${jobsStatus}` : ''
        }`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setOperationalJobs(response.data.data.jobs);
      setJobsTotal(response.data.data.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load operational jobs');
    } finally {
      setLoading(false);
    }
  };

  const retryOperationalJob = async (jobId: string) => {
    if (!confirm('Retry this job now?')) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/operational-jobs/${jobId}/retry`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchOperationalJobs();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to retry job');
    }
  };

  const fetchPrivacyAudit = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/privacy-audit?page=${privacyPage}&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPrivacyAudit(response.data.data.entries);
      setPrivacyTotal(response.data.data.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load privacy audit trail');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (
      !confirm(
        'Delete this user? Access is revoked immediately and personal data (name/email/interviews) is anonymized and cleaned up shortly after. Billing history is preserved. This cannot be undone.'
      )
    ) {
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
    <AuthenticatedLayout>
      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {['dashboard', 'users', 'interviews', 'analytics', 'payments', 'jobs', 'privacy'].map((tab) => (
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

            {/* Payment Orders Tab (PR-BILL-8) — troubleshoot stuck/failed payments, refund */}
            {activeTab === 'payments' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <select
                    value={paymentOrdersStatus}
                    onChange={(e) => {
                      setPaymentOrdersPage(1);
                      setPaymentOrdersStatus(e.target.value);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All statuses</option>
                    <option value="created">created</option>
                    <option value="provider_created">provider_created</option>
                    <option value="payment_pending">payment_pending</option>
                    <option value="paid">paid</option>
                    <option value="failed">failed</option>
                    <option value="cancelled">cancelled</option>
                    <option value="expired">expired</option>
                    <option value="refunded">refunded</option>
                    <option value="partially_refunded">partially_refunded</option>
                  </select>
                  <div className="text-sm text-gray-600">Total: {paymentOrdersTotal} orders</div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paymentOrders.map((order) => (
                        <tr key={order.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{order.userEmail || order.userId}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{order.planCode || order.creditPackCode || order.purchaseType}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {(order.amountPaise / 100).toFixed(2)} {order.currency}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              order.status === 'paid' ? 'bg-green-100 text-green-800' :
                              order.status === 'failed' ? 'bg-red-100 text-red-800' :
                              order.status.includes('refund') ? 'bg-purple-100 text-purple-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                            <button
                              onClick={() => reconcilePaymentOrder(order.id)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Reconcile
                            </button>
                            {order.status === 'paid' && (
                              <button
                                onClick={() => refundPaymentOrder(order)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setPaymentOrdersPage(p => Math.max(1, p - 1))}
                    disabled={paymentOrdersPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {paymentOrdersPage} of {Math.max(1, Math.ceil(paymentOrdersTotal / 10))}</span>
                  <button
                    onClick={() => setPaymentOrdersPage(p => p + 1)}
                    disabled={paymentOrdersPage >= Math.ceil(paymentOrdersTotal / 10)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Operational Jobs Tab (PR-OPS-1/2) — dead-lettered/failed async job visibility + manual retry */}
            {activeTab === 'jobs' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <select
                    value={jobsStatus}
                    onChange={(e) => {
                      setJobsPage(1);
                      setJobsStatus(e.target.value);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All statuses</option>
                    <option value="pending">pending</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                    <option value="dead_letter">dead_letter</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                  <div className="text-sm text-gray-600">Total: {jobsTotal} jobs</div>
                </div>

                <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Failure</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {operationalJobs.map((job) => (
                        <tr key={job.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{job.jobType}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              job.status === 'completed' ? 'bg-green-100 text-green-800' :
                              job.status === 'dead_letter' ? 'bg-red-100 text-red-800' :
                              job.status === 'active' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{job.attemptCount}/{job.maxAttempts}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{job.failureCode || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {(job.status === 'dead_letter' || job.status === 'pending') && (
                              <button
                                onClick={() => retryOperationalJob(job.id)}
                                className="text-indigo-600 hover:text-indigo-900"
                              >
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setJobsPage(p => Math.max(1, p - 1))}
                    disabled={jobsPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {jobsPage} of {Math.max(1, Math.ceil(jobsTotal / 10))}</span>
                  <button
                    onClick={() => setJobsPage(p => p + 1)}
                    disabled={jobsPage >= Math.ceil(jobsTotal / 10)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Privacy Audit Tab (PR-PRIVACY-5) — read-only trail for support tickets / deletion proof */}
            {activeTab === 'privacy' && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">Total: {privacyTotal} entries</div>

                <div className="bg-white rounded-lg shadow overflow-hidden overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {privacyAudit.map((entry, idx) => (
                        <tr key={idx}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{entry.action}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.actorUserId || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.subjectUserId || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              entry.status === 'completed' ? 'bg-green-100 text-green-800' :
                              entry.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {entry.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(entry.requestedAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setPrivacyPage(p => Math.max(1, p - 1))}
                    disabled={privacyPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {privacyPage} of {Math.max(1, Math.ceil(privacyTotal / 10))}</span>
                  <button
                    onClick={() => setPrivacyPage(p => p + 1)}
                    disabled={privacyPage >= Math.ceil(privacyTotal / 10)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AuthenticatedLayout>
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
