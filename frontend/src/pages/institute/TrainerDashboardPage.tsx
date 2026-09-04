import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  TrainerDashboard,
  TrainerAssignment,
  InstituteCourse,
  InstituteBatch,
  StudentInterviewAssignmentStatus,
} from '../../api/instituteApi';
import { AlertCircle, Loader2, Layers, BookOpen, BarChart3, Gauge, Target, ArrowRight } from 'lucide-react';

const getStatusBadgeClass = (status: StudentInterviewAssignmentStatus) => {
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
 * Trainer Portal home. Identity-gated (activeRole === 'trainer'), not just
 * permission-gated — an OWNER/ADMIN/RECRUITER holding interviews:view can
 * never see this as if they were a trainer (the backend enforces the same
 * rule; this is a matching UI guard, not the source of truth).
 *
 * "Assigned batches" navigation is built ONLY from the caller's OWN
 * InstituteTrainerAssignment rows (self-scoped via activeMembershipId) —
 * never from the unrestricted institute batches list, so a trainer can
 * never see batch links beyond what they're actually assigned to.
 */
const TrainerDashboardPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    activeMembershipId,
    activeRole,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [dashboard, setDashboard] = useState<TrainerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [scopeLoading, setScopeLoading] = useState(true);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const isTrainer = activeRole === 'trainer';
  const canView = hasPermission('interviews:view');

  const fetchDashboard = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.getTrainerDashboard(organizationId);
      setDashboard(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load trainer dashboard');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  // Own assigned batches/courses — resolved from the caller's own
  // membershipId only, then a per-id GET (never the unrestricted list) to
  // display a name for each already-confirmed-in-scope id.
  const fetchOwnScope = useCallback(async () => {
    if (!organizationId || !activeMembershipId) return;
    setScopeLoading(true);
    try {
      const assignmentsResponse = await instituteApi.listTrainerAssignments(organizationId, activeMembershipId, {
        limit: 100,
      });
      const assignments: TrainerAssignment[] = assignmentsResponse.data.assignments;
      const batchIds = Array.from(new Set(assignments.filter((a) => a.batchId).map((a) => a.batchId!)));
      const courseIds = Array.from(new Set(assignments.filter((a) => a.courseId).map((a) => a.courseId!)));

      const [batchResults, courseResults] = await Promise.all([
        Promise.all(batchIds.map((id) => instituteApi.getBatch(organizationId, id).catch(() => null))),
        Promise.all(courseIds.map((id) => instituteApi.getCourse(organizationId, id).catch(() => null))),
      ]);
      setBatches(batchResults.filter((r): r is NonNullable<typeof r> => !!r).map((r) => r.data.batch));
      setCourses(courseResults.filter((r): r is NonNullable<typeof r> => !!r).map((r) => r.data.course));
    } catch {
      // Non-fatal — batch/course navigation just won't populate; the
      // dashboard's own summary counts are unaffected.
    } finally {
      setScopeLoading(false);
    }
  }, [organizationId, activeMembershipId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && isTrainer && canView) {
      fetchDashboard();
      fetchOwnScope();
    }
  }, [isSyncing, activeOrganization, isTrainer, canView, fetchDashboard, fetchOwnScope]);

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
            <p className="text-sm text-mentor-text-secondary">
              Your role in {activeOrganization.name} does not have trainer access. Owners and admins cannot view this
              portal as a trainer.
            </p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view the trainer dashboard.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Trainer Dashboard</h1>
          <p className="page-subtitle">Your assigned courses, batches and students at {activeOrganization.name}.</p>
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading your dashboard...</p>
          </div>
        ) : error || !dashboard ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load dashboard</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'No data available.'}</p>
            <button onClick={fetchDashboard} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.assignedCourses}</div>
                <div className="stat-tile-label">Courses</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.assignedBatches}</div>
                <div className="stat-tile-label">Batches</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.totalStudents}</div>
                <div className="stat-tile-label">Students</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.totalInterviewAssignments}</div>
                <div className="stat-tile-label">Assignments</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.pending}</div>
                <div className="stat-tile-label">Pending</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.inProgress}</div>
                <div className="stat-tile-label">In Progress</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.completed}</div>
                <div className="stat-tile-label">Completed</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{dashboard.summary.overdue}</div>
                <div className="stat-tile-label">Overdue</div>
              </div>
            </div>

            <div className="card mb-6">
              <h2 className="section-title mb-4">Assigned Batches</h2>
              {scopeLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : batches.length === 0 && courses.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">
                  You have no course or batch assignments yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {batches.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {batches.map((batch) => (
                        <div key={batch.id} className="surface-muted p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Layers size={16} className="text-primary-600" />
                            <span className="text-sm font-semibold text-mentor-text truncate">{batch.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() =>
                                navigate(`/organizations/${organizationId}/trainer/batches/${batch.id}/analytics`)
                              }
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                            >
                              <BarChart3 size={14} />
                              Analytics
                            </button>
                            <button
                              onClick={() =>
                                navigate(`/organizations/${organizationId}/trainer/batches/${batch.id}/skill-gaps`)
                              }
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                            >
                              <Target size={14} />
                              Skill Gaps
                            </button>
                            <button
                              onClick={() =>
                                navigate(`/organizations/${organizationId}/trainer/batches/${batch.id}/readiness`)
                              }
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                            >
                              <Gauge size={14} />
                              Readiness
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {courses.length > 0 && (
                    <div>
                      <p className="label mb-2">Assigned Courses (all batches under these courses are in scope)</p>
                      <div className="flex flex-wrap gap-2">
                        {courses.map((course) => (
                          <span key={course.id} className="badge badge-info">
                            <BookOpen size={12} className="inline mr-1" />
                            {course.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="section-title mb-4">Recent Activity</h2>
              {dashboard.recentActivity.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No recent interview activity.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {dashboard.recentActivity.map((row) => (
                    <div key={row.assignmentId} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-sm font-semibold text-mentor-text truncate">
                            {row.student.firstName} {row.student.lastName || ''}
                          </h3>
                          <span className={`badge ${getStatusBadgeClass(row.status)}`}>{row.status.replace('_', ' ')}</span>
                        </div>
                        <p className="text-xs text-mentor-text-muted">
                          {row.templateName || 'Interview'} &middot; Due {formatDate(row.dueAt)}
                        </p>
                      </div>
                      <Link
                        to={`/organizations/${organizationId}/trainer/students/${row.student.id}/reports`}
                        className="btn btn-secondary shrink-0 self-start sm:self-auto"
                      >
                        View Reports
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default TrainerDashboardPage;
