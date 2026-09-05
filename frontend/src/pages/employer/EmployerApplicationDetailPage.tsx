import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerJobApplication,
  EmployerJobApplicationStatus,
  EMPLOYER_JOB_APPLICATION_SOURCES,
  EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS,
} from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, CheckCircle2 } from 'lucide-react';

const STATUS_LABELS: Record<EmployerJobApplicationStatus, string> = {
  applied: 'Applied',
  screening: 'Screening',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  archived: 'Archived',
};

const STATUS_BADGE: Record<EmployerJobApplicationStatus, string> = {
  applied: 'badge-info',
  screening: 'badge-info',
  shortlisted: 'badge-warning',
  interview: 'badge-warning',
  offer: 'badge-success',
  hired: 'badge-success',
  rejected: 'badge-neutral',
  withdrawn: 'badge-neutral',
  archived: 'badge-neutral',
};

/** Requires confirmation — these are hard to casually undo for an application's pipeline. */
const CONFIRM_REQUIRED_STATUSES: EmployerJobApplicationStatus[] = ['rejected', 'withdrawn', 'archived'];

function actionLabel(targetStatus: EmployerJobApplicationStatus): string {
  switch (targetStatus) {
    case 'screening':
      return 'Start Screening';
    case 'shortlisted':
      return 'Shortlist';
    case 'interview':
      return 'Move to Interview';
    case 'offer':
      return 'Make Offer';
    case 'hired':
      return 'Mark Hired';
    case 'rejected':
      return 'Reject';
    case 'withdrawn':
      return 'Withdraw';
    case 'archived':
      return 'Archive';
    default:
      return STATUS_LABELS[targetStatus];
  }
}

const sourceLabel = (value?: string) => EMPLOYER_JOB_APPLICATION_SOURCES.find((s) => s.value === value)?.label || value;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');
const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

/**
 * Application detail (18D). Readable with only ORGANIZATION_VIEW — editing
 * (notes/source) and status actions require INTERVIEWS_MANAGE on a
 * non-archived organization, and are additionally blocked once the
 * application itself, its job, or its candidate has been archived. Status
 * only ever changes through the dedicated status endpoint; the backend
 * remains the sole authority on which transitions are valid (this page's
 * button set is a UI convenience mirroring the same transition map, never
 * trusted as the actual gate — no optimistic status mutation).
 */
const EmployerApplicationDetailPage: React.FC = () => {
  const { organizationId, applicationId } = useParams<{ organizationId: string; applicationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [application, setApplication] = useState<EmployerJobApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [statusActionPending, setStatusActionPending] = useState<EmployerJobApplicationStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';
  const canEdit =
    canManage &&
    application?.status !== 'archived' &&
    application?.job?.status !== 'archived' &&
    application?.candidate?.status !== 'archived';

  const fetchApplication = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await employerApi.getApplication(organizationId, applicationId);
      setApplication(response.data.application);
      setNotes(response.data.application.notes || '');
      setSource(response.data.application.source);
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load application');
    } finally {
      setLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchApplication();
    }
  }, [isSyncing, activeOrganization, canView, fetchApplication]);

  const handleSaveDetails = async () => {
    if (!organizationId || !applicationId) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await employerApi.updateApplication(organizationId, applicationId, {
        notes,
        source: (source || undefined) as any,
      });
      setApplication(response.data.application);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update application');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (targetStatus: EmployerJobApplicationStatus) => {
    if (!organizationId || !applicationId) return;
    if (CONFIRM_REQUIRED_STATUSES.includes(targetStatus)) {
      if (!window.confirm(`Are you sure you want to ${actionLabel(targetStatus).toLowerCase()} this application?`)) return;
    }
    setStatusError(null);
    setStatusSuccess(null);
    setStatusActionPending(targetStatus);
    try {
      // No optimistic mutation — `application` only ever updates from the server's own response.
      const response = await employerApi.updateApplicationStatus(organizationId, applicationId, targetStatus);
      setApplication(response.data.application);
      setStatusSuccess(`Status updated to ${STATUS_LABELS[response.data.application.status]}.`);
      setTimeout(() => setStatusSuccess(null), 3000);
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update application status');
    } finally {
      setStatusActionPending(null);
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
            <p className="text-sm text-mentor-text-secondary">Applications are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view this application.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back
        </button>

        {loading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading application...</p>
          </div>
        ) : loadError || !application ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load application</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{loadError || 'Application not found'}</p>
            <button onClick={fetchApplication} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="page-title mb-0">
                  {application.candidate ? `${application.candidate.firstName} ${application.candidate.lastName}` : 'Unknown candidate'}
                </h1>
                <span className={`badge ${STATUS_BADGE[application.status]}`}>{STATUS_LABELS[application.status]}</span>
              </div>
              <p className="page-subtitle">Application to {application.job?.title || 'Unknown job'}</p>
            </div>

            {activeOrganization.status === 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">This organization is archived. This application is read-only.</p>
              </div>
            )}
            {activeOrganization.status !== 'archived' && application.status !== 'archived' && application.job?.status === 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">This application's job is archived — this application is read-only.</p>
              </div>
            )}
            {activeOrganization.status !== 'archived' &&
              application.status !== 'archived' &&
              application.job?.status !== 'archived' &&
              application.candidate?.status === 'archived' && (
                <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                  <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-future-warning">
                    This application's candidate is archived — this application is read-only.
                  </p>
                </div>
              )}

            {canManage && (EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS[application.status]?.length ?? 0) > 0 && (
              <div className="card mb-6">
                {statusError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{statusError}</p>
                  </div>
                )}
                {statusSuccess && (
                  <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-4">
                    <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-success">{statusSuccess}</p>
                  </div>
                )}
                <p className="label mb-2">Status Actions</p>
                <div className="flex flex-wrap items-center gap-3">
                  {EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS[application.status].map((targetStatus) => (
                    <button
                      key={targetStatus}
                      onClick={() => handleStatusChange(targetStatus)}
                      disabled={statusActionPending !== null || !canEdit}
                      className="btn btn-secondary"
                    >
                      {statusActionPending === targetStatus ? 'Updating...' : actionLabel(targetStatus)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card mb-6">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <dt className="text-xs font-medium text-mentor-text-muted mb-1">Candidate</dt>
                  <dd className="text-sm text-mentor-text">
                    {application.candidate ? (
                      <Link
                        to={`/organizations/${organizationId}/employer/candidates/${application.candidateId}`}
                        className="text-primary-600 hover:underline"
                      >
                        {application.candidate.firstName} {application.candidate.lastName}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dd className="text-xs text-mentor-text-muted mt-0.5">{application.candidate?.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-mentor-text-muted mb-1">Job</dt>
                  <dd className="text-sm text-mentor-text">
                    {application.job ? (
                      <Link to={`/organizations/${organizationId}/employer/jobs/${application.jobId}`} className="text-primary-600 hover:underline">
                        {application.job.title}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                  <dd className="text-xs text-mentor-text-muted mt-0.5">{application.job?.jobCode || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-mentor-text-muted mb-1">Applied</dt>
                  <dd className="text-sm text-mentor-text">{formatDate(application.appliedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-mentor-text-muted mb-1">Created / Updated</dt>
                  <dd className="text-sm text-mentor-text">
                    {formatDateTime(application.createdAt)} / {formatDateTime(application.updatedAt)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card">
              {saveError && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-5">
                  <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-error">{saveError}</p>
                </div>
              )}
              {saved && (
                <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-5">
                  <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                  <p className="text-sm text-mentor-success">Application saved.</p>
                </div>
              )}

              {canEdit ? (
                <div className="space-y-4">
                  <div>
                    <label className="label">Source</label>
                    <select value={source} onChange={(e) => setSource(e.target.value)} className="input">
                      {EMPLOYER_JOB_APPLICATION_SOURCES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Notes</label>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input" rows={5} maxLength={2000} />
                  </div>
                  <button onClick={handleSaveDetails} disabled={saving} className="btn btn-primary">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              ) : (
                <dl>
                  <div className="mb-4">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Source</dt>
                    <dd className="text-sm text-mentor-text">{sourceLabel(application.source)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Notes</dt>
                    <dd className="text-sm text-mentor-text whitespace-pre-wrap">{application.notes || '—'}</dd>
                  </div>
                </dl>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerApplicationDetailPage;
