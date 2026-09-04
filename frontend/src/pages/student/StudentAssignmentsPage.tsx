import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, {
  StudentAssignmentRow,
  StudentAssignmentStatus,
  StudentOrganizationRef,
} from '../../api/studentPortalApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, Play, FileText } from 'lucide-react';

const PAGE_LIMIT = 20;

const getStatusBadgeClass = (status: StudentAssignmentStatus) => {
  switch (status) {
    case 'completed':
      return 'badge-success';
    case 'in_progress':
      return 'badge-warning';
    case 'cancelled':
      return 'badge-neutral';
    default:
      return 'badge-info';
  }
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * All institute interview assignments for the authenticated student across
 * every linked institute. `organizationId` (from the query string, e.g.
 * arriving from the dashboard's "View All Assignments" link) only NARROWS
 * the result to one already-authorized institute — it never widens access.
 */
const StudentAssignmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const organizationId = searchParams.get('organizationId') || '';
  const statusFilter = (searchParams.get('status') as StudentAssignmentStatus | null) || '';

  const [institutes, setInstitutes] = useState<StudentOrganizationRef[]>([]);
  const [assignments, setAssignments] = useState<StudentAssignmentRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  useEffect(() => {
    studentPortalApi
      .getDashboard()
      .then((response) => setInstitutes(response.data.dashboards.map((d) => d.organization)))
      .catch(() => {
        // Non-fatal — the institute filter just won't populate.
      });
  }, []);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getAssignments({
        organizationId: organizationId || undefined,
        status: statusFilter || undefined,
        page,
        limit: PAGE_LIMIT,
      });
      setAssignments(response.data.assignments);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [organizationId, statusFilter, page]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const updateFilter = (key: 'organizationId' | 'status', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
    setPage(1);
  };

  const handleStartOrResume = async (assignment: StudentAssignmentRow) => {
    setActionError(null);
    if (assignment.status === 'in_progress' && assignment.interviewId) {
      navigate(`/interview/${assignment.interviewId}`);
      return;
    }
    setActionLoadingId(assignment.assignmentId);
    try {
      if (assignment.status === 'assigned') {
        const response = await studentPortalApi.startAssignment(assignment.assignmentId);
        navigate(`/interview/${response.data.interviewId}`);
      } else if (assignment.status === 'in_progress') {
        const response = await studentPortalApi.getAssignmentSession(assignment.assignmentId);
        navigate(`/interview/${response.data.interviewId}`);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to start interview');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">My Assignments</h1>
          <p className="page-subtitle">Interviews assigned to you across all your linked institutes.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={organizationId} onChange={(e) => updateFilter('organizationId', e.target.value)} className="input w-auto">
            <option value="">All institutes</option>
            {institutes.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => updateFilter('status', e.target.value)} className="input w-auto">
            <option value="">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading assignments...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load assignments</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchAssignments} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : assignments.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No assignments match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Institute
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Due
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {assignments.map((assignment) => (
                    <tr key={assignment.assignmentId}>
                      <td className="px-6 py-3 text-sm text-mentor-text">{assignment.organization.name}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text">{assignment.template?.name || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusBadgeClass(assignment.status)}`}>
                          {assignment.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDate(assignment.dueAt)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/student/assignments/${assignment.assignmentId}`)}
                            className="btn btn-secondary px-3 py-1.5 text-xs"
                          >
                            View
                          </button>
                          {assignment.status === 'assigned' && (
                            <button
                              onClick={() => handleStartOrResume(assignment)}
                              disabled={actionLoadingId === assignment.assignmentId}
                              className="btn btn-primary px-3 py-1.5 text-xs"
                            >
                              <Play size={14} />
                              Start
                            </button>
                          )}
                          {assignment.status === 'in_progress' && (
                            <button
                              onClick={() => handleStartOrResume(assignment)}
                              disabled={actionLoadingId === assignment.assignmentId}
                              className="btn btn-primary px-3 py-1.5 text-xs"
                            >
                              <Play size={14} />
                              Resume
                            </button>
                          )}
                          {assignment.status === 'completed' && (
                            <button
                              onClick={() => navigate(`/student/assignments/${assignment.assignmentId}/result`)}
                              className="btn btn-primary px-3 py-1.5 text-xs"
                            >
                              <FileText size={14} />
                              Result
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

export default StudentAssignmentsPage;
