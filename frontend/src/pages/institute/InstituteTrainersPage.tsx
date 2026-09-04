import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { Trainer, InstituteEntityStatus } from '../../api/instituteApi';
import { AlertCircle, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_LIMIT = 20;

const InstituteTrainersPage: React.FC = () => {
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

  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('members:view');
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchTrainers = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listTrainers(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setTrainers(response.data.trainers);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, search]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute') fetchTrainers();
  }, [isSyncing, activeOrganization, fetchTrainers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTrainers();
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
            <p className="text-sm text-mentor-text-secondary">Trainers are only available for institute organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view trainers.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Trainers</h1>
          <p className="page-subtitle">
            Institute trainers for {activeOrganization.name}. To add a trainer, assign the Trainer role on the Members page.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mentor-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email"
              className="input pl-9 w-64"
            />
          </div>
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
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading trainers...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load trainers</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchTrainers} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : trainers.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No trainers match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Trainer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Employee Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Designation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Specialization
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {trainers.map((trainer) => (
                    <tr
                      key={trainer.membershipId}
                      className="cursor-pointer hover:bg-mentor-surface dark:hover:bg-future-elevated"
                      onClick={() => navigate(`/organizations/${organizationId}/institute/trainers/${trainer.membershipId}`)}
                    >
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{trainer.user?.name || 'Unknown user'}</div>
                        <div className="text-xs text-mentor-text-muted">{trainer.user?.email || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{trainer.profile?.employeeCode || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{trainer.profile?.designation || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{trainer.profile?.department || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {trainer.profile?.specialization?.join(', ') || '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${trainer.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {trainer.status}
                        </span>
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

export default InstituteTrainersPage;
