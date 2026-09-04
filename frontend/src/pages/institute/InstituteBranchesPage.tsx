import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { InstituteBranch, InstituteEntityStatus, BranchPayload } from '../../api/instituteApi';
import { AlertCircle, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_LIMIT = 20;

const EMPTY_FORM: BranchPayload = {
  name: '',
  code: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  contactEmail: '',
  contactPhone: '',
};

const InstituteBranchesPage: React.FC = () => {
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

  const [branches, setBranches] = useState<InstituteBranch[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<'closed' | 'create' | string>('closed');
  const [form, setForm] = useState<BranchPayload>(EMPTY_FORM);
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

  const fetchBranches = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listBranches(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
      });
      setBranches(response.data.branches);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load branches');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') fetchBranches();
  }, [isSyncing, activeOrganization, fetchBranches]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormMode('create');
  };

  const openEdit = (branch: InstituteBranch) => {
    setForm({
      name: branch.name,
      code: branch.code || '',
      addressLine1: branch.addressLine1 || '',
      addressLine2: branch.addressLine2 || '',
      city: branch.city || '',
      state: branch.state || '',
      country: branch.country || '',
      postalCode: branch.postalCode || '',
      contactEmail: branch.contactEmail || '',
      contactPhone: branch.contactPhone || '',
    });
    setFormError(null);
    setFormMode(branch.id);
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
    try {
      if (formMode === 'create') {
        await instituteApi.createBranch(organizationId, form);
      } else {
        await instituteApi.updateBranch(organizationId, formMode, form);
      }
      setFormMode('closed');
      fetchBranches();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save branch');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (branch: InstituteBranch) => {
    if (!organizationId) return;
    if (!window.confirm(`Deactivate branch "${branch.name}"?`)) return;
    setActionError(null);
    try {
      await instituteApi.deactivateBranch(organizationId, branch.id);
      fetchBranches();
    } catch (err: any) {
      setActionError(err.message || 'Failed to deactivate branch');
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
            <p className="text-sm text-mentor-text-secondary">Branches are only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Branches</h1>
          <p className="page-subtitle">Manage physical/campus locations for {activeOrganization.name}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
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
              Add Branch
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
                <label className="label">Address Line 1</label>
                <input
                  type="text"
                  value={form.addressLine1 || ''}
                  onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                  className="input"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label">Address Line 2</label>
                <input
                  type="text"
                  value={form.addressLine2 || ''}
                  onChange={(e) => setForm((f) => ({ ...f, addressLine2: e.target.value }))}
                  className="input"
                  maxLength={200}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="label">City</label>
                <input
                  type="text"
                  value={form.city || ''}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label">State</label>
                <input
                  type="text"
                  value={form.state || ''}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label">Country</label>
                <input
                  type="text"
                  value={form.country || ''}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  className="input"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="label">Postal Code</label>
                <input
                  type="text"
                  value={form.postalCode || ''}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                  className="input"
                  maxLength={20}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Contact Email</label>
                <input
                  type="email"
                  value={form.contactEmail || ''}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="input"
                  maxLength={254}
                />
              </div>
              <div>
                <label className="label">Contact Phone</label>
                <input
                  type="text"
                  value={form.contactPhone || ''}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  className="input"
                  maxLength={30}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving...' : formMode === 'create' ? 'Create Branch' : 'Save Changes'}
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
              <p className="text-mentor-text-muted text-sm">Loading branches...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load branches</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchBranches} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : branches.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No branches match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Branch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Contact
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
                  {branches.map((branch) => (
                    <tr key={branch.id}>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{branch.name}</div>
                        <div className="text-xs text-mentor-text-muted">{branch.code || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {[branch.city, branch.state].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {branch.contactEmail || branch.contactPhone || '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${branch.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {branch.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(branch)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Edit branch"
                            >
                              <Pencil size={14} />
                            </button>
                            {branch.status === 'active' && (
                              <button
                                onClick={() => handleDeactivate(branch)}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Deactivate branch"
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

export default InstituteBranchesPage;
