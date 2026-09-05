import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerJob,
  EmployerJobStatus,
  EmployerJobStatusHistoryRow,
  HiringTeamMember,
  AvailableMember,
  EmployerJobHiringTeamRole,
  JobDescriptionSource,
  JobIntelligenceSnapshotRecord,
  JobIntelligenceReadiness,
  EMPLOYER_JOB_WORKPLACE_TYPES,
  EMPLOYER_JOB_EMPLOYMENT_TYPES,
  EMPLOYER_JOB_STATUS_TRANSITIONS,
  EMPLOYER_JOB_HIRING_TEAM_ROLES,
} from '../../api/employerApi';
import { EMPTY_JOB_FORM, JobFormState, jobFormToPayload, jobToFormState } from './jobFormUtils';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  Pencil,
  CheckCircle2,
  ChevronRight,
  History as HistoryIcon,
  Users,
  Plus,
  Trash2,
  FileText,
  ShieldCheck,
} from 'lucide-react';

const HISTORY_PAGE_LIMIT = 20;

const hiringTeamRoleLabel = (role: EmployerJobHiringTeamRole) =>
  EMPLOYER_JOB_HIRING_TEAM_ROLES.find((r) => r.value === role)?.label || role;

const JD_SOURCE_TYPE_LABELS: Record<string, string> = { pasted: 'Pasted', manual: 'Manually written' };

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

const STATUS_LABELS: Record<EmployerJobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
  archived: 'Archived',
};

/**
 * Purely a presentational mapping of the backend's own DB-derived readiness
 * booleans (never an independent client-side guess) into the four compact
 * states this page shows: Not started / In progress / Ready to finalize /
 * Finalized (vN).
 */
function getIntelligenceStatus(
  readiness: JobIntelligenceReadiness | null,
  snapshot: JobIntelligenceSnapshotRecord | null
): { label: string; badge: string } | null {
  if (!readiness) return null;
  if (readiness.finalized && snapshot) {
    return { label: `Finalized (v${snapshot.jdVersion})`, badge: 'badge-success' };
  }
  if (!readiness.jdExists) {
    return { label: 'Not started', badge: 'badge-neutral' };
  }
  if (readiness.analysisCompleted && readiness.skillsCompleted && readiness.competenciesCompleted) {
    return { label: 'Ready to finalize', badge: 'badge-info' };
  }
  return { label: 'In progress', badge: 'badge-warning' };
}

const STATUS_BADGE: Record<EmployerJobStatus, string> = {
  draft: 'badge-neutral',
  open: 'badge-success',
  paused: 'badge-warning',
  closed: 'badge-info',
  archived: 'badge-neutral',
};

/** Requires confirmation — these are hard to casually undo (closing ends the hiring cycle; archiving is terminal). */
const CONFIRM_REQUIRED_STATUSES: EmployerJobStatus[] = ['closed', 'archived'];

/** Label for the button that transitions TO `targetStatus` — "open" reads as "Reopen" only when coming from paused. */
function actionLabel(currentStatus: EmployerJobStatus, targetStatus: EmployerJobStatus): string {
  if (targetStatus === 'open') return currentStatus === 'paused' ? 'Reopen' : 'Open';
  if (targetStatus === 'paused') return 'Pause';
  if (targetStatus === 'closed') return 'Close';
  if (targetStatus === 'archived') return 'Archive';
  return STATUS_LABELS[targetStatus];
}

const workplaceLabel = (value?: string) => EMPLOYER_JOB_WORKPLACE_TYPES.find((w) => w.value === value)?.label || value;
const employmentLabel = (value?: string) => EMPLOYER_JOB_EMPLOYMENT_TYPES.find((e) => e.value === value)?.label || value;
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');
const formatDateTime = (value: string) => new Date(value).toLocaleString();
const formatSalary = (job: EmployerJob) => {
  if (job.salaryMin === undefined && job.salaryMax === undefined) return '—';
  const currency = job.salaryCurrency ? `${job.salaryCurrency} ` : '';
  if (job.salaryMin !== undefined && job.salaryMax !== undefined) return `${currency}${job.salaryMin} – ${job.salaryMax}`;
  return `${currency}${job.salaryMin ?? job.salaryMax}`;
};

/**
 * Job detail (16B). Readable with only ORGANIZATION_VIEW — editing and
 * status actions require INTERVIEWS_MANAGE on a non-archived organization.
 * Status only ever changes through the dedicated status endpoint; the
 * backend remains the sole authority on which transitions are valid (this
 * page's button set is a UI convenience mirroring the same transition map,
 * never trusted as the actual gate).
 */
const EmployerJobDetailPage: React.FC = () => {
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<JobFormState>(EMPTY_JOB_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [statusActionPending, setStatusActionPending] = useState<EmployerJobStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);

  const [history, setHistory] = useState<EmployerJobStatusHistoryRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [hiringTeam, setHiringTeam] = useState<HiringTeamMember[]>([]);
  const [hiringTeamLoading, setHiringTeamLoading] = useState(true);
  const [hiringTeamError, setHiringTeamError] = useState<string | null>(null);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);

  const [availableMembers, setAvailableMembers] = useState<AvailableMember[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMembershipId, setAddMembershipId] = useState('');
  const [addRole, setAddRole] = useState<EmployerJobHiringTeamRole>('recruiter');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [jdCurrent, setJdCurrent] = useState<JobDescriptionSource | null>(null);
  const [jdLoading, setJdLoading] = useState(true);
  const [jdError, setJdError] = useState<string | null>(null);

  const [intelligenceSnapshot, setIntelligenceSnapshot] = useState<JobIntelligenceSnapshotRecord | null>(null);
  const [intelligenceReadiness, setIntelligenceReadiness] = useState<JobIntelligenceReadiness | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const fetchJob = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await employerApi.getJob(organizationId, jobId);
      setJob(response.data.job);
      setForm(jobToFormState(response.data.job));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [organizationId, jobId]);

  const fetchHistory = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await employerApi.getJobStatusHistory(organizationId, jobId, { page: historyPage, limit: HISTORY_PAGE_LIMIT });
      setHistory(response.data.history);
      setHistoryTotalPages(Math.max(1, response.data.pagination.pages));
    } catch (err: any) {
      setHistoryError(err.message || 'Failed to load status history');
    } finally {
      setHistoryLoading(false);
    }
  }, [organizationId, jobId, historyPage]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJob();
    }
  }, [isSyncing, activeOrganization, canView, fetchJob]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchHistory();
    }
  }, [isSyncing, activeOrganization, canView, fetchHistory]);

  const fetchHiringTeam = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setHiringTeamLoading(true);
    setHiringTeamError(null);
    try {
      const response = await employerApi.getHiringTeam(organizationId, jobId);
      setHiringTeam(response.data.hiringTeam);
    } catch (err: any) {
      setHiringTeamError(err.message || 'Failed to load hiring team');
    } finally {
      setHiringTeamLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchHiringTeam();
    }
  }, [isSyncing, activeOrganization, canView, fetchHiringTeam]);

  const fetchJobDescription = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setJdLoading(true);
    setJdError(null);
    try {
      const response = await employerApi.getJobDescriptionSources(organizationId, jobId);
      setJdCurrent(response.data.current);
    } catch (err: any) {
      setJdError(err.message || 'Failed to load job description');
    } finally {
      setJdLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJobDescription();
    }
  }, [isSyncing, activeOrganization, canView, fetchJobDescription]);

  /** Uses the SAME DB-derived readiness the JD page shows — never a client-side guess. */
  const fetchIntelligenceStatus = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setIntelligenceLoading(true);
    try {
      const response = await employerApi.getCurrentJobIntelligence(organizationId, jobId);
      setIntelligenceSnapshot(response.data.snapshot);
      setIntelligenceReadiness(response.data.readiness);
    } catch {
      // Non-fatal for the job detail page — the compact status line just won't render.
    } finally {
      setIntelligenceLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchIntelligenceStatus();
    }
  }, [isSyncing, activeOrganization, canView, fetchIntelligenceStatus]);

  const handleOpenAddMember = async () => {
    if (!organizationId || !jobId) return;
    setAddError(null);
    setAddMembershipId('');
    setAddRole('recruiter');
    setShowAddMember(true);
    try {
      const response = await employerApi.getAvailableMembers(organizationId, jobId);
      setAvailableMembers(response.data.members);
    } catch (err: any) {
      setAddError(err.message || 'Failed to load available members');
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !jobId) return;
    if (!addMembershipId) {
      setAddError('Select a member');
      return;
    }
    setAddSubmitting(true);
    setAddError(null);
    try {
      await employerApi.addHiringTeamMember(organizationId, jobId, { membershipId: addMembershipId, role: addRole });
      setShowAddMember(false);
      await fetchHiringTeam();
    } catch (err: any) {
      setAddError(err.message || 'Failed to add hiring team member');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleRoleChange = async (teamMemberId: string, role: EmployerJobHiringTeamRole) => {
    if (!organizationId || !jobId) return;
    setTeamActionError(null);
    setRoleUpdatingId(teamMemberId);
    try {
      await employerApi.updateHiringTeamMemberRole(organizationId, jobId, teamMemberId, role);
      await fetchHiringTeam();
    } catch (err: any) {
      setTeamActionError(err.message || 'Failed to update role');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const handleRemoveMember = async (row: HiringTeamMember) => {
    if (!organizationId || !jobId) return;
    if (!window.confirm(`Remove ${row.member?.name || 'this member'} from the hiring team?`)) return;
    setTeamActionError(null);
    setRemovingId(row.id);
    try {
      await employerApi.removeHiringTeamMember(organizationId, jobId, row.id);
      await fetchHiringTeam();
    } catch (err: any) {
      setTeamActionError(err.message || 'Failed to remove hiring team member');
    } finally {
      setRemovingId(null);
    }
  };

  const field = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!organizationId || !jobId) return;
    if (!form.title.trim()) {
      setSaveError('Title is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const response = await employerApi.updateJob(organizationId, jobId, jobFormToPayload(form));
      setJob(response.data.job);
      setForm(jobToFormState(response.data.job));
      setIsEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to update job');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (job) setForm(jobToFormState(job));
    setSaveError(null);
    setIsEditing(false);
  };

  const handleStatusChange = async (targetStatus: EmployerJobStatus) => {
    if (!organizationId || !jobId) return;
    if (CONFIRM_REQUIRED_STATUSES.includes(targetStatus)) {
      const verb = targetStatus === 'archived' ? 'archive' : 'close';
      if (!window.confirm(`Are you sure you want to ${verb} this job?`)) return;
    }
    setStatusError(null);
    setStatusSuccess(null);
    setStatusActionPending(targetStatus);
    try {
      // No optimistic mutation — `job` only ever updates from the server's
      // own response, both for the job detail and the history list below.
      const response = await employerApi.updateJobStatus(organizationId, jobId, targetStatus);
      setJob(response.data.job);
      setForm(jobToFormState(response.data.job));
      setStatusSuccess(`Status updated to ${STATUS_LABELS[response.data.job.status]}.`);
      setTimeout(() => setStatusSuccess(null), 3000);
      // Newest change is always on page 1 — if we're already there, refetch
      // directly; otherwise jump back to page 1 (the effect below refetches
      // once `historyPage` actually changes).
      if (historyPage === 1) {
        await fetchHistory();
      } else {
        setHistoryPage(1);
      }
    } catch (err: any) {
      setStatusError(err.message || 'Failed to update job status');
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
            <p className="text-sm text-mentor-text-secondary">Jobs are only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view this job.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <Link
          to={`/organizations/${organizationId}/employer/jobs`}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Jobs
        </Link>

        {loading ? (
          <div className="card p-10 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading job...</p>
          </div>
        ) : loadError || !job ? (
          <div className="card p-10 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load job</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{loadError || 'Job not found'}</p>
            <button onClick={fetchJob} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="page-header flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h1 className="page-title mb-0">{job.title}</h1>
                  <span className={`badge ${STATUS_BADGE[job.status]}`}>{STATUS_LABELS[job.status]}</span>
                </div>
                <p className="page-subtitle">{job.jobCode || 'No job code'}</p>
              </div>
              {canManage && !isEditing && (
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
                  This organization is archived. This job is read-only.
                </p>
              </div>
            )}

            {canManage && (EMPLOYER_JOB_STATUS_TRANSITIONS[job.status]?.length ?? 0) > 0 && (
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
                  {EMPLOYER_JOB_STATUS_TRANSITIONS[job.status].map((targetStatus) => (
                    <button
                      key={targetStatus}
                      onClick={() => handleStatusChange(targetStatus)}
                      disabled={statusActionPending !== null}
                      className="btn btn-secondary"
                    >
                      {statusActionPending === targetStatus ? 'Updating...' : actionLabel(job.status, targetStatus)}
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
                  <p className="text-sm text-mentor-success">Job saved.</p>
                </div>
              )}

              {isEditing ? (
                <div className="space-y-5">
                  <div>
                    <label className="label">Title</label>
                    <input type="text" value={form.title} onChange={(e) => field('title', e.target.value)} className="input" maxLength={200} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Job Code</label>
                      <input type="text" value={form.jobCode} onChange={(e) => field('jobCode', e.target.value)} className="input" maxLength={50} />
                    </div>
                    <div>
                      <label className="label">Department</label>
                      <input
                        type="text"
                        value={form.department}
                        onChange={(e) => field('department', e.target.value)}
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
                      <label className="label">Workplace Type</label>
                      <select
                        value={form.workplaceType}
                        onChange={(e) => field('workplaceType', e.target.value as JobFormState['workplaceType'])}
                        className="input"
                      >
                        <option value="">Select</option>
                        {EMPLOYER_JOB_WORKPLACE_TYPES.map((w) => (
                          <option key={w.value} value={w.value}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Employment Type</label>
                      <select
                        value={form.employmentType}
                        onChange={(e) => field('employmentType', e.target.value as JobFormState['employmentType'])}
                        className="input"
                      >
                        <option value="">Select</option>
                        {EMPLOYER_JOB_EMPLOYMENT_TYPES.map((et) => (
                          <option key={et.value} value={et.value}>
                            {et.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="label">Min Experience (years)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.experienceMinYears}
                        onChange={(e) => field('experienceMinYears', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Max Experience (years)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.experienceMaxYears}
                        onChange={(e) => field('experienceMaxYears', e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Openings</label>
                      <input type="number" min={1} value={form.openings} onChange={(e) => field('openings', e.target.value)} className="input" />
                    </div>
                  </div>

                  <div>
                    <label className="label">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => field('description', e.target.value)}
                      className="input"
                      rows={4}
                      maxLength={5000}
                    />
                  </div>

                  <div>
                    <label className="label">Responsibilities (one per line, or comma-separated)</label>
                    <textarea
                      value={form.responsibilitiesText}
                      onChange={(e) => field('responsibilitiesText', e.target.value)}
                      className="input"
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Required Skills (one per line, or comma-separated)</label>
                      <textarea
                        value={form.requiredSkillsText}
                        onChange={(e) => field('requiredSkillsText', e.target.value)}
                        className="input"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="label">Preferred Skills (one per line, or comma-separated)</label>
                      <textarea
                        value={form.preferredSkillsText}
                        onChange={(e) => field('preferredSkillsText', e.target.value)}
                        className="input"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="label">Salary Min</label>
                      <input type="number" min={0} value={form.salaryMin} onChange={(e) => field('salaryMin', e.target.value)} className="input" />
                    </div>
                    <div>
                      <label className="label">Salary Max</label>
                      <input type="number" min={0} value={form.salaryMax} onChange={(e) => field('salaryMax', e.target.value)} className="input" />
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

                  <div className="sm:w-1/3">
                    <label className="label">Application Deadline</label>
                    <input
                      type="date"
                      value={form.applicationDeadline}
                      onChange={(e) => field('applicationDeadline', e.target.value)}
                      className="input"
                    />
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
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Department</dt>
                    <dd className="text-sm text-mentor-text">{job.department || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Location</dt>
                    <dd className="text-sm text-mentor-text">{job.location || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Workplace Type</dt>
                    <dd className="text-sm text-mentor-text">{workplaceLabel(job.workplaceType) || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Employment Type</dt>
                    <dd className="text-sm text-mentor-text">{employmentLabel(job.employmentType) || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Experience</dt>
                    <dd className="text-sm text-mentor-text">
                      {job.experienceMinYears !== undefined || job.experienceMaxYears !== undefined
                        ? `${job.experienceMinYears ?? 0} – ${job.experienceMaxYears ?? '∞'} yrs`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Openings</dt>
                    <dd className="text-sm text-mentor-text">{job.openings ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Salary</dt>
                    <dd className="text-sm text-mentor-text">{formatSalary(job)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Application Deadline</dt>
                    <dd className="text-sm text-mentor-text">{formatDate(job.applicationDeadline)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Description</dt>
                    <dd className="text-sm text-mentor-text whitespace-pre-wrap">{job.description || '—'}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1.5">Responsibilities</dt>
                    <dd className="text-sm text-mentor-text">
                      {job.responsibilities && job.responsibilities.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1">
                          {job.responsibilities.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1.5">Required Skills</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {job.requiredSkills && job.requiredSkills.length > 0
                        ? job.requiredSkills.map((skill) => (
                            <span key={skill} className="badge badge-info">
                              {skill}
                            </span>
                          ))
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1.5">Preferred Skills</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {job.preferredSkills && job.preferredSkills.length > 0
                        ? job.preferredSkills.map((skill) => (
                            <span key={skill} className="badge badge-neutral">
                              {skill}
                            </span>
                          ))
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Created</dt>
                    <dd className="text-sm text-mentor-text">{formatDate(job.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-mentor-text-muted mb-1">Last Updated</dt>
                    <dd className="text-sm text-mentor-text">{formatDate(job.updatedAt)}</dd>
                  </div>
                </dl>
              )}
            </div>

            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2 mb-0">
                  <FileText size={18} className="text-mentor-text-muted" />
                  Job Description
                </h2>
                <button
                  onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/${jobId}/jd`)}
                  className="btn btn-secondary"
                >
                  {jdCurrent ? 'View / Edit' : 'Add Job Description'}
                </button>
              </div>

              {!intelligenceLoading &&
                jdCurrent &&
                (() => {
                  const status = getIntelligenceStatus(intelligenceReadiness, intelligenceSnapshot);
                  if (!status) return null;
                  return (
                    <button
                      onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/${jobId}/jd`)}
                      className="flex items-center gap-2 mb-4 text-left"
                    >
                      <ShieldCheck size={14} className="text-mentor-text-muted" />
                      <span className="text-xs text-mentor-text-muted">JD Intelligence:</span>
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                    </button>
                  );
                })()}

              {jdLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : jdError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{jdError}</p>
                  <button onClick={fetchJobDescription} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : !jdCurrent ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No job description added yet.</p>
              ) : (
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="badge badge-info">Version {jdCurrent.version}</span>
                    <span className="badge badge-neutral">{JD_SOURCE_TYPE_LABELS[jdCurrent.sourceType] || jdCurrent.sourceType}</span>
                    <span className="text-xs text-mentor-text-muted">Added {formatDate(jdCurrent.createdAt)}</span>
                  </div>
                  <p className="text-sm text-mentor-text-secondary whitespace-pre-wrap">{truncate(jdCurrent.rawText, 400)}</p>
                </div>
              )}
            </div>

            <div className="card mt-6 p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-mentor-border flex items-center gap-2">
                <HistoryIcon size={18} className="text-mentor-text-muted" />
                <h2 className="section-title mb-0">Status History</h2>
              </div>
              {historyLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : historyError ? (
                <div className="p-8 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{historyError}</p>
                  <button onClick={fetchHistory} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : history.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-mentor-text-secondary">No status changes yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {history.map((row) => (
                    <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-6 py-3.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${STATUS_BADGE[row.fromStatus]}`}>{STATUS_LABELS[row.fromStatus]}</span>
                        <span className="text-mentor-text-muted text-xs">&rarr;</span>
                        <span className={`badge ${STATUS_BADGE[row.toStatus]}`}>{STATUS_LABELS[row.toStatus]}</span>
                      </div>
                      <div className="sm:ml-auto text-xs text-mentor-text-muted">
                        {formatDateTime(row.changedAt)} &middot; by membership {row.changedByMembershipId}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!historyLoading && !historyError && historyTotalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
                  <p className="text-xs text-mentor-text-muted">
                    Page {historyPage} of {historyTotalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage >= historyTotalPages}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Next page"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="card mt-6">
              {(() => {
                const canManageTeam = canManage && job.status !== 'archived';
                return (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-title flex items-center gap-2 mb-0">
                        <Users size={18} className="text-mentor-text-muted" />
                        Hiring Team
                      </h2>
                      {canManageTeam && !showAddMember && (
                        <button onClick={handleOpenAddMember} className="btn btn-secondary">
                          <Plus size={16} />
                          Add Member
                        </button>
                      )}
                    </div>

                    {job.status === 'archived' && (
                      <p className="text-xs text-mentor-text-muted mb-4">
                        This job is archived — its hiring team is read-only.
                      </p>
                    )}

                    {showAddMember && (
                      <form onSubmit={handleAddMember} className="surface-muted p-4 mb-4 space-y-3">
                        {addError && (
                          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                            <p className="text-sm text-mentor-error">{addError}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="label">Member</label>
                            <select value={addMembershipId} onChange={(e) => setAddMembershipId(e.target.value)} className="input">
                              <option value="">Select a member</option>
                              {availableMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name || m.email || m.id} ({m.organizationRole})
                                </option>
                              ))}
                            </select>
                            {availableMembers.length === 0 && (
                              <p className="text-xs text-mentor-text-muted mt-1">No available members to add.</p>
                            )}
                          </div>
                          <div>
                            <label className="label">Hiring Team Role</label>
                            <select
                              value={addRole}
                              onChange={(e) => setAddRole(e.target.value as EmployerJobHiringTeamRole)}
                              className="input"
                            >
                              {EMPLOYER_JOB_HIRING_TEAM_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button type="submit" disabled={addSubmitting} className="btn btn-primary">
                            {addSubmitting ? 'Adding...' : 'Add'}
                          </button>
                          <button type="button" onClick={() => setShowAddMember(false)} className="btn btn-secondary">
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {teamActionError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{teamActionError}</p>
                      </div>
                    )}

                    {hiringTeamLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      </div>
                    ) : hiringTeamError ? (
                      <div className="p-8 text-center">
                        <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                        <p className="text-sm text-mentor-text-secondary mb-4">{hiringTeamError}</p>
                        <button onClick={fetchHiringTeam} className="btn btn-primary">
                          Try Again
                        </button>
                      </div>
                    ) : hiringTeam.length === 0 ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">No hiring team members yet.</p>
                    ) : (
                      <div className="divide-y divide-mentor-border">
                        {hiringTeam.map((row) => (
                          <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-3 py-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-mentor-text truncate">
                                {row.member?.name || row.member?.email || row.membershipId}
                              </p>
                              <p className="text-xs text-mentor-text-muted">
                                {row.member?.email || '—'} &middot; org role: {row.member?.organizationRole || '—'} &middot; added{' '}
                                {formatDate(row.createdAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {canManageTeam ? (
                                <select
                                  value={row.role}
                                  onChange={(e) => handleRoleChange(row.id, e.target.value as EmployerJobHiringTeamRole)}
                                  disabled={roleUpdatingId === row.id || removingId === row.id}
                                  className="input py-1.5 text-xs w-auto"
                                >
                                  {EMPLOYER_JOB_HIRING_TEAM_ROLES.map((r) => (
                                    <option key={r.value} value={r.value}>
                                      {r.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="badge badge-info">{hiringTeamRoleLabel(row.role)}</span>
                              )}
                              {canManageTeam && (
                                <button
                                  onClick={() => handleRemoveMember(row)}
                                  disabled={roleUpdatingId === row.id || removingId === row.id}
                                  className="btn btn-secondary px-3 py-1.5 text-xs"
                                  aria-label="Remove hiring team member"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerJobDetailPage;
