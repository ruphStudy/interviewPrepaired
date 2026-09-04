import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  StudentInterviewAssignment,
  StudentInterviewAssignmentStatus,
  InstituteStudent,
  InstituteInterviewTemplate,
  AssignInterviewResult,
} from '../../api/instituteApi';
import {
  AlertCircle,
  Loader2,
  Plus,
  ChevronLeft,
  ChevronRight,
  Play,
  Ban,
  ExternalLink,
  X,
} from 'lucide-react';

const PAGE_LIMIT = 20;
const MAX_ASSIGN_STUDENTS = 200;

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

const InstituteInterviewAssignmentsPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [assignments, setAssignments] = useState<StudentInterviewAssignment[]>([]);
  const [students, setStudents] = useState<InstituteStudent[]>([]);
  const [templates, setTemplates] = useState<InstituteInterviewTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [studentFilter, setStudentFilter] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentInterviewAssignmentStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showAssign, setShowAssign] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [instructions, setInstructions] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignResult, setAssignResult] = useState<AssignInterviewResult | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('interviews:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const studentLabel = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.firstName} ${s.lastName || ''}`.trim() : id;
  };
  const templateName = (id: string) => templates.find((t) => t.id === id)?.name || id;

  const fetchOptions = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [studentsResponse, templatesResponse] = await Promise.all([
        instituteApi.listStudents(organizationId, { limit: 200, status: 'active' }),
        instituteApi.listTemplates(organizationId, { limit: 100, status: 'active' }),
      ]);
      setStudents(studentsResponse.data.students);
      setTemplates(templatesResponse.data.templates);
    } catch {
      // Non-fatal — name resolution/form options just won't populate.
    }
  }, [organizationId]);

  const fetchAssignments = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listInterviewAssignments(organizationId, {
        page,
        limit: PAGE_LIMIT,
        studentId: studentFilter || undefined,
        templateId: templateFilter || undefined,
        status: statusFilter || undefined,
      });
      setAssignments(response.data.assignments);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview assignments');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, studentFilter, templateFilter, statusFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && canView) {
      fetchOptions();
      fetchAssignments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, activeOrganization, canView, fetchOptions, fetchAssignments]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_ASSIGN_STUDENTS) next.add(id);
      return next;
    });
  };

  const filteredStudentsForAssign = students.filter((s) =>
    `${s.firstName} ${s.lastName || ''} ${s.email || ''}`.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!assignTemplateId) {
      setAssignError('Select a template');
      return;
    }
    if (selectedStudentIds.size === 0) {
      setAssignError('Select at least one student');
      return;
    }
    setAssignSubmitting(true);
    setAssignError(null);
    setAssignResult(null);
    try {
      const response = await instituteApi.assignInterview(organizationId, {
        templateId: assignTemplateId,
        studentIds: Array.from(selectedStudentIds),
        dueAt: dueAt || undefined,
        instructions: instructions.trim() || undefined,
      });
      setAssignResult(response.data);
      fetchAssignments();
    } catch (err: any) {
      setAssignError(err.message || 'Failed to assign interview');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleStart = async (assignment: StudentInterviewAssignment) => {
    if (!organizationId) return;
    setActionError(null);
    setActionLoadingId(assignment.assignmentId);
    try {
      await instituteApi.startInterviewAssignment(organizationId, assignment.assignmentId);
      fetchAssignments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to start interview assignment');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (assignment: StudentInterviewAssignment) => {
    if (!organizationId) return;
    if (!window.confirm(`Cancel this interview assignment for ${studentLabel(assignment.studentId)}?`)) return;
    setActionError(null);
    setActionLoadingId(assignment.assignmentId);
    try {
      await instituteApi.cancelInterviewAssignment(organizationId, assignment.assignmentId);
      fetchAssignments();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel interview assignment');
    } finally {
      setActionLoadingId(null);
    }
  };

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
            <p className="text-sm text-mentor-text-secondary">
              Interview assignments are only available for institute organizations.
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view interview assignments.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Interview Assignments</h1>
          <p className="page-subtitle">Assign and track interview templates for students at {activeOrganization.name}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={studentFilter}
            onChange={(e) => {
              setStudentFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All students</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
          <select
            value={templateFilter}
            onChange={(e) => {
              setTemplateFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StudentInterviewAssignmentStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {canManage && (
            <button
              onClick={() => {
                setShowAssign((v) => !v);
                setAssignResult(null);
              }}
              className="btn btn-primary ml-auto"
            >
              <Plus size={16} />
              Assign Interview
            </button>
          )}
        </div>

        {showAssign && (
          <form onSubmit={handleAssign} className="card mb-4 space-y-4">
            {assignError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{assignError}</p>
              </div>
            )}
            <div>
              <label className="label">Template</label>
              <select value={assignTemplateId} onChange={(e) => setAssignTemplateId(e.target.value)} className="input">
                <option value="">Select a template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Students ({selectedStudentIds.size} selected, max {MAX_ASSIGN_STUDENTS})
              </label>
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students"
                className="input mb-2"
              />
              <div className="surface-muted max-h-56 overflow-y-auto p-2 space-y-1">
                {filteredStudentsForAssign.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-mentor-surface text-sm">
                    <input type="checkbox" checked={selectedStudentIds.has(s.id)} onChange={() => toggleStudent(s.id)} />
                    <span>
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-mentor-text-muted text-xs">{s.email}</span>
                  </label>
                ))}
                {filteredStudentsForAssign.length === 0 && (
                  <p className="text-xs text-mentor-text-muted px-2 py-1.5">No active students match.</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Due Date (optional)</label>
                <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Instructions (optional)</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="input"
                rows={2}
                maxLength={1000}
              />
            </div>

            {assignResult && (
              <div className="surface-muted p-4">
                <p className="text-sm font-medium text-mentor-text mb-2">
                  {assignResult.assigned} assigned, {assignResult.failed} failed of {assignResult.total}
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {assignResult.results.map((row) => (
                    <div key={row.studentId} className="flex items-center gap-2 text-xs">
                      <span className={`badge ${row.status === 'assigned' ? 'badge-success' : 'badge-warning'}`}>
                        {studentLabel(row.studentId)}: {row.status}
                      </span>
                      {row.error && <span className="text-mentor-error">{row.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button type="submit" disabled={assignSubmitting} className="btn btn-primary">
                {assignSubmitting ? 'Assigning...' : 'Assign Interview'}
              </button>
              <button type="button" onClick={() => setShowAssign(false)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </form>
        )}

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
            <button onClick={() => setActionError(null)} className="ml-auto shrink-0" aria-label="Dismiss">
              <X size={14} className="text-mentor-error" />
            </button>
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
              <p className="text-sm text-mentor-text-secondary">No interview assignments match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Student
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
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {assignments.map((assignment) => (
                    <tr key={assignment.assignmentId}>
                      <td className="px-6 py-3 text-sm text-mentor-text">{studentLabel(assignment.studentId)}</td>
                      <td className="px-6 py-3">
                        <div className="text-sm text-mentor-text">{templateName(assignment.templateId)}</div>
                        {assignment.instructions && (
                          <div className="text-xs text-mentor-text-muted truncate max-w-xs">{assignment.instructions}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${getStatusBadgeClass(assignment.status)}`}>
                          {assignment.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDate(assignment.dueAt)}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDate(assignment.createdAt)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {assignment.interviewId && (
                            <button
                              onClick={() => navigate(`/interview/${assignment.interviewId}`)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                            >
                              <ExternalLink size={14} />
                              Open
                            </button>
                          )}
                          {canManage && assignment.status === 'assigned' && (
                            <>
                              <button
                                onClick={() => handleStart(assignment)}
                                disabled={actionLoadingId === assignment.assignmentId}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Start interview"
                              >
                                <Play size={14} />
                                Start
                              </button>
                              <button
                                onClick={() => handleCancel(assignment)}
                                disabled={actionLoadingId === assignment.assignmentId}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Cancel assignment"
                              >
                                <Ban size={14} />
                                Cancel
                              </button>
                            </>
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

export default InstituteInterviewAssignmentsPage;
