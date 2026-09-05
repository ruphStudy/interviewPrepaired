import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerCandidate, EmployerCandidateStatus, EmployerCandidateSource, EMPLOYER_CANDIDATE_SOURCES } from '../../api/employerApi';
import { AlertCircle, Loader2, Plus, ChevronLeft, ChevronRight, Users } from 'lucide-react';

const PAGE_LIMIT = 20;

const STATUS_LABELS: Record<EmployerCandidateStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

const STATUS_BADGE: Record<EmployerCandidateStatus, string> = {
  active: 'badge-success',
  inactive: 'badge-warning',
  archived: 'badge-neutral',
};

const sourceLabel = (value?: EmployerCandidateSource) => EMPLOYER_CANDIDATE_SOURCES.find((s) => s.value === value)?.label || value;
const formatDate = (value: string) => new Date(value).toLocaleDateString();

/** Company-only candidate list (18A). List/read requires only ORGANIZATION_VIEW; create controls are gated separately by INTERVIEWS_MANAGE. */
const EmployerCandidatesPage: React.FC = () => {
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

  const [candidates, setCandidates] = useState<EmployerCandidate[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployerCandidateStatus | ''>('');
  const [sourceFilter, setSourceFilter] = useState<EmployerCandidateSource | ''>('');

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchCandidates = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listCandidates(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        search: search || undefined,
      });
      setCandidates(response.data.candidates);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, sourceFilter, search]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchCandidates();
    }
  }, [isSyncing, activeOrganization, canView, fetchCandidates]);

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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Candidates are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view candidates.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Candidates</h1>
            <p className="page-subtitle">Candidate profiles for {activeOrganization.name}.</p>
          </div>
          {canManage && (
            <button
              onClick={() => navigate(`/organizations/${organizationId}/employer/candidates/new`)}
              className="btn btn-primary shrink-0"
            >
              <Plus size={16} />
              New Candidate
            </button>
          )}
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Candidates remain viewable, but creating or managing candidates is disabled.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone, company, title, location..."
            className="input w-full sm:w-72"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as EmployerCandidateStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_LABELS).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s as EmployerCandidateStatus]}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as EmployerCandidateSource | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All sources</option>
            {EMPLOYER_CANDIDATE_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading candidates...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load candidates</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchCandidates} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
                <Users size={22} className="text-primary-600" />
              </div>
              <h3 className="section-title mb-1.5">No candidates yet</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">
                {canManage ? 'Add your first candidate to get started.' : 'No candidates match these filters.'}
              </p>
              {canManage && (
                <button
                  onClick={() => navigate(`/organizations/${organizationId}/employer/candidates/new`)}
                  className="btn btn-primary"
                >
                  <Plus size={16} />
                  New Candidate
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Current Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Experience
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Source</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {candidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      onClick={() => navigate(`/organizations/${organizationId}/employer/candidates/${candidate.id}`)}
                      className="cursor-pointer hover:bg-mentor-surface transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">
                          {candidate.firstName} {candidate.lastName}
                        </div>
                        <div className="text-xs text-mentor-text-muted">{candidate.headline || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        <div>{candidate.email}</div>
                        <div className="text-xs text-mentor-text-muted">{candidate.phone || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {[candidate.currentTitle, candidate.currentCompany].filter(Boolean).join(' at ') || '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{candidate.location || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {candidate.totalExperienceYears !== undefined ? `${candidate.totalExperienceYears} yrs` : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className="badge badge-neutral">{sourceLabel(candidate.source)}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${STATUS_BADGE[candidate.status]}`}>{STATUS_LABELS[candidate.status]}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">
                        {formatDate(candidate.updatedAt)}
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

export default EmployerCandidatesPage;
