import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerJob, JobDescriptionSource, EmployerJobDescriptionSourceType } from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, CheckCircle2, Eye, X, FileText } from 'lucide-react';

const JD_MIN_LENGTH = 50;
const JD_MAX_LENGTH = 50000;

const SOURCE_TYPE_OPTIONS: Array<{ value: EmployerJobDescriptionSourceType; label: string }> = [
  { value: 'pasted', label: 'Pasted' },
  { value: 'manual', label: 'Manually written' },
];

const sourceTypeLabel = (value: EmployerJobDescriptionSourceType) =>
  SOURCE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value;
const formatDateTime = (value: string) => new Date(value).toLocaleString();

/**
 * Job Description intake/editor (17A) — raw text only, no AI parsing/skill
 * extraction/competency generation. Saving ALWAYS creates the next version;
 * it never overwrites an existing one. Read-only whenever the caller lacks
 * INTERVIEWS_MANAGE, the organization is archived, or the job itself is
 * archived.
 */
const EmployerJobDescriptionPage: React.FC = () => {
  const { organizationId, jobId } = useParams<{ organizationId: string; jobId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [job, setJob] = useState<EmployerJob | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);

  const [current, setCurrent] = useState<JobDescriptionSource | null>(null);
  const [history, setHistory] = useState<JobDescriptionSource[]>([]);
  const [jdLoading, setJdLoading] = useState(true);
  const [jdError, setJdError] = useState<string | null>(null);

  const [rawText, setRawText] = useState('');
  const [sourceType, setSourceType] = useState<EmployerJobDescriptionSourceType>('pasted');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [viewingVersion, setViewingVersion] = useState<JobDescriptionSource | null>(null);
  const [viewingLoading, setViewingLoading] = useState(false);
  const [viewingError, setViewingError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived' && job?.status !== 'archived';

  const fetchJob = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setJobLoading(true);
    setJobError(null);
    try {
      const response = await employerApi.getJob(organizationId, jobId);
      setJob(response.data.job);
    } catch (err: any) {
      setJobError(err.message || 'Failed to load job');
    } finally {
      setJobLoading(false);
    }
  }, [organizationId, jobId]);

  const fetchJobDescription = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setJdLoading(true);
    setJdError(null);
    try {
      const response = await employerApi.getJobDescriptionSources(organizationId, jobId);
      setCurrent(response.data.current);
      setHistory(response.data.history);
      // Prefill the editor with the current version's text — this only
      // ever runs on mount and right after a successful save (below), so it
      // never discards an in-progress edit.
      setRawText(response.data.current?.rawText || '');
      setSourceType('pasted');
    } catch (err: any) {
      setJdError(err.message || 'Failed to load job description');
    } finally {
      setJdLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJob();
      fetchJobDescription();
    }
  }, [isSyncing, activeOrganization, canView, fetchJob, fetchJobDescription]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !jobId) return;
    const trimmed = rawText.trim();
    if (trimmed.length < JD_MIN_LENGTH) {
      setSaveError(`Job description must be at least ${JD_MIN_LENGTH} characters`);
      return;
    }
    if (trimmed.length > JD_MAX_LENGTH) {
      setSaveError(`Job description must be at most ${JD_MAX_LENGTH} characters`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const response = await employerApi.createJobDescriptionSource(organizationId, jobId, { rawText: trimmed, sourceType });
      setCurrent(response.data.source);
      setRawText(response.data.source.rawText);
      setSourceType('pasted');
      setViewingVersion(null);
      setSaveSuccess(`Saved as version ${response.data.source.version}.`);
      setTimeout(() => setSaveSuccess(null), 3000);
      const jdResponse = await employerApi.getJobDescriptionSources(organizationId, jobId);
      setHistory(jdResponse.data.history);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save job description');
    } finally {
      setSaving(false);
    }
  };

  const handleViewVersion = async (source: JobDescriptionSource) => {
    if (!organizationId || !jobId) return;
    setViewingError(null);
    setViewingLoading(true);
    try {
      const response = await employerApi.getJobDescriptionSource(organizationId, jobId, source.id);
      setViewingVersion(response.data.source);
    } catch (err: any) {
      setViewingError(err.message || 'Failed to load version');
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Job descriptions are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view this job description.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <Link
          to={`/organizations/${organizationId}/employer/jobs/${jobId}`}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Job
        </Link>

        {jobLoading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading job...</p>
          </div>
        ) : jobError || !job ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load job</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{jobError || 'Job not found'}</p>
            <button onClick={fetchJob} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header">
              <h1 className="page-title flex items-center gap-2">
                <FileText size={22} className="text-primary-600" />
                Job Description
              </h1>
              <p className="page-subtitle">{job.title}</p>
            </div>

            {activeOrganization.status === 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">
                  This organization is archived. The job description is read-only.
                </p>
              </div>
            )}
            {activeOrganization.status !== 'archived' && job.status === 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">
                  This job is archived. The job description is read-only.
                </p>
              </div>
            )}

            {jdLoading ? (
              <div className="card p-10 text-center">
                <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
                <p className="text-mentor-text-muted text-sm">Loading job description...</p>
              </div>
            ) : jdError ? (
              <div className="card p-10 text-center">
                <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
                <h3 className="section-title mb-1.5">Couldn't load job description</h3>
                <p className="text-sm text-mentor-text-secondary mb-5">{jdError}</p>
                <button onClick={fetchJobDescription} className="btn btn-primary">
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {viewingVersion ? (
                  <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="badge badge-neutral">Version {viewingVersion.version}</span>
                        <span className="badge badge-neutral">{sourceTypeLabel(viewingVersion.sourceType)}</span>
                        <span className="text-xs text-mentor-text-muted">{formatDateTime(viewingVersion.createdAt)}</span>
                      </div>
                      <button onClick={() => setViewingVersion(null)} className="btn btn-secondary px-3 py-1.5 text-xs">
                        <X size={14} />
                        Close
                      </button>
                    </div>
                    <p className="text-sm text-mentor-text whitespace-pre-wrap">{viewingVersion.rawText}</p>
                  </div>
                ) : (
                  <form onSubmit={handleSave} className="card mb-6">
                    {saveError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{saveError}</p>
                      </div>
                    )}
                    {saveSuccess && (
                      <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-4">
                        <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-success">{saveSuccess}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Raw Job Description</label>
                      {current && <span className="badge badge-info">Current: Version {current.version}</span>}
                    </div>
                    <textarea
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      readOnly={!canManage}
                      className="input font-mono text-xs"
                      rows={16}
                      maxLength={JD_MAX_LENGTH}
                      placeholder="Paste or write the full job description here..."
                    />
                    <p className="text-xs text-mentor-text-muted mt-1.5">
                      {rawText.trim().length} / {JD_MAX_LENGTH} characters (minimum {JD_MIN_LENGTH})
                    </p>

                    {canManage && (
                      <>
                        <div className="sm:w-1/3 mt-4">
                          <label className="label">Source Type</label>
                          <select
                            value={sourceType}
                            onChange={(e) => setSourceType(e.target.value as EmployerJobDescriptionSourceType)}
                            className="input"
                          >
                            {SOURCE_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mt-4">
                          <button type="submit" disabled={saving} className="btn btn-primary">
                            {saving ? 'Saving...' : 'Save New Version'}
                          </button>
                          <p className="text-xs text-mentor-text-muted mt-2">
                            Saving creates a new version — it never overwrites the current one.
                          </p>
                        </div>
                      </>
                    )}
                  </form>
                )}

                <div className="card p-0 overflow-hidden">
                  <div className="px-6 py-4 border-b border-mentor-border">
                    <h2 className="section-title mb-0">Version History</h2>
                  </div>
                  {viewingError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 m-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{viewingError}</p>
                    </div>
                  )}
                  {history.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary text-center py-8">No versions yet.</p>
                  ) : (
                    <div className="divide-y divide-mentor-border">
                      {history.map((source) => (
                        <div key={source.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-3.5">
                          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                            <span className={`badge ${source.id === current?.id ? 'badge-success' : 'badge-neutral'}`}>
                              {source.id === current?.id ? `Current (v${source.version})` : `Version ${source.version}`}
                            </span>
                            <span className="text-xs text-mentor-text-muted">{sourceTypeLabel(source.sourceType)}</span>
                            <span className="text-xs text-mentor-text-muted">{formatDateTime(source.createdAt)}</span>
                          </div>
                          <button
                            onClick={() => handleViewVersion(source)}
                            disabled={viewingLoading}
                            className="btn btn-secondary px-3 py-1.5 text-xs shrink-0"
                          >
                            <Eye size={14} />
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerJobDescriptionPage;
