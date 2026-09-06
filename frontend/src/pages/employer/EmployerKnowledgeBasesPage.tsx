import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { OrganizationKnowledgeBase } from '../../api/employerApi';
import { AlertCircle, Loader2, BookOpen, Plus, X } from 'lucide-react';

const formatDate = (value: string) => new Date(value).toLocaleDateString();

const STATUS_BADGE: Record<string, string> = { active: 'badge-success', archived: 'badge-neutral' };

/**
 * Organization-scoped internal Knowledge Base list (29A) — metadata/
 * foundation only. NO embeddings, NO vector search, NO AI. Belongs to the
 * organization, never to one candidate/application.
 */
const EmployerKnowledgeBasesPage: React.FC = () => {
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

  const [knowledgeBases, setKnowledgeBases] = useState<OrganizationKnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveErrorById, setArchiveErrorById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('question-sets:view');
  const canManage = hasPermission('question-sets:manage') && activeOrganization?.status !== 'archived';

  const fetchKnowledgeBases = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listOrganizationKnowledgeBases(organizationId);
      setKnowledgeBases(response.data.knowledgeBases);
    } catch (err: any) {
      setError(err.message || 'Failed to load knowledge bases');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchKnowledgeBases();
    }
  }, [isSyncing, activeOrganization, canView, fetchKnowledgeBases]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setSaveError(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const handleOpenEdit = (kb: OrganizationKnowledgeBase) => {
    setEditingId(kb.id);
    setName(kb.name);
    setDescription(kb.description || '');
    setSaveError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editingId) {
        await employerApi.updateOrganizationKnowledgeBase(organizationId, editingId, { name, description });
      } else {
        await employerApi.createOrganizationKnowledgeBase(organizationId, { name, description });
      }
      setShowForm(false);
      resetForm();
      fetchKnowledgeBases();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save knowledge base');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (kbId: string) => {
    if (!organizationId) return;
    if (!window.confirm('Archive this knowledge base? It will become read-only.')) return;
    setArchivingId(kbId);
    setArchiveErrorById((prev) => ({ ...prev, [kbId]: '' }));
    try {
      await employerApi.archiveOrganizationKnowledgeBase(organizationId, kbId);
      fetchKnowledgeBases();
    } catch (err: any) {
      setArchiveErrorById((prev) => ({ ...prev, [kbId]: err.message || 'Failed to archive knowledge base' }));
    } finally {
      setArchivingId(null);
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Knowledge Base is only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view the knowledge base.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h1 className="page-title flex items-center gap-2">
            <BookOpen size={20} className="text-mentor-text-muted" />
            Knowledge Base
          </h1>
          {canManage && !showForm && (
            <button onClick={handleOpenCreate} className="btn btn-primary">
              <Plus size={16} />
              Create Knowledge Base
            </button>
          )}
        </div>
        <p className="text-sm text-mentor-text-secondary mb-6">
          Organization-internal knowledge for later interview intelligence features — no AI, no search yet.
        </p>

        {showForm && (
          <form onSubmit={handleSubmit} className="card mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base">{editingId ? 'Edit Knowledge Base' : 'Create Knowledge Base'}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-mentor-text-muted hover:text-mentor-text"
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={200} placeholder="Engineering Standards" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input"
                rows={2}
                maxLength={1000}
                placeholder="Optional description"
              />
            </div>
            {saveError && <p className="text-sm text-mentor-error">{saveError}</p>}
            <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary">
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
            <p className="text-sm text-mentor-text-secondary mb-4">{error}</p>
            <button onClick={fetchKnowledgeBases} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : knowledgeBases.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-mentor-text-secondary">No knowledge bases yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {knowledgeBases.map((kb) => (
              <div key={kb.id} className="card">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <Link
                    to={`/organizations/${organizationId}/employer/knowledge-base/${kb.id}`}
                    className="text-sm font-semibold text-mentor-text hover:underline"
                  >
                    {kb.name}
                  </Link>
                  <span className={`badge ${STATUS_BADGE[kb.status] || 'badge-neutral'}`}>{kb.status}</span>
                </div>
                {kb.description && <p className="text-sm text-mentor-text-secondary mb-2">{kb.description}</p>}
                <p className="text-xs text-mentor-text-muted mb-3">
                  {kb.documentCount} document{kb.documentCount === 1 ? '' : 's'} &middot; Created {formatDate(kb.createdAt)}
                </p>
                {archiveErrorById[kb.id] && <p className="text-xs text-mentor-error mb-2">{archiveErrorById[kb.id]}</p>}
                {canManage && (
                  <div className="flex items-center gap-2">
                    {kb.status === 'active' && (
                      <button onClick={() => handleOpenEdit(kb)} className="btn btn-secondary px-2 py-1 text-xs">
                        Edit
                      </button>
                    )}
                    {kb.status !== 'archived' && (
                      <button
                        onClick={() => handleArchive(kb.id)}
                        disabled={archivingId === kb.id}
                        className="btn btn-secondary px-2 py-1 text-xs"
                      >
                        {archivingId === kb.id ? 'Archiving...' : 'Archive'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerKnowledgeBasesPage;
