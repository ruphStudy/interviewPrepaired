import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerRecruiter, OrganizationMemberStatus, RecruiterInvitation } from '../../api/employerApi';
import organizationApi from '../../api/organizationApi';
import { AlertCircle, Loader2, Search, ChevronLeft, ChevronRight, UserPlus, X, RotateCw, Ban } from 'lucide-react';

const PAGE_LIMIT = 20;

interface InviteRecruiterModalProps {
  organizationId: string;
  onClose: () => void;
  onInvited: () => void;
}

const InviteRecruiterModal: React.FC<InviteRecruiterModalProps> = ({ organizationId, onClose, onInvited }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await employerApi.inviteRecruiter(organizationId, { name: name.trim() || undefined, email: email.trim() });
      onInvited();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to invite recruiter');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title text-lg">Invite Recruiter</h2>
          <button onClick={onClose} className="text-mentor-text-muted hover:text-mentor-text" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-mentor-text-secondary mb-4">
          If this email already has an EnterSkill account, they'll be added directly. Otherwise a new account is created and they'll
          receive a set-password link.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-mentor-text-muted mb-1">Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input w-full" maxLength={50} />
          </div>
          <div>
            <label className="block text-xs font-medium text-mentor-text-muted mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full"
              maxLength={254}
            />
          </div>
          {error && <p className="text-sm text-mentor-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !email.trim()} className="btn btn-primary">
              {submitting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const EmployerRecruitersPage: React.FC = () => {
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

  const [recruiters, setRecruiters] = useState<EmployerRecruiter[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrganizationMemberStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<RecruiterInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(true);
  const canManage = hasPermission('members:manage');

  const fetchPendingInvitations = useCallback(async () => {
    if (!organizationId) return;
    setInvitationsLoading(true);
    try {
      const response = await employerApi.listRecruiterInvitations(organizationId, { page: 1, limit: 50, status: 'pending' });
      setPendingInvitations(response.data.invitations);
    } catch {
      // Non-fatal — the main recruiter list is the primary surface.
    } finally {
      setInvitationsLoading(false);
    }
  }, [organizationId]);

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!organizationId) return;
    try {
      await organizationApi.revokeInvitation(organizationId, invitationId);
      fetchPendingInvitations();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke invitation');
    }
  };

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('members:view');
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchRecruiters = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listRecruiters(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        search: search || undefined,
      });
      setRecruiters(response.data.recruiters);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load recruiters');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, search]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company') fetchRecruiters();
  }, [isSyncing, activeOrganization, fetchRecruiters]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canManage) fetchPendingInvitations();
  }, [isSyncing, activeOrganization, canManage, fetchPendingInvitations]);

  const handleInvited = () => {
    fetchPendingInvitations();
    fetchRecruiters();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchRecruiters();
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Recruiters are only available for employer organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view recruiters.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header flex items-start justify-between gap-4">
          <div>
            <h1 className="page-title">Recruiters</h1>
            <p className="page-subtitle">
              Recruiters &amp; hiring managers for {activeOrganization.name}. An existing EnterSkill user can also be added directly on
              the Members page; per-job Hiring Manager assignment happens on that job's page.
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowInviteModal(true)} className="btn btn-primary shrink-0">
              <UserPlus size={16} />
              Invite Recruiter
            </button>
          )}
        </div>

        {canManage && !invitationsLoading && pendingInvitations.length > 0 && (
          <div className="card mb-4">
            <h2 className="text-sm font-semibold text-mentor-text mb-3">Pending Invitations ({pendingInvitations.length})</h2>
            <div className="divide-y divide-mentor-border">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium text-mentor-text">{invitation.email}</div>
                    <div className="text-xs text-mentor-text-muted">
                      Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => employerApi.resendRecruiterInvitation(organizationId!, invitation.email).then(fetchPendingInvitations)}
                      className="btn btn-secondary px-3 py-1.5 text-xs"
                      title="Resend"
                    >
                      <RotateCw size={13} />
                      Resend
                    </button>
                    <button
                      onClick={() => handleRevokeInvitation(invitation.id)}
                      className="btn btn-secondary px-3 py-1.5 text-xs text-mentor-error"
                      title="Revoke"
                    >
                      <Ban size={13} />
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showInviteModal && organizationId && (
          <InviteRecruiterModal organizationId={organizationId} onClose={() => setShowInviteModal(false)} onInvited={handleInvited} />
        )}

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
              setStatusFilter(e.target.value as OrganizationMemberStatus | '');
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
              <p className="text-mentor-text-muted text-sm">Loading recruiters...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load recruiters</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchRecruiters} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : recruiters.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No recruiters match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Recruiter
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {recruiters.map((recruiter) => (
                    <tr key={recruiter.membershipId} className="hover:bg-mentor-surface dark:hover:bg-future-elevated">
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{recruiter.user?.name || 'Unknown user'}</div>
                        <div className="text-xs text-mentor-text-muted">{recruiter.user?.email || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {recruiter.joinedAt ? new Date(recruiter.joinedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`badge ${recruiter.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}>
                          {recruiter.status}
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

export default EmployerRecruitersPage;
