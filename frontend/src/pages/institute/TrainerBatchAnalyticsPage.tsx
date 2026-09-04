import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { TrainerBatchAnalytics, InstituteBatch } from '../../api/instituteApi';
import { AlertCircle, Loader2, ArrowLeft, Target, Gauge } from 'lucide-react';

const getScoreColorClass = (score: number | null) => {
  if (score === null) return 'text-mentor-text-muted';
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

/**
 * Trainer-scoped batch analytics — assignment-status and score aggregation
 * only, exactly as the backend computed it. No chart package: cards + a
 * simple table, per task rules.
 */
const TrainerBatchAnalyticsPage: React.FC = () => {
  const { organizationId, batchId } = useParams<{ organizationId: string; batchId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    activeRole,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [batch, setBatch] = useState<InstituteBatch | null>(null);
  const [analytics, setAnalytics] = useState<TrainerBatchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const isTrainer = activeRole === 'trainer';
  const canView = hasPermission('analytics:view');

  const fetchAnalytics = useCallback(async () => {
    if (!organizationId || !batchId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.getTrainerBatchAnalytics(organizationId, batchId);
      setAnalytics(response.data);
      // Best-effort display name only — batchId is already confirmed in
      // scope by the analytics call above (same 404-on-out-of-scope gate).
      try {
        const batchResponse = await instituteApi.getBatch(organizationId, batchId);
        setBatch(batchResponse.data.batch);
      } catch {
        // Non-fatal — the page still renders with the batchId as a fallback label.
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load batch analytics');
    } finally {
      setLoading(false);
    }
  }, [organizationId, batchId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && isTrainer && canView) {
      fetchAnalytics();
    }
  }, [isSyncing, activeOrganization, isTrainer, canView, fetchAnalytics]);

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading organization...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (contextError || !activeOrganization) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Couldn't load organization</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">
              {contextError || "You don't have access to this organization, or it no longer exists."}
            </p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (activeOrganization.type !== 'institute') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">The trainer portal is only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!isTrainer) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Trainer portal is available only to trainers</h2>
            <p className="text-sm text-mentor-text-secondary">Your role in {activeOrganization.name} does not have trainer access.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view batch analytics.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <button
          onClick={() => navigate(`/organizations/${organizationId}/trainer`)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ArrowLeft size={16} />
          Back to Trainer Dashboard
        </button>

        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="page-title">{batch ? `${batch.name} — Analytics` : 'Batch Analytics'}</h1>
            <p className="page-subtitle">Assignment status and score aggregation for this batch.</p>
          </div>
          {batchId && (
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to={`/organizations/${organizationId}/trainer/batches/${batchId}/skill-gaps`}
                className="btn btn-secondary"
              >
                <Target size={16} />
                Skill Gaps
              </Link>
              <Link
                to={`/organizations/${organizationId}/trainer/batches/${batchId}/readiness`}
                className="btn btn-secondary"
              >
                <Gauge size={16} />
                Readiness
              </Link>
            </div>
          )}
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading analytics...</p>
          </div>
        ) : error || !analytics ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load analytics</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'No data available.'}</p>
            <button onClick={fetchAnalytics} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.totalStudents}</div>
                <div className="stat-tile-label">Students</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.totalAssignments}</div>
                <div className="stat-tile-label">Assignments</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.completionRate}%</div>
                <div className="stat-tile-label">Completion Rate</div>
              </div>
              <div className="stat-tile">
                <div className={`stat-tile-value ${getScoreColorClass(analytics.summary.averageScore)}`}>
                  {analytics.summary.averageScore !== null ? analytics.summary.averageScore.toFixed(1) : '—'}
                </div>
                <div className="stat-tile-label">Avg Score</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.pending}</div>
                <div className="stat-tile-label">Pending</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.inProgress}</div>
                <div className="stat-tile-label">In Progress</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.completed}</div>
                <div className="stat-tile-label">Completed</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.overdue}</div>
                <div className="stat-tile-label">Overdue</div>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <h2 className="section-title px-6 pt-6 mb-2">Student Breakdown</h2>
              {analytics.students.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-10">No active students in this batch.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-mentor-border">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Student
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Total
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Completed
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Pending
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          In Progress
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Avg Score
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                          Reports
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mentor-border">
                      {analytics.students.map((row) => (
                        <tr key={row.student.id}>
                          <td className="px-6 py-3 text-sm text-mentor-text">
                            {row.student.firstName} {row.student.lastName || ''}
                          </td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary">{row.totalAssignments}</td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary">{row.completed}</td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary">{row.pending}</td>
                          <td className="px-6 py-3 text-sm text-mentor-text-secondary">{row.inProgress}</td>
                          <td className={`px-6 py-3 text-sm text-right font-semibold ${getScoreColorClass(row.averageScore)}`}>
                            {row.averageScore !== null ? row.averageScore.toFixed(1) : '—'}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <Link
                              to={`/organizations/${organizationId}/trainer/students/${row.student.id}/reports`}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default TrainerBatchAnalyticsPage;
