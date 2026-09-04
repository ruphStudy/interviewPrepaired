import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, { StudentAssignmentRow, StudentAssignmentStatus } from '../../api/studentPortalApi';
import { AlertCircle, Loader2, ChevronLeft, Play, FileText, GraduationCap } from 'lucide-react';

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

const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

const StudentAssignmentDetailPage: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<StudentAssignmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getAssignmentDetail(assignmentId);
      setAssignment(response.data.assignment);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleStartOrResume = async () => {
    if (!assignment) return;
    setActionError(null);
    if (assignment.status === 'in_progress' && assignment.interviewId) {
      navigate(`/interview/${assignment.interviewId}`);
      return;
    }
    setActionLoading(true);
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
      setActionLoading(false);
    }
  };

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <Link to="/student/assignments" className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4">
          <ChevronLeft size={16} />
          Back to Assignments
        </Link>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading assignment...</p>
          </div>
        ) : error || !assignment ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load assignment</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'Assignment not found.'}</p>
            <button onClick={fetchDetail} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                  <GraduationCap size={18} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-semibold text-mentor-text dark:text-future-text truncate">
                    {assignment.template?.name || 'Interview Assignment'}
                  </h1>
                  <p className="text-xs text-mentor-text-muted truncate">{assignment.organization.name}</p>
                </div>
              </div>
              <span className={`badge ${getStatusBadgeClass(assignment.status)} shrink-0`}>
                {assignment.status.replace('_', ' ')}
              </span>
            </div>

            {actionError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{actionError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <p className="label mb-1">Student</p>
                <p className="text-sm text-mentor-text">
                  {assignment.student.firstName} {assignment.student.lastName || ''}
                  {assignment.student.enrollmentNumber ? ` (${assignment.student.enrollmentNumber})` : ''}
                </p>
              </div>
              <div>
                <p className="label mb-1">Due Date</p>
                <p className="text-sm text-mentor-text">{formatDateTime(assignment.dueAt)}</p>
              </div>
              <div>
                <p className="label mb-1">Assigned On</p>
                <p className="text-sm text-mentor-text">{formatDateTime(assignment.createdAt)}</p>
              </div>
            </div>

            {assignment.instructions && (
              <div className="surface-muted p-4 mb-5">
                <p className="label mb-1.5">Instructions</p>
                <p className="text-sm text-mentor-text whitespace-pre-wrap">{assignment.instructions}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              {assignment.status === 'assigned' && (
                <button onClick={handleStartOrResume} disabled={actionLoading} className="btn btn-primary">
                  <Play size={16} />
                  {actionLoading ? 'Starting...' : 'Start Interview'}
                </button>
              )}
              {assignment.status === 'in_progress' && (
                <button onClick={handleStartOrResume} disabled={actionLoading} className="btn btn-primary">
                  <Play size={16} />
                  {actionLoading ? 'Loading...' : 'Resume Interview'}
                </button>
              )}
              {assignment.status === 'completed' && (
                <button
                  onClick={() => navigate(`/student/assignments/${assignment.assignmentId}/result`)}
                  className="btn btn-primary"
                >
                  <FileText size={16} />
                  View Result
                </button>
              )}
              {assignment.status === 'cancelled' && (
                <p className="text-sm text-mentor-text-muted">This assignment was cancelled.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default StudentAssignmentDetailPage;
