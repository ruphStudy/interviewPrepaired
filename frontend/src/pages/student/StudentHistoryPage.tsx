import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, { StudentHistoryRow, StudentOrganizationRef } from '../../api/studentPortalApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, FileText, History as HistoryIcon } from 'lucide-react';

const PAGE_LIMIT = 20;

const getScoreColorClass = (score: number) => {
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/** Completed institute interviews only — the backend already filters to status: completed. */
const StudentHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizationId = searchParams.get('organizationId') || '';

  const [institutes, setInstitutes] = useState<StudentOrganizationRef[]>([]);
  const [history, setHistory] = useState<StudentHistoryRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  useEffect(() => {
    studentPortalApi
      .getDashboard()
      .then((response) => setInstitutes(response.data.dashboards.map((d) => d.organization)))
      .catch(() => {
        // Non-fatal — the institute filter just won't populate.
      });
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getHistory({ organizationId: organizationId || undefined, page, limit: PAGE_LIMIT });
      setHistory(response.data.history);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview history');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const updateFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('organizationId', value);
    else next.delete('organizationId');
    setSearchParams(next);
    setPage(1);
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Interview History</h1>
          <p className="page-subtitle">Your completed institute interviews.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={organizationId} onChange={(e) => updateFilter(e.target.value)} className="input w-auto">
            <option value="">All institutes</option>
            {institutes.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading history...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchHistory} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : history.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
                <HistoryIcon size={22} className="text-primary-600" />
              </div>
              <h3 className="section-title mb-1.5">No completed interviews yet</h3>
              <p className="text-sm text-mentor-text-secondary">Completed institute interviews will show up here.</p>
            </div>
          ) : (
            <div className="divide-y divide-mentor-border">
              {history.map((row) => (
                <div
                  key={row.assignmentId}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-mentor-surface transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-mentor-text truncate">{row.template?.name || 'Interview'}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-mentor-text-muted flex-wrap">
                      <span>{row.organization.name}</span>
                      <span>&middot;</span>
                      <span>Completed {formatDate(row.completedAt)}</span>
                    </div>
                  </div>

                  {row.score !== undefined && (
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${getScoreColorClass(row.score)}`}>{row.score.toFixed(1)}</div>
                      <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                    </div>
                  )}

                  <button
                    onClick={() => navigate(`/student/assignments/${row.assignmentId}/result`)}
                    className="btn btn-secondary shrink-0 self-start sm:self-auto"
                  >
                    <FileText size={14} />
                    View Result
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

export default StudentHistoryPage;
