import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  InstituteBatch,
  InstituteCourse,
  InstituteBranch,
  InstituteEntityStatus,
  BatchPayload,
} from '../../api/instituteApi';
import { AlertCircle, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_LIMIT = 20;

const EMPTY_FORM: BatchPayload = {
  name: '',
  courseId: '',
  branchId: '',
  code: '',
  academicYear: '',
  startDate: '',
  endDate: '',
  capacity: null,
};

const toDateInput = (value?: string) => (value ? value.slice(0, 10) : '');

const InstituteBatchesPage: React.FC = () => {
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

  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [branches, setBranches] = useState<InstituteBranch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [courseFilter, setCourseFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<'closed' | 'create' | string>('closed');
  const [form, setForm] = useState<BatchPayload>(EMPTY_FORM);
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
  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name;
  const branchName = (id?: string) => branches.find((b) => b.id === id)?.name;
  const selectedCourse = courses.find((c) => c.id === form.courseId);

  const fetchOptions = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [coursesResponse, branchesResponse] = await Promise.all([
        instituteApi.listCourses(organizationId, { limit: 100 }),
        instituteApi.listBranches(organizationId, { limit: 100 }),
      ]);
      setCourses(coursesResponse.data.courses);
      setBranches(branchesResponse.data.branches);
    } catch {
      // Non-fatal for the page itself — filter/form option labels just won't populate.
    }
  }, [organizationId]);

  const fetchBatches = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listBatches(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
      });
      setBatches(response.data.batches);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, courseFilter, branchFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') {
      fetchOptions();
      fetchBatches();
    }
  }, [isSyncing, activeOrganization, fetchOptions, fetchBatches]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormMode('create');
  };

  const openEdit = (batch: InstituteBatch) => {
    setForm({
      name: batch.name,
      courseId: batch.courseId,
      branchId: batch.branchId || '',
      code: batch.code || '',
      academicYear: batch.academicYear || '',
      startDate: toDateInput(batch.startDate),
      endDate: toDateInput(batch.endDate),
      capacity: batch.capacity ?? null,
    });
    setFormError(null);
    setFormMode(batch.id);
  };

  const closeForm = () => setFormMode('closed');

  // The course's own branch (if it has one) is authoritative on the backend
  // — auto-fill and lock the branch field to it rather than letting the
  // form submit an obviously-mismatched combination.
  const handleCourseChange = (courseId: string) => {
    const course = courses.find((c) => c.id === courseId);
    setForm((f) => ({ ...f, courseId, branchId: course?.branchId || f.branchId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.name?.trim()) {
      setFormError('Name is required');
      return;
    }
    if (formMode === 'create' && !form.courseId) {
      setFormError('Course is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const payload: BatchPayload = {
      ...form,
      branchId: form.branchId || null,
      academicYear: form.academicYear || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      capacity: form.capacity || null,
    };
    try {
      if (formMode === 'create') {
        await instituteApi.createBatch(organizationId, payload);
      } else {
        await instituteApi.updateBatch(organizationId, formMode, payload);
      }
      setFormMode('closed');
      fetchBatches();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save batch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (batch: InstituteBatch) => {
    if (!organizationId) return;
    if (!window.confirm(`Deactivate batch "${batch.name}"?`)) return;
    setActionError(null);
    try {
      await instituteApi.deactivateBatch(organizationId, batch.id);
      fetchBatches();
    } catch (err: any) {
      setActionError(err.message || 'Failed to deactivate batch');
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
            <p className="text-sm text-mentor-text-secondary">Batches are only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Batches</h1>
          <p className="page-subtitle">Manage student batches/cohorts for {activeOrganization.name}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
              Add Batch
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
                <label className="label">Course</label>
                <select value={form.courseId || ''} onChange={(e) => handleCourseChange(e.target.value)} className="input">
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">
                  Branch {selectedCourse?.branchId ? '(set by course)' : '(optional)'}
                </label>
                <select
                  value={form.branchId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                  disabled={!!selectedCourse?.branchId}
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Academic Year (optional)</label>
                <input
                  type="text"
                  value={form.academicYear || ''}
                  onChange={(e) => setForm((f) => ({ ...f, academicYear: e.target.value }))}
                  className="input"
                  placeholder="e.g. 2025-26"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="label">Start Date (optional)</label>
                <input
                  type="date"
                  value={form.startDate || ''}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">End Date (optional)</label>
                <input
                  type="date"
                  value={form.endDate || ''}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="input"
                />
              </div>
            </div>
            <div className="sm:w-1/3">
              <label className="label">Capacity (optional)</label>
              <input
                type="number"
                min={1}
                value={form.capacity ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value === '' ? null : Number(e.target.value) }))}
                className="input"
              />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving...' : formMode === 'create' ? 'Create Batch' : 'Save Changes'}
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
              <p className="text-mentor-text-muted text-sm">Loading batches...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load batches</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchBatches} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : batches.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No batches match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Batch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Course / Branch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Academic Year
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Dates
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Capacity
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
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{batch.name}</div>
                        <div className="text-xs text-mentor-text-muted">{batch.code || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {courseName(batch.courseId) || '—'}
                        {batch.branchId ? ` · ${branchName(batch.branchId) || '—'}` : ''}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{batch.academicYear || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {batch.startDate ? new Date(batch.startDate).toLocaleDateString() : '—'}
                        {' – '}
                        {batch.endDate ? new Date(batch.endDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{batch.capacity ?? '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${batch.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {batch.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(batch)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Edit batch"
                            >
                              <Pencil size={14} />
                            </button>
                            {batch.status === 'active' && (
                              <button
                                onClick={() => handleDeactivate(batch)}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Deactivate batch"
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

export default InstituteBatchesPage;
