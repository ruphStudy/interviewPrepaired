import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, { StudentAssignmentRow } from '../../api/studentPortalApi';
import { InterviewReport } from '../../api/interviewApi';
import { AlertCircle, Loader2, ChevronLeft, ExternalLink, GraduationCap } from 'lucide-react';

const getScoreColorClass = (score: number) => {
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

/**
 * A compact institute-context summary of a completed assignment's result,
 * backed by the SAME InterviewReport shape/data as the full report — nothing
 * here is recomputed. For the full rich report experience (radar/bar/line
 * charts, per-question breakdown, exports), this links out to the EXISTING
 * /report/:interviewId page (ReportDashboard) rather than duplicating any of
 * its evaluation-rendering logic.
 */
const StudentAssignmentResultPage: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<StudentAssignmentRow | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResult = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getAssignmentResult(assignmentId);
      setAssignment(response.data.assignment);
      setReport(response.data.report);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview result');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <Link
          to="/student/assignments"
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Assignments
        </Link>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading result...</p>
          </div>
        ) : error || !assignment || !report ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load result</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'Result not available.'}</p>
            <button onClick={fetchResult} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                  <GraduationCap size={18} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-mentor-text dark:text-future-text truncate">
                    {assignment.template?.name || 'Interview Result'}
                  </h1>
                  <p className="text-xs text-mentor-text-muted truncate">
                    {assignment.organization.name} &middot; Completed {formatDateTime(report.interview.completedAt)}
                  </p>
                </div>
              </div>
              {report.finalReport && (
                <div className="text-right shrink-0">
                  <div className={`text-3xl font-bold ${getScoreColorClass(report.finalReport.overallScore)}`}>
                    {report.finalReport.overallScore.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-mentor-text-muted">/ 10.0</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="stat-tile">
                <div className="stat-tile-value">{report.statistics.averageScore.toFixed(1)}</div>
                <div className="stat-tile-label">Avg Score</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{report.statistics.completionRate}%</div>
                <div className="stat-tile-label">Completion</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{report.interview.answeredQuestions}/{report.interview.totalQuestions}</div>
                <div className="stat-tile-label">Questions</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{Math.round(report.statistics.totalDuration / 60)}m</div>
                <div className="stat-tile-label">Duration</div>
              </div>
            </div>

            {report.finalReport?.summary && (
              <div className="surface-muted p-4 mb-6">
                <p className="label mb-1.5">Summary</p>
                <p className="text-sm text-mentor-text">{report.finalReport.summary}</p>
              </div>
            )}

            <button
              onClick={() => navigate(`/report/${assignment.interviewId}`)}
              disabled={!assignment.interviewId}
              className="btn btn-primary"
            >
              <ExternalLink size={16} />
              View Full Report
            </button>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default StudentAssignmentResultPage;
