import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { TrainerReportRow } from '../../api/instituteApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, ArrowLeft, FileText } from 'lucide-react';

const PAGE_LIMIT = 20;

const getScoreColorClass = (score: number) => {
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * Trainer-scoped student reports — `studentId` must already be inside the
 * caller's own trainer scope (batch/course assignment); a cross-scope or
 * nonexistent student surfaces the backend's own 404 as-is, never a
 * client-side "not found" guess.
 */
const TrainerStudentReportsPage: React.FC = () => {
  const { organizationId, studentId } = useParams<{ organizationId: string; studentId: string }>();
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

  const [reports, setReports] = useState<TrainerReportRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const isTrainer = activeRole === 'trainer';
  const canView = hasPermission('reports:view');
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchReports = useCallback(async () => {
    if (!organizationId || !studentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listTrainerStudentReports(organizationId, studentId, { page, limit: PAGE_LIMIT });
      setReports(response.data.reports);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load student reports');
    } finally {
      setLoading(false);
    }
  }, [organizationId, studentId, page]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && isTrainer && canView) {
      fetchReports();
    }
  }, [isSyncing, activeOrganization, isTrainer, canView, fetchReports]);

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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view student reports.</p>
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

        <div className="page-header">
          <h1 className="page-title">Student Reports</h1>
          <p className="page-subtitle">Completed interview reports for this student.</p>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading reports...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load reports</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchReports} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : reports.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No completed interviews yet for this student.</p>
            </div>
          ) : (
            <div className="divide-y divide-mentor-border">
              {reports.map((row) => (
                <div
                  key={row.assignmentId}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-mentor-surface transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-mentor-text truncate mb-1">
                      {row.template?.name || 'Interview'}
                    </h3>
                    <p className="text-xs text-mentor-text-muted">Completed {formatDate(row.completedAt)}</p>
                  </div>

                  {row.score !== undefined && (
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${getScoreColorClass(row.score)}`}>{row.score.toFixed(1)}</div>
                      <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                    </div>
                  )}

                  <button
                    onClick={() =>
                      navigate(`/organizations/${organizationId}/trainer/students/${studentId}/reports/${row.assignmentId}`)
                    }
                    className="btn btn-secondary shrink-0 self-start sm:self-auto"
                  >
                    <FileText size={14} />
                    View Report
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {page} of {totalPages} &middot; {total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default TrainerStudentReportsPage;
