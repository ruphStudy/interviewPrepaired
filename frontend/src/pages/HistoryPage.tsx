import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import interviewApi, { InterviewHistoryItem, InterviewHistoryPagination } from '../api/interviewApi';
import { MessagesSquare, ClipboardCheck, ChevronLeft, ChevronRight, Plus, AlertCircle, Loader2 } from 'lucide-react';

const RESUMABLE_STATUSES = new Set(['created', 'in-progress', 'paused']);
const REPORT_READY_STATUSES = new Set(['completed', 'evaluated']);

const PAGE_LIMIT = 10;

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

const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<InterviewHistoryItem[]>([]);
  const [pagination, setPagination] = useState<InterviewHistoryPagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await interviewApi.getHistory({ page: targetPage, limit: PAGE_LIMIT });
      setInterviews(response.data.interviews);
      setPagination(response.data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  const handleOpenInterview = (interview: InterviewHistoryItem) => {
    if (REPORT_READY_STATUSES.has(interview.status)) {
      navigate(`/report/${interview.id}`);
    } else if (RESUMABLE_STATUSES.has(interview.status)) {
      navigate(`/interview/${interview.id}`);
    }
  };

  const getActionLabel = (status: string) => {
    if (REPORT_READY_STATUSES.has(status)) return 'View Report';
    if (RESUMABLE_STATUSES.has(status)) return 'Resume';
    return null;
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Interview History</h1>
            <p className="page-subtitle">Review your past practice sessions and reports.</p>
          </div>
          <button onClick={() => navigate('/setup')} className="btn btn-primary shrink-0">
            <Plus size={16} />
            New Interview
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading your interviews...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load interview history</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={() => fetchHistory(page)} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : interviews.length === 0 ? (
            <div className="p-16 text-center">
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
              {interviews.map((interview) => {
                const actionLabel = getActionLabel(interview.status);
                return (
                  <div
                    key={interview.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 hover:bg-mentor-surface transition-colors"
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
                        <span>
                          {interview.answeredQuestions}/{interview.totalQuestions} questions
                        </span>
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

                    {actionLabel && (
                      <button
                        onClick={() => handleOpenInterview(interview)}
                        className="btn btn-secondary shrink-0 self-start sm:self-auto"
                      >
                        {actionLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && pagination && pagination.total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {pagination.page} of {pagination.pages} &middot; {pagination.total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pagination.page <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={pagination.page >= pagination.pages}
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

export default HistoryPage;
