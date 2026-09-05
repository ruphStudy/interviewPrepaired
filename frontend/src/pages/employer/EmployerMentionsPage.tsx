import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerCollaborationMentionItem } from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, AtSign } from 'lucide-react';

const PAGE_LIMIT = 20;
const formatDateTime = (value: string) => new Date(value).toLocaleString();

/**
 * "Mentions" (24B) — in-app discoverability only for notes where the
 * current organization member was explicitly @mentioned. No email/SMS/push
 * delivery. Company-only; requires ORGANIZATION_VIEW.
 */
const EmployerMentionsPage: React.FC = () => {
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

  const [mentions, setMentions] = useState<EmployerCollaborationMentionItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchMentions = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.getEmployerCollaborationMentions(organizationId, page, PAGE_LIMIT);
      setMentions(response.data.mentions);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load mentions');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchMentions();
    }
  }, [isSyncing, activeOrganization, canView, fetchMentions]);

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
            <p className="text-sm text-mentor-text-secondary">Mentions are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view mentions.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <h1 className="page-title flex items-center gap-2 mb-1">
          <AtSign size={20} className="text-mentor-text-muted" />
          Mentions
        </h1>
        <p className="text-sm text-mentor-text-secondary mb-6">Internal notes where you were mentioned — not visible to candidates.</p>

        <div className="card">
          {loading ? (
            <div className="p-8 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{error}</p>
              <button onClick={fetchMentions} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : mentions.length === 0 ? (
            <p className="text-sm text-mentor-text-secondary text-center py-8">No mentions yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-mentor-border">
                {mentions.map((m) => (
                  <li key={m.noteId} className="py-3">
                    <Link
                      to={`/organizations/${organizationId}/employer/applications/${m.applicationId}`}
                      className="block hover:bg-mentor-surface transition-colors -mx-2 px-2 rounded"
                    >
                      <p className="text-sm text-mentor-text">{m.body}</p>
                      <p className="text-xs text-mentor-text-muted mt-1">
                        {m.author.displayName || 'Member'}
                        {m.candidate ? ` · ${m.candidate.firstName} ${m.candidate.lastName}` : ''}
                        {m.jobTitle ? ` · ${m.jobTitle}` : ''} &middot; {formatDateTime(m.createdAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-mentor-border">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-secondary px-3 py-2"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-mentor-text-muted">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="btn btn-secondary px-3 py-2"
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerMentionsPage;
