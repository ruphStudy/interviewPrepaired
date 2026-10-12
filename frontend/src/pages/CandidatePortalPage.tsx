import React, { useCallback, useEffect, useState } from 'react';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useAuth } from '../contexts/AuthContext';
import candidatePortalApi, { CandidateDashboardBlock, CandidateAssessmentRow, CandidatePortalStatus } from '../api/candidatePortalApi';
import { Briefcase, AlertCircle, Loader2, ClipboardList, History as HistoryIcon, Mail } from 'lucide-react';

const STATUS_LABELS: Record<CandidatePortalStatus, string> = {
  invited: 'Invited',
  in_progress: 'In Progress',
  completed: 'Completed',
  expired: 'Expired',
  closed: 'Closed',
};

const STATUS_BADGE: Record<CandidatePortalStatus, string> = {
  invited: 'badge-info',
  in_progress: 'badge-warning',
  completed: 'badge-success',
  expired: 'badge-neutral',
  closed: 'badge-neutral',
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * Candidate self-service portal. One dashboard block per employer with a
 * matching ACTIVE EmployerCandidate record for the caller's own email — a
 * candidate may be a candidate for several unrelated employers at once, so
 * this deliberately never assumes a single one, and each block only ever
 * shows that ONE employer's own assessments (never mixed across blocks).
 *
 * Read-only: there is no "Start"/"Resume" action here, unlike the Student
 * Portal — a hiring assessment's raw invitation token is never persisted
 * server-side (see EmployerInterviewInvitation), so the only way to
 * actually open/continue an assessment remains the original secure link
 * from the candidate's email, matching the existing 20D public-invitation
 * design exactly.
 */
const CandidatePortalPage: React.FC = () => {
  const { user } = useAuth();
  const [dashboards, setDashboards] = useState<CandidateDashboardBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CandidateAssessmentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await candidatePortalApi.getDashboard();
      setDashboards(response.data.dashboards);
    } catch (err: any) {
      setError(err.message || 'Failed to load candidate dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await candidatePortalApi.getHistory({ limit: 50 });
      setHistory(response.data.history);
    } catch (err: any) {
      setHistoryError(err.message || 'Failed to load assessment history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && history.length === 0 && !historyLoading) {
      fetchHistory();
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Candidate Portal</h1>
          <p className="page-subtitle">Hiring assessments you've been invited to complete.</p>
          {user?.email && (
            <p className="text-xs text-mentor-text-muted flex items-center gap-1.5 mt-1">
              <Mail size={12} />
              Matched by {user.email}
            </p>
          )}
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading your assessments...</p>
          </div>
        ) : error ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load your dashboard</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
            <button onClick={fetchDashboard} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : dashboards.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <Briefcase size={22} className="text-primary-600" />
            </div>
            <h3 className="section-title mb-1.5">No assessments yet</h3>
            <p className="text-sm text-mentor-text-secondary">
              When an employer invites you to a hiring assessment, it will appear here. Check your email for the
              invitation link to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dashboards.map((block) => (
              <div key={block.organization.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                      <Briefcase size={18} className="text-primary-600" />
                    </div>
                    <h2 className="text-base font-semibold text-mentor-text dark:text-future-text truncate">
                      {block.organization.name}
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.total}</div>
                    <div className="stat-tile-label">Total</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.invited}</div>
                    <div className="stat-tile-label">Invited</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.inProgress}</div>
                    <div className="stat-tile-label">In Progress</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.completed}</div>
                    <div className="stat-tile-label">Completed</div>
                  </div>
                </div>

                {block.upcoming.length === 0 ? (
                  <div className="surface-muted p-6 text-center">
                    <ClipboardList size={20} className="text-mentor-text-muted mx-auto mb-2" />
                    <p className="text-sm text-mentor-text-secondary">Nothing pending right now.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-mentor-border">
                    {block.upcoming.map((assessment) => (
                      <div key={assessment.invitationId} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm font-semibold text-mentor-text truncate">{assessment.job.title}</h3>
                            <span className={`badge ${STATUS_BADGE[assessment.status]}`}>{STATUS_LABELS[assessment.status]}</span>
                          </div>
                          <p className="text-xs text-mentor-text-muted">
                            {assessment.status === 'invited' ? `Expires ${formatDate(assessment.expiresAt)}` : `Invited ${formatDate(assessment.invitedAt)}`}
                          </p>
                        </div>
                        <p className="text-xs text-mentor-text-muted shrink-0">
                          Check your email from {block.organization.name} to continue.
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="card">
              <button onClick={handleToggleHistory} className="flex items-center justify-between w-full">
                <h2 className="section-title flex items-center gap-2 mb-0">
                  <HistoryIcon size={18} className="text-mentor-text-muted" />
                  Assessment History
                </h2>
                <span className="text-xs text-mentor-text-muted">{showHistory ? 'Hide' : 'Show'}</span>
              </button>

              {showHistory && (
                <div className="mt-4">
                  {historyLoading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                    </div>
                  ) : historyError ? (
                    <div className="p-8 text-center">
                      <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                      <p className="text-sm text-mentor-text-secondary mb-4">{historyError}</p>
                      <button onClick={fetchHistory} className="btn btn-primary">
                        Try Again
                      </button>
                    </div>
                  ) : history.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary text-center py-6">No completed or closed assessments yet.</p>
                  ) : (
                    <div className="divide-y divide-mentor-border">
                      {history.map((row) => (
                        <div key={row.invitationId} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="text-sm font-medium text-mentor-text truncate">{row.job.title}</h3>
                              <span className="badge badge-neutral">{row.organization.name}</span>
                              <span className={`badge ${STATUS_BADGE[row.status]}`}>{STATUS_LABELS[row.status]}</span>
                            </div>
                            <p className="text-xs text-mentor-text-muted">
                              {row.completedAt ? `Completed ${formatDate(row.completedAt)}` : `Expired ${formatDate(row.expiresAt)}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default CandidatePortalPage;
