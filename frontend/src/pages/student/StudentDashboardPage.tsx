import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, { StudentDashboardBlock, StudentAssignmentStatus, UpcomingAssignment } from '../../api/studentPortalApi';
import { GraduationCap, AlertCircle, Loader2, Play, FileText, ArrowRight, ClipboardList } from 'lucide-react';

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
 * Student Portal home. One block per ACTIVE linked InstituteStudent record —
 * a student may be linked to more than one institute (or none at all), so
 * this deliberately never assumes a single record. Entirely independent of
 * OrganizationContext/active organization — a student need not be an
 * OrganizationMember at all.
 */
const StudentDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<StudentDashboardBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getDashboard();
      setDashboards(response.data.dashboards);
    } catch (err: any) {
      setError(err.message || 'Failed to load student dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleStartOrResume = async (assignment: UpcomingAssignment) => {
    setActionError(null);
    if (assignment.status === 'completed') {
      navigate(`/student/assignments/${assignment.assignmentId}/result`);
      return;
    }
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
          <h1 className="page-title">Student Portal</h1>
          <p className="page-subtitle">Interviews assigned to you by your institute.</p>
        </div>

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading your institutes...</p>
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
              <GraduationCap size={22} className="text-primary-600" />
            </div>
            <h3 className="section-title mb-1.5">No institute interviews yet</h3>
            <p className="text-sm text-mentor-text-secondary">
              You're not linked to any institute yet. Ask your institute admin or trainer to link your account to see
              assigned interviews here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {dashboards.map((block) => (
              <div key={block.organization.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                      <GraduationCap size={18} className="text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-mentor-text dark:text-future-text truncate">
                        {block.organization.name}
                      </h2>
                      <p className="text-xs text-mentor-text-muted truncate">
                        {block.student.firstName} {block.student.lastName || ''}
                        {block.student.enrollmentNumber ? ` · ${block.student.enrollmentNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/student/assignments?organizationId=${block.organization.id}`)}
                    className="btn btn-secondary shrink-0 self-start sm:self-auto"
                  >
                    View All Assignments
                    <ArrowRight size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.totalAssignments}</div>
                    <div className="stat-tile-label">Total</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.pending}</div>
                    <div className="stat-tile-label">Pending</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.inProgress}</div>
                    <div className="stat-tile-label">In Progress</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.completed}</div>
                    <div className="stat-tile-label">Completed</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-tile-value">{block.summary.overdue}</div>
                    <div className="stat-tile-label">Overdue</div>
                  </div>
                </div>

                {block.upcomingAssignments.length === 0 ? (
                  <div className="surface-muted p-6 text-center">
                    <ClipboardList size={20} className="text-mentor-text-muted mx-auto mb-2" />
                    <p className="text-sm text-mentor-text-secondary">No upcoming assignments right now.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-mentor-border">
                    {block.upcomingAssignments.map((assignment) => (
                      <div
                        key={assignment.assignmentId}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm font-semibold text-mentor-text truncate">
                              {assignment.templateName || 'Interview'}
                            </h3>
                            <span className={`badge ${getStatusBadgeClass(assignment.status)}`}>
                              {assignment.status.replace('_', ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-mentor-text-muted">Due {formatDate(assignment.dueAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default StudentDashboardPage;
