import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerCandidate,
  EmployerCandidateStatus,
  EMPLOYER_CANDIDATE_SOURCES,
  EMPLOYER_CANDIDATE_STATUS_TRANSITIONS,
} from '../../api/employerApi';
import { EMPTY_CANDIDATE_FORM, CandidateFormState, candidateFormToPayload, candidateToFormState } from './candidateFormUtils';
import { AlertCircle, Loader2, ChevronLeft, Pencil, CheckCircle2 } from 'lucide-react';

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

/** Requires confirmation — archiving is the only one of these three transitions that isn't trivially reversible in spirit. */
const CONFIRM_REQUIRED_STATUSES: EmployerCandidateStatus[] = ['archived'];

/** Label for the button that transitions TO `targetStatus`, per the spec's exact table. */
function actionLabel(currentStatus: EmployerCandidateStatus, targetStatus: EmployerCandidateStatus): string {
  if (targetStatus === 'active') return currentStatus === 'archived' ? 'Restore to Active' : 'Activate';
  if (targetStatus === 'inactive') return 'Deactivate';
  if (targetStatus === 'archived') return 'Archive';
  return STATUS_LABELS[targetStatus];
}

const sourceLabel = (value?: string) => EMPLOYER_CANDIDATE_SOURCES.find((s) => s.value === value)?.label || value;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * Candidate detail (18A). Readable with only ORGANIZATION_VIEW — editing and
 * status actions require INTERVIEWS_MANAGE on a non-archived organization,
 * and editing is additionally blocked while the candidate itself is
 * archived (status can still change via the dedicated status actions).
 * Status only ever changes through the dedicated status endpoint; the
 * backend remains the sole authority on which transitions are valid (this
 * page's button set is a UI convenience mirroring the same transition map,
 * never trusted as the actual gate — no optimistic status mutation).
 */
const EmployerCandidateDetailPage: React.FC = () => {
  const { organizationId, candidateId } = useParams<{ organizationId: string; candidateId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [candidate, setCandidate] = useState<EmployerCandidate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<CandidateFormState>(EMPTY_CANDIDATE_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [statusActionPending, setStatusActionPending] = useState<EmployerCandidateStatus | null>(null);
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
  const canEdit = canManage && candidate?.status !== 'archived';

  const fetchCandidate = useCallback(async () => {
    if (!organizationId || !candidateId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await employerApi.getCandidate(organizationId, candidateId);
      setCandidate(response.data.candidate);
      setForm(candidateToFormState(response.data.candidate));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load candidate');
    } finally {
      setLoading(false);
    }
  }, [organizationId, candidateId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchCandidate();
    }
  }, [isSyncing, activeOrganization, canView, fetchCandidate]);

  const field = <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!organizationId || !candidateId) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setSaveError('First name and last name are required');
      return;
    }
    if (!form.email.trim()) {
      setSaveError('Email is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await employerApi.updateCandidate(organizationId, candidateId, candidateFormToPayload(form));
      setCandidate(response.data.candidate);
      setForm(candidateToFormState(response.data.candidate));
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update candidate');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (candidate) setForm(candidateToFormState(candidate));
    setSaveError(null);
    setIsEditing(false);
  };

  const handleStatusChange = async (targetStatus: EmployerCandidateStatus) => {
    if (!organizationId || !candidateId) return;
    if (CONFIRM_REQUIRED_STATUSES.includes(targetStatus)) {
      if (!window.confirm('Are you sure you want to archive this candidate?')) return;
    }
    setStatusError(null);
    setStatusSuccess(null);
    setStatusActionPending(targetStatus);
    try {
      // No optimistic mutation — `candidate` only ever updates from the server's own response.
      const response = await employerApi.updateCandidateStatus(organizationId, candidateId, targetStatus);
      setCandidate(response.data.candidate);
      setForm(candidateToFormState(response.data.candidate));
      setStatusSuccess(`Status updated to ${STATUS_LABELS[response.data.candidate.status]}.`);
      setTimeout(() => setStatusSuccess(null), 3000);
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update candidate status');
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view this candidate.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <Link
          to={`/organizations/${organizationId}/employer/candidates`}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Candidates
        </Link>

        {loading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading candidate...</p>
          </div>
        ) : loadError || !candidate ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load candidate</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{loadError || 'Candidate not found'}</p>
            <button onClick={fetchCandidate} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="page-title mb-0">
                    {candidate.firstName} {candidate.lastName}
                  </h1>
                  <span className={`badge ${STATUS_BADGE[candidate.status]}`}>{STATUS_LABELS[candidate.status]}</span>
                </div>
                <p className="page-subtitle">{candidate.headline || candidate.email}</p>
              </div>
              {canEdit && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="btn btn-secondary shrink-0">
                  <Pencil size={16} />
                  Edit
                </button>
              )}
            </div>

            {activeOrganization.status === 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">
                  This organization is archived. This candidate is read-only.
                </p>
              </div>
            )}

            {candidate.status === 'archived' && activeOrganization.status !== 'archived' && (
              <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
                <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-future-warning">
                  This candidate is archived and read-only. Restore to active to make edits.
                </p>
              </div>
            )}

            {canManage && (EMPLOYER_CANDIDATE_STATUS_TRANSITIONS[candidate.status]?.length ?? 0) > 0 && (
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
                  {EMPLOYER_CANDIDATE_STATUS_TRANSITIONS[candidate.status].map((targetStatus) => (
                    <button
                      key={targetStatus}
                      onClick={() => handleStatusChange(targetStatus)}
                      disabled={statusActionPending !== null}
                      className="btn btn-secondary"
                    >
                      {statusActionPending === targetStatus ? 'Updating...' : actionLabel(candidate.status, targetStatus)}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                  <p className="text-sm text-mentor-success">Candidate saved.</p>
                </div>
              )}

              {isEditing ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">First Name</label>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => field('firstName', e.target.value)}
                        className="input"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="label">Last Name</label>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => field('lastName', e.target.value)}
                        className="input"
                        maxLength={100}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Email</label>
                      <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)} className="input" maxLength={254} />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input type="text" value={form.phone} onChange={(e) => field('phone', e.target.value)} className="input" maxLength={30} />
                    </div>
                  </div>

                  <div>
                    <label className="label">Headline</label>
                    <input type="text" value={form.headline} onChange={(e) => field('headline', e.target.value)} className="input" maxLength={200} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Current Company</label>
                      <input
                        type="text"
                        value={form.currentCompany}
                        onChange={(e) => field('currentCompany', e.target.value)}
                        className="input"
                        maxLength={150}
                      />
                    </div>
                    <div>
                      <label className="label">Current Title</label>
                      <input
                        type="text"
                        value={form.currentTitle}
                        onChange={(e) => field('currentTitle', e.target.value)}
                        className="input"
                        maxLength={150}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="label">Location</label>
                      <input type="text" value={form.location} onChange={(e) => field('location', e.target.value)} className="input" maxLength={200} />
                    </div>
                    <div>
                      <label className="label">Total Experience (years)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.totalExperienceYears}
                        onChange={(e) => field('totalExperienceYears', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Source</label>
                      <select
                        value={form.source}
                        onChange={(e) => field('source', e.target.value as CandidateFormState['source'])}
                        className="input"
                      >
                        <option value="">Select</option>
                        {EMPLOYER_CANDIDATE_SOURCES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="label">LinkedIn URL</label>
                      <input
                        type="url"
                        value={form.linkedinUrl}
                        onChange={(e) => field('linkedinUrl', e.target.value)}
                        className="input"
                        maxLength={300}
                      />
                    </div>
                    <div>
                      <label className="label">Portfolio URL</label>
                      <input
                        type="url"
                        value={form.portfolioUrl}
                        onChange={(e) => field('portfolioUrl', e.target.value)}
                        className="input"
                        maxLength={300}
                      />
                    </div>
                    <div>
                      <label className="label">GitHub URL</label>
                      <input
                        type="url"
                        value={form.githubUrl}
                        onChange={(e) => field('githubUrl', e.target.value)}
                        className="input"
                        maxLength={300}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="label">Notice Period (days)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.noticePeriodDays}
                        onChange={(e) => field('noticePeriodDays', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Current Salary</label>
                      <input
                        type="number"
                        min={0}
                        value={form.currentSalary}
                        onChange={(e) => field('currentSalary', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Expected Salary</label>
                      <input
                        type="number"
                        min={0}
                        value={form.expectedSalary}
                        onChange={(e) => field('expectedSalary', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Currency</label>
                      <input
                        type="text"
                        value={form.salaryCurrency}
                        onChange={(e) => field('salaryCurrency', e.target.value)}
                        className="input"
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label">Tags (comma or newline separated)</label>
                    <textarea value={form.tagsText} onChange={(e) => field('tagsText', e.target.value)} className="input" rows={2} />
                  </div>

                  <div>
                    <label className="label">Notes</label>
                    <textarea value={form.notes} onChange={(e) => field('notes', e.target.value)} className="input" rows={4} maxLength={2000} />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={handleCancel} disabled={saving} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Email</dt>
                    <dd className="text-sm text-mentor-text">{candidate.email}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Phone</dt>
                    <dd className="text-sm text-mentor-text">{candidate.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Current Company</dt>
                    <dd className="text-sm text-mentor-text">{candidate.currentCompany || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Current Title</dt>
                    <dd className="text-sm text-mentor-text">{candidate.currentTitle || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Location</dt>
                    <dd className="text-sm text-mentor-text">{candidate.location || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Total Experience</dt>
                    <dd className="text-sm text-mentor-text">
                      {candidate.totalExperienceYears !== undefined ? `${candidate.totalExperienceYears} yrs` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Source</dt>
                    <dd className="text-sm text-mentor-text">{sourceLabel(candidate.source)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Notice Period</dt>
                    <dd className="text-sm text-mentor-text">
                      {candidate.noticePeriodDays !== undefined ? `${candidate.noticePeriodDays} days` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Current Salary</dt>
                    <dd className="text-sm text-mentor-text">
                      {candidate.currentSalary !== undefined ? `${candidate.salaryCurrency || ''} ${candidate.currentSalary}`.trim() : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Expected Salary</dt>
                    <dd className="text-sm text-mentor-text">
                      {candidate.expectedSalary !== undefined
                        ? `${candidate.salaryCurrency || ''} ${candidate.expectedSalary}`.trim()
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">LinkedIn</dt>
                    <dd className="text-sm text-mentor-text break-all">
                      {candidate.linkedinUrl ? (
                        <a href={candidate.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                          {candidate.linkedinUrl}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Portfolio</dt>
                    <dd className="text-sm text-mentor-text break-all">
                      {candidate.portfolioUrl ? (
                        <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                          {candidate.portfolioUrl}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">GitHub</dt>
                    <dd className="text-sm text-mentor-text break-all">
                      {candidate.githubUrl ? (
                        <a href={candidate.githubUrl} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                          {candidate.githubUrl}
                        </a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1.5">Tags</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {candidate.tags && candidate.tags.length > 0
                        ? candidate.tags.map((tag) => (
                            <span key={tag} className="badge badge-neutral">
                              {tag}
                            </span>
                          ))
                        : '—'}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Notes</dt>
                    <dd className="text-sm text-mentor-text whitespace-pre-wrap">{candidate.notes || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Created</dt>
                    <dd className="text-sm text-mentor-text">{formatDate(candidate.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Last Updated</dt>
                    <dd className="text-sm text-mentor-text">{formatDate(candidate.updatedAt)}</dd>
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

export default EmployerCandidateDetailPage;
