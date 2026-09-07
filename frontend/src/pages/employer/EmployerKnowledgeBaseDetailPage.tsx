import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { OrganizationKnowledgeBase, OrganizationKnowledgeDocument, OrganizationKnowledgeRetrievalResultItem } from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, Upload, FileText, X, Search } from 'lucide-react';

const formatDate = (value: string) => new Date(value).toLocaleDateString();
const formatSize = (bytes?: number) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
  archived: 'Archived',
};
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  processing: 'badge-warning',
  ready: 'badge-success',
  failed: 'badge-warning',
  archived: 'badge-neutral',
};

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.txt';

const INDEX_STATUS_LABEL: Record<string, string> = {
  not_indexed: 'Not indexed',
  processing: 'Processing',
  ready: 'Ready',
  partial: 'Partial',
  failed: 'Failed',
};
const INDEX_STATUS_BADGE: Record<string, string> = {
  not_indexed: 'badge-neutral',
  processing: 'badge-warning',
  ready: 'badge-success',
  partial: 'badge-warning',
  failed: 'badge-warning',
};

/**
 * Organization Knowledge Base detail (29A) + document upload/parsing
 * (29B). NO embeddings, NO vector search, NO AI. Parsed text stays
 * employer-internal — never exposed to any candidate/public API.
 */
const EmployerKnowledgeBaseDetailPage: React.FC = () => {
  const { organizationId, knowledgeBaseId } = useParams<{ organizationId: string; knowledgeBaseId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [knowledgeBase, setKnowledgeBase] = useState<OrganizationKnowledgeBase | null>(null);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<OrganizationKnowledgeDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [showTextForm, setShowTextForm] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textDescription, setTextDescription] = useState('');
  const [textBody, setTextBody] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [saveTextError, setSaveTextError] = useState<string | null>(null);

  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [actionErrorById, setActionErrorById] = useState<Record<string, string>>({});

  const [viewingDocumentId, setViewingDocumentId] = useState<string | null>(null);
  const [viewingContent, setViewingContent] = useState<string | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);

  const [indexingId, setIndexingId] = useState<string | null>(null);

  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<OrganizationKnowledgeRetrievalResultItem[] | null>(null);
  const [testSearching, setTestSearching] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('question-sets:view');
  const canManage = hasPermission('question-sets:manage') && activeOrganization?.status !== 'archived';
  const kbActive = knowledgeBase?.status === 'active';

  const fetchKnowledgeBase = useCallback(async () => {
    if (!organizationId || !knowledgeBaseId) return;
    setKbLoading(true);
    setKbError(null);
    try {
      const response = await employerApi.getOrganizationKnowledgeBase(organizationId, knowledgeBaseId);
      setKnowledgeBase(response.data);
    } catch (err: any) {
      setKbError(err.message || 'Failed to load knowledge base');
    } finally {
      setKbLoading(false);
    }
  }, [organizationId, knowledgeBaseId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchKnowledgeBase();
    }
  }, [isSyncing, activeOrganization, canView, fetchKnowledgeBase]);

  const fetchDocuments = useCallback(async () => {
    if (!organizationId || !knowledgeBaseId) return;
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const response = await employerApi.listOrganizationKnowledgeDocuments(organizationId, knowledgeBaseId);
      setDocuments(response.data.documents);
    } catch (err: any) {
      setDocumentsError(err.message || 'Failed to load documents');
    } finally {
      setDocumentsLoading(false);
    }
  }, [organizationId, knowledgeBaseId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchDocuments();
    }
  }, [isSyncing, activeOrganization, canView, fetchDocuments]);

  const handleUpload = async () => {
    if (!organizationId || !knowledgeBaseId) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      await employerApi.uploadOrganizationKnowledgeDocument(organizationId, knowledgeBaseId, file, uploadTitle || undefined);
      setUploadTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !knowledgeBaseId) return;
    setSavingText(true);
    setSaveTextError(null);
    try {
      await employerApi.createOrganizationKnowledgeTextDocument(organizationId, knowledgeBaseId, {
        title: textTitle,
        description: textDescription || undefined,
        text: textBody,
      });
      setShowTextForm(false);
      setTextTitle('');
      setTextDescription('');
      setTextBody('');
      fetchDocuments();
    } catch (err: any) {
      setSaveTextError(err.message || 'Failed to create document');
    } finally {
      setSavingText(false);
    }
  };

  const handleReprocess = async (documentId: string) => {
    if (!organizationId || !knowledgeBaseId) return;
    setActionPendingId(documentId);
    setActionErrorById((prev) => ({ ...prev, [documentId]: '' }));
    try {
      await employerApi.reprocessOrganizationKnowledgeDocument(organizationId, knowledgeBaseId, documentId);
      fetchDocuments();
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [documentId]: err.message || 'Failed to reprocess document' }));
    } finally {
      setActionPendingId(null);
    }
  };

  const handleArchiveDocument = async (documentId: string) => {
    if (!organizationId || !knowledgeBaseId) return;
    if (!window.confirm('Archive this document? It will no longer be eligible for future knowledge features.')) return;
    setActionPendingId(documentId);
    setActionErrorById((prev) => ({ ...prev, [documentId]: '' }));
    try {
      await employerApi.archiveOrganizationKnowledgeDocument(organizationId, knowledgeBaseId, documentId);
      fetchDocuments();
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [documentId]: err.message || 'Failed to archive document' }));
    } finally {
      setActionPendingId(null);
    }
  };

  const handleIndexDocument = async (documentId: string) => {
    if (!organizationId || !knowledgeBaseId) return;
    setIndexingId(documentId);
    setActionErrorById((prev) => ({ ...prev, [documentId]: '' }));
    try {
      await employerApi.indexOrganizationKnowledgeDocument(organizationId, knowledgeBaseId, documentId);
      fetchDocuments();
    } catch (err: any) {
      setActionErrorById((prev) => ({ ...prev, [documentId]: err.message || 'Failed to index document' }));
    } finally {
      setIndexingId(null);
    }
  };

  const handleTestRetrieval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !testQuery.trim()) return;
    setTestSearching(true);
    setTestError(null);
    try {
      const response = await employerApi.searchOrganizationKnowledge(organizationId, {
        query: testQuery.trim(),
        knowledgeBaseIds: knowledgeBaseId ? [knowledgeBaseId] : undefined,
      });
      setTestResults(response.data.results);
    } catch (err: any) {
      setTestError(err.message || 'Search failed');
      setTestResults(null);
    } finally {
      setTestSearching(false);
    }
  };

  const handleViewParsedText = async (documentId: string) => {
    if (!organizationId || !knowledgeBaseId) return;
    setViewingDocumentId(documentId);
    setViewingContent(null);
    setViewingLoading(true);
    setViewingError(null);
    try {
      const response = await employerApi.getOrganizationKnowledgeDocumentContent(organizationId, knowledgeBaseId, documentId);
      setViewingContent(response.data.rawText);
    } catch (err: any) {
      setViewingError(err.message || 'Failed to load parsed text');
    } finally {
      setViewingLoading(false);
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

  if (activeOrganization.type !== 'company' || !canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have access to this knowledge base.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <Link
          to={`/organizations/${organizationId}/employer/knowledge-base`}
          className="inline-flex items-center gap-1 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Knowledge Base
        </Link>

        {kbLoading ? (
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        ) : kbError || !knowledgeBase ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-mentor-error mb-2">{kbError || 'Knowledge base not found'}</p>
            <button onClick={fetchKnowledgeBase} className="btn btn-secondary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="page-title">{knowledgeBase.name}</h1>
              <span className={`badge ${knowledgeBase.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>{knowledgeBase.status}</span>
            </div>
            {knowledgeBase.description && <p className="text-sm text-mentor-text-secondary mb-6">{knowledgeBase.description}</p>}

            <div className="card">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 className="section-title">Documents</h2>
              </div>

              {!kbActive && (
                <p className="text-xs text-mentor-warning mb-4">This knowledge base is archived and read-only.</p>
              )}

              {canManage && kbActive && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="surface-muted p-4">
                    <p className="text-sm font-medium text-mentor-text mb-2">Upload Document</p>
                    <p className="text-xs text-mentor-text-muted mb-2">Accepted formats: PDF, DOCX, TXT</p>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="input mb-2"
                      maxLength={200}
                    />
                    <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} className="input mb-2" />
                    {uploadError && <p className="text-xs text-mentor-error mb-2">{uploadError}</p>}
                    <button onClick={handleUpload} disabled={uploading} className="btn btn-primary px-3 py-1.5 text-xs">
                      <Upload size={14} />
                      {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>

                  <div className="surface-muted p-4">
                    <p className="text-sm font-medium text-mentor-text mb-2">Add Text</p>
                    {!showTextForm ? (
                      <button onClick={() => setShowTextForm(true)} className="btn btn-secondary px-3 py-1.5 text-xs">
                        <FileText size={14} />
                        Add Text Document
                      </button>
                    ) : (
                      <form onSubmit={handleCreateText} className="space-y-2">
                        <input
                          value={textTitle}
                          onChange={(e) => setTextTitle(e.target.value)}
                          placeholder="Title"
                          className="input"
                          maxLength={200}
                        />
                        <input
                          value={textDescription}
                          onChange={(e) => setTextDescription(e.target.value)}
                          placeholder="Description (optional)"
                          className="input"
                          maxLength={1000}
                        />
                        <textarea
                          value={textBody}
                          onChange={(e) => setTextBody(e.target.value)}
                          placeholder="Paste or type the text content..."
                          className="input"
                          rows={5}
                        />
                        {saveTextError && <p className="text-xs text-mentor-error">{saveTextError}</p>}
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={savingText || !textTitle.trim() || !textBody.trim()}
                            className="btn btn-primary px-3 py-1.5 text-xs"
                          >
                            {savingText ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowTextForm(false)}
                            className="btn btn-secondary px-3 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {documentsLoading ? (
                <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
              ) : documentsError ? (
                <div>
                  <p className="text-sm text-mentor-error mb-2">{documentsError}</p>
                  <button onClick={fetchDocuments} className="btn btn-secondary">
                    Try Again
                  </button>
                </div>
              ) : documents.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No documents yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                        <th className="py-2 pr-3">Title</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Indexing</th>
                        <th className="py-2 pr-3">Size</th>
                        <th className="py-2 pr-3">Words</th>
                        <th className="py-2 pr-3">Created</th>
                        <th className="py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((d) => (
                        <tr key={d.id} className="border-b border-mentor-border last:border-0 align-top">
                          <td className="py-2 pr-3 text-mentor-text">
                            {d.title}
                            {d.originalFileName && <p className="text-xs text-mentor-text-muted">{d.originalFileName}</p>}
                          </td>
                          <td className="py-2 pr-3 text-mentor-text-secondary capitalize">{d.sourceType}</td>
                          <td className="py-2 pr-3">
                            <span className={`badge ${STATUS_BADGE[d.status] || 'badge-neutral'}`}>{STATUS_LABEL[d.status] || d.status}</span>
                            {d.status === 'failed' && d.parseError && (
                              <p className="text-xs text-mentor-error mt-1 max-w-[200px]">{d.parseError}</p>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`badge ${INDEX_STATUS_BADGE[d.indexStatus] || 'badge-neutral'}`}>
                              {INDEX_STATUS_LABEL[d.indexStatus] || d.indexStatus}
                            </span>
                            {typeof d.chunkCount === 'number' && (
                              <p className="text-xs text-mentor-text-muted mt-1">
                                {d.indexedChunkCount ?? 0}/{d.chunkCount} chunks indexed
                              </p>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-mentor-text-secondary">{formatSize(d.fileSizeBytes)}</td>
                          <td className="py-2 pr-3 text-mentor-text-secondary">{d.wordCount ?? '—'}</td>
                          <td className="py-2 pr-3 text-mentor-text-secondary whitespace-nowrap">{formatDate(d.createdAt)}</td>
                          <td className="py-2 pr-3">
                            {actionErrorById[d.id] && <p className="text-xs text-mentor-error mb-1 max-w-[180px]">{actionErrorById[d.id]}</p>}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {d.status === 'ready' && (
                                <button onClick={() => handleViewParsedText(d.id)} className="btn btn-secondary px-2 py-1 text-xs">
                                  View Parsed Text
                                </button>
                              )}
                              {canManage && kbActive && d.status === 'ready' && (
                                <button
                                  onClick={() => handleIndexDocument(d.id)}
                                  disabled={indexingId === d.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  {indexingId === d.id ? 'Indexing...' : d.indexStatus === 'not_indexed' ? 'Index Document' : 'Re-index'}
                                </button>
                              )}
                              {canManage && kbActive && d.status === 'failed' && d.sourceType === 'file' && (
                                <button
                                  onClick={() => handleReprocess(d.id)}
                                  disabled={actionPendingId === d.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  {actionPendingId === d.id ? 'Reprocessing...' : 'Reprocess'}
                                </button>
                              )}
                              {canManage && d.status !== 'archived' && (
                                <button
                                  onClick={() => handleArchiveDocument(d.id)}
                                  disabled={actionPendingId === d.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  Archive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title mb-1">Test Retrieval</h2>
              <p className="text-xs text-mentor-text-muted mb-3">
                Employer-internal only — verifies what indexed content would be retrieved for a query. Never seen by candidates.
              </p>
              <form onSubmit={handleTestRetrieval} className="flex items-center gap-2 mb-4">
                <input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="Search this knowledge base..."
                  className="input flex-1"
                  maxLength={500}
                />
                <button type="submit" disabled={testSearching || !testQuery.trim()} className="btn btn-primary px-3 py-1.5 text-xs">
                  <Search size={14} />
                  {testSearching ? 'Searching...' : 'Search'}
                </button>
              </form>
              {testError && <p className="text-xs text-mentor-error mb-3">{testError}</p>}
              {testResults && testResults.length === 0 && (
                <p className="text-sm text-mentor-text-secondary text-center py-4">No matching indexed content found.</p>
              )}
              {testResults && testResults.length > 0 && (
                <div className="space-y-3">
                  {testResults.map((r) => (
                    <div key={r.chunkId} className="surface-muted p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-sm font-medium text-mentor-text">
                          {r.documentTitle} <span className="text-mentor-text-muted font-normal">· chunk {r.chunkIndex}</span>
                        </p>
                        <span className="text-xs text-mentor-text-muted">score {r.score.toFixed(3)}</span>
                      </div>
                      <p className="text-xs text-mentor-text-secondary whitespace-pre-wrap line-clamp-4">{r.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {viewingDocumentId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setViewingDocumentId(null)}>
            <div className="card max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Parsed Content</h2>
                <button onClick={() => setViewingDocumentId(null)} className="text-mentor-text-muted hover:text-mentor-text">
                  <X size={18} />
                </button>
              </div>
              {viewingLoading ? (
                <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
              ) : viewingError ? (
                <p className="text-sm text-mentor-error">{viewingError}</p>
              ) : (
                <pre className="text-sm text-mentor-text whitespace-pre-wrap font-sans">{viewingContent}</pre>
              )}
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerKnowledgeBaseDetailPage;
