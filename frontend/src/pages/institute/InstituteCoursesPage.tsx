import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { InstituteCourse, InstituteBranch, InstituteEntityStatus, CoursePayload } from '../../api/instituteApi';
import { AlertCircle, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_LIMIT = 20;

const EMPTY_FORM: CoursePayload = { name: '', branchId: '', code: '', description: '', durationMonths: null };

const InstituteCoursesPage: React.FC = () => {
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

  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [branches, setBranches] = useState<InstituteBranch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<'closed' | 'create' | string>('closed');
  const [form, setForm] = useState<CoursePayload>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canEdit = hasPermission('organization:update') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;

  const fetchBranches = useCallback(async () => {
    if (!organizationId) return;
    try {
      const response = await instituteApi.listBranches(organizationId, { limit: 100 });
      setBranches(response.data.branches);
    } catch {
      // Non-fatal for the page itself — branch names/filter just won't populate.
    }
  }, [organizationId]);

  const fetchCourses = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listCourses(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        branchId: branchFilter || undefined,
      });
      setCourses(response.data.courses);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, branchFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') {
      fetchBranches();
      fetchCourses();
    }
  }, [isSyncing, activeOrganization, fetchBranches, fetchCourses]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormMode('create');
  };

  const openEdit = (course: InstituteCourse) => {
    setForm({
      name: course.name,
      branchId: course.branchId || '',
      code: course.code || '',
      description: course.description || '',
      durationMonths: course.durationMonths ?? null,
    });
    setFormError(null);
    setFormMode(course.id);
  };

  const closeForm = () => setFormMode('closed');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.name?.trim()) {
      setFormError('Name is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload: CoursePayload = {
      ...form,
      branchId: form.branchId || null,
      durationMonths: form.durationMonths || null,
    };
    try {
      if (formMode === 'create') {
        await instituteApi.createCourse(organizationId, payload);
      } else {
        await instituteApi.updateCourse(organizationId, formMode, payload);
      }
      setFormMode('closed');
      fetchCourses();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save course');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (course: InstituteCourse) => {
    if (!organizationId) return;
    if (!window.confirm(`Deactivate course "${course.name}"?`)) return;
    setActionError(null);
    try {
      await instituteApi.deactivateCourse(organizationId, course.id);
      fetchCourses();
    } catch (err: any) {
      setActionError(err.message || 'Failed to deactivate course');
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
            <p className="text-sm text-mentor-text-secondary">Courses are only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Courses</h1>
          <p className="page-subtitle">Manage the courses offered by {activeOrganization.name}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={branchFilter}
            onChange={(e) => {
              setBranchFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as InstituteEntityStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {canEdit && (
            <button onClick={openCreate} className="btn btn-primary ml-auto">
              <Plus size={16} />
              Add Course
            </button>
          )}
        </div>

        {formMode !== 'closed' && (
          <form onSubmit={handleSubmit} className="card mb-4 space-y-4">
            {formError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{formError}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input
                  type="text"
                  value={form.name || ''}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input"
                  maxLength={150}
                />
              </div>
              <div>
                <label className="label">Code (optional)</label>
                <input
                  type="text"
                  value={form.code || ''}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  className="input"
                  maxLength={50}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Branch (optional)</label>
                <select
                  value={form.branchId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                  className="input"
                >
                  <option value="">No branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Duration (months, optional)</label>
                <input
                  type="number"
                  min={1}
                  value={form.durationMonths ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, durationMonths: e.target.value === '' ? null : Number(e.target.value) }))
                  }
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input"
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving...' : formMode === 'create' ? 'Create Course' : 'Save Changes'}
              </button>
              <button type="button" onClick={closeForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}

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
              <p className="text-mentor-text-muted text-sm">Loading courses...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load courses</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchCourses} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : courses.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No courses match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Course
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Branch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                    {canEdit && (
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {courses.map((course) => (
                    <tr key={course.id}>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{course.name}</div>
                        <div className="text-xs text-mentor-text-muted">{course.code || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{branchName(course.branchId) || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {course.durationMonths ? `${course.durationMonths} months` : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${course.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {course.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(course)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Edit course"
                            >
                              <Pencil size={14} />
                            </button>
                            {course.status === 'active' && (
                              <button
                                onClick={() => handleDeactivate(course)}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Deactivate course"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
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

export default InstituteCoursesPage;
