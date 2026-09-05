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
  EmployerJobApplication,
  EmployerJobApplicationStatus,
  EmployerCandidate,
  JobRanking,
  JobRankingFilters,
  JobCandidateComparison,
  JobCandidateComparisonFilters,
  JobShortlistRow,
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
  Briefcase,
  X,
  ListOrdered,
  Star,
  Scale,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const APPLICATIONS_PAGE_LIMIT = 20;

const APPLICATION_STATUS_LABELS: Record<string, string> = {
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

const APPLICATION_STATUS_BADGE: Record<string, string> = {
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

const HISTORY_PAGE_LIMIT = 20;

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_match: 'Strong Match',
  match: 'Match',
  borderline: 'Borderline',
  weak_match: 'Weak Match',
};

const RECOMMENDATION_BADGE: Record<string, string> = {
  strong_match: 'badge-success',
  match: 'badge-info',
  borderline: 'badge-warning',
  weak_match: 'badge-neutral',
};

const UNRANKED_REASON_LABELS: Record<string, string> = {
  screening_required: 'Run screening',
  explainable_score_required: 'Calculate explainable score',
};

const APPLICATION_STATUS_OPTIONS: EmployerJobApplicationStatus[] = [
  'applied',
  'screening',
  'shortlisted',
  'interview',
  'offer',
  'hired',
  'rejected',
  'withdrawn',
  'archived',
];

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

  const [applications, setApplications] = useState<EmployerJobApplication[]>([]);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);

  const [ranking, setRanking] = useState<JobRanking | null>(null);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [rankingStatusInput, setRankingStatusInput] = useState<EmployerJobApplicationStatus | ''>('');
  const [rankingMinScoreInput, setRankingMinScoreInput] = useState('');
  const [rankingSearchInput, setRankingSearchInput] = useState('');
  const [appliedRankingFilters, setAppliedRankingFilters] = useState<JobRankingFilters>({});

  const [comparison, setComparison] = useState<JobCandidateComparison | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [comparisonStatusInput, setComparisonStatusInput] = useState<EmployerJobApplicationStatus | ''>('');
  const [comparisonMinScoreInput, setComparisonMinScoreInput] = useState('');
  const [comparisonSearchInput, setComparisonSearchInput] = useState('');
  const [appliedComparisonFilters, setAppliedComparisonFilters] = useState<JobCandidateComparisonFilters>({});
  const [expandedComparisonRow, setExpandedComparisonRow] = useState<string | null>(null);

  const [shortlistingApplicationId, setShortlistingApplicationId] = useState<string | null>(null);
  const [shortlistActionError, setShortlistActionError] = useState<string | null>(null);

  const [jobShortlist, setJobShortlist] = useState<JobShortlistRow[]>([]);
  const [jobShortlistLoading, setJobShortlistLoading] = useState(true);
  const [jobShortlistError, setJobShortlistError] = useState<string | null>(null);

  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateSearchResults, setCandidateSearchResults] = useState<EmployerCandidate[]>([]);
  const [candidateSearchLoading, setCandidateSearchLoading] = useState(false);
  const [candidateSearchError, setCandidateSearchError] = useState<string | null>(null);
  const [addingCandidateId, setAddingCandidateId] = useState<string | null>(null);
  const [addCandidateError, setAddCandidateError] = useState<string | null>(null);

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

  const fetchApplications = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setApplicationsLoading(true);
    setApplicationsError(null);
    try {
      const response = await employerApi.listApplications(organizationId, { jobId, page: applicationsPage, limit: APPLICATIONS_PAGE_LIMIT });
      setApplications(response.data.applications);
      setApplicationsTotal(response.data.pagination.total);
    } catch (err: any) {
      setApplicationsError(err.message || 'Failed to load applications');
    } finally {
      setApplicationsLoading(false);
    }
  }, [organizationId, jobId, applicationsPage]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchApplications();
    }
  }, [isSyncing, activeOrganization, canView, fetchApplications]);

  const fetchRanking = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setRankingLoading(true);
    setRankingError(null);
    try {
      const response = await employerApi.getEmployerJobRanking(organizationId, jobId, appliedRankingFilters);
      setRanking(response.data);
    } catch (err: any) {
      setRankingError(err.message || 'Failed to load candidate ranking');
    } finally {
      setRankingLoading(false);
    }
  }, [organizationId, jobId, appliedRankingFilters]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchRanking();
    }
  }, [isSyncing, activeOrganization, canView, fetchRanking]);

  const handleApplyRankingFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedRankingFilters({
      status: rankingStatusInput || undefined,
      minScore: rankingMinScoreInput ? Number(rankingMinScoreInput) : undefined,
      search: rankingSearchInput || undefined,
    });
  };

  const handleClearRankingFilters = () => {
    setRankingStatusInput('');
    setRankingMinScoreInput('');
    setRankingSearchInput('');
    setAppliedRankingFilters({});
  };

  const fetchComparison = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setComparisonLoading(true);
    setComparisonError(null);
    try {
      const response = await employerApi.getEmployerJobCandidateComparison(organizationId, jobId, appliedComparisonFilters);
      setComparison(response.data);
    } catch (err: any) {
      setComparisonError(err.message || 'Failed to load candidate comparison');
    } finally {
      setComparisonLoading(false);
    }
  }, [organizationId, jobId, appliedComparisonFilters]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchComparison();
    }
  }, [isSyncing, activeOrganization, canView, fetchComparison]);

  const handleApplyComparisonFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedComparisonFilters({
      status: comparisonStatusInput || undefined,
      minOverallScore: comparisonMinScoreInput ? Number(comparisonMinScoreInput) : undefined,
      search: comparisonSearchInput || undefined,
    });
  };

  const handleClearComparisonFilters = () => {
    setComparisonStatusInput('');
    setComparisonMinScoreInput('');
    setComparisonSearchInput('');
    setAppliedComparisonFilters({});
  };

  const fetchJobShortlist = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setJobShortlistLoading(true);
    setJobShortlistError(null);
    try {
      const response = await employerApi.getEmployerJobShortlist(organizationId, jobId);
      setJobShortlist(response.data.shortlisted);
    } catch (err: any) {
      setJobShortlistError(err.message || 'Failed to load shortlisted candidates');
    } finally {
      setJobShortlistLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJobShortlist();
    }
  }, [isSyncing, activeOrganization, canView, fetchJobShortlist]);

  const handleShortlist = async (applicationId: string, candidateName: string) => {
    if (!organizationId) return;
    if (!window.confirm(`Shortlist ${candidateName} for this job?`)) return;
    setShortlistActionError(null);
    setShortlistingApplicationId(applicationId);
    try {
      await employerApi.shortlistApplication(organizationId, applicationId);
      // No optimistic update — refetch both the ranking table and the shortlist section from the server.
      await Promise.all([fetchRanking(), fetchJobShortlist()]);
    } catch (err: any) {
      setShortlistActionError(err.message || 'Failed to shortlist candidate');
    } finally {
      setShortlistingApplicationId(null);
    }
  };

  const applicationsTotalPages = Math.max(1, Math.ceil(applicationsTotal / APPLICATIONS_PAGE_LIMIT));
  const appliedCandidateIds = new Set(applications.map((a) => a.candidateId));

  const canAddCandidate =
    canManage && !!job && job.status !== 'archived' && job.status !== 'closed';
  const canShortlist = canManage && job?.status !== 'archived';

  const handleOpenAddCandidate = () => {
    setShowAddCandidate(true);
    setCandidateSearch('');
    setCandidateSearchResults([]);
    setCandidateSearchError(null);
    setAddCandidateError(null);
  };

  const handleSearchCandidates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setCandidateSearchLoading(true);
    setCandidateSearchError(null);
    try {
      const response = await employerApi.listCandidates(organizationId, { search: candidateSearch || undefined, status: 'active', limit: 20 });
      setCandidateSearchResults(response.data.candidates);
    } catch (err: any) {
      setCandidateSearchError(err.message || 'Failed to search candidates');
    } finally {
      setCandidateSearchLoading(false);
    }
  };

  const handleAddCandidate = async (candidate: EmployerCandidate) => {
    if (!organizationId || !jobId) return;
    setAddCandidateError(null);
    setAddingCandidateId(candidate.id);
    try {
      await employerApi.createApplication(organizationId, { jobId, candidateId: candidate.id, source: 'manual' });
      setShowAddCandidate(false);
      setApplicationsPage(1);
      await fetchApplications();
    } catch (err: any) {
      setAddCandidateError(err.message || 'Failed to add candidate to this job');
    } finally {
      setAddingCandidateId(null);
    }
  };

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

            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2 mb-0">
                  <Briefcase size={18} className="text-mentor-text-muted" />
                  Applications
                </h2>
                {canAddCandidate && !showAddCandidate && (
                  <button onClick={handleOpenAddCandidate} className="btn btn-secondary">
                    <Plus size={16} />
                    Add Candidate
                  </button>
                )}
              </div>

              {job.status === 'archived' && (
                <p className="text-xs text-mentor-text-muted mb-4">This job is archived — applications are read-only.</p>
              )}
              {job.status === 'closed' && (
                <p className="text-xs text-mentor-text-muted mb-4">This job is closed — no new candidates can be added.</p>
              )}

              {showAddCandidate && (
                <div className="surface-muted p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="label mb-0">Add Candidate</p>
                    <button onClick={() => setShowAddCandidate(false)} className="text-mentor-text-muted hover:text-mentor-text" aria-label="Close">
                      <X size={16} />
                    </button>
                  </div>
                  {addCandidateError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-3">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{addCandidateError}</p>
                    </div>
                  )}
                  <form onSubmit={handleSearchCandidates} className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                      placeholder="Search candidates by name or email..."
                      className="input flex-1"
                    />
                    <button type="submit" disabled={candidateSearchLoading} className="btn btn-primary">
                      {candidateSearchLoading ? 'Searching...' : 'Search'}
                    </button>
                  </form>

                  {candidateSearchError ? (
                    <p className="text-sm text-mentor-error">{candidateSearchError}</p>
                  ) : candidateSearchResults.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary">
                      {candidateSearchLoading ? 'Searching...' : 'Search for a candidate to add to this job.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-mentor-border max-h-72 overflow-y-auto">
                      {candidateSearchResults.map((candidate) => {
                        const alreadyApplied = appliedCandidateIds.has(candidate.id);
                        return (
                          <div key={candidate.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-mentor-text truncate">
                                {candidate.firstName} {candidate.lastName}
                              </p>
                              <p className="text-xs text-mentor-text-muted truncate">{candidate.email}</p>
                            </div>
                            <button
                              onClick={() => handleAddCandidate(candidate)}
                              disabled={alreadyApplied || addingCandidateId === candidate.id}
                              className="btn btn-secondary px-3 py-1.5 text-xs shrink-0"
                            >
                              {alreadyApplied ? 'Already Applied' : addingCandidateId === candidate.id ? 'Adding...' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {applicationsLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : applicationsError ? (
                <div className="p-8 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{applicationsError}</p>
                  <button onClick={fetchApplications} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : applications.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No candidates have applied to this job yet.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {applications.map((application) => (
                    <div
                      key={application.id}
                      onClick={() => navigate(`/organizations/${organizationId}/employer/applications/${application.id}`)}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 cursor-pointer hover:bg-mentor-surface transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/organizations/${organizationId}/employer/candidates/${application.candidateId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-mentor-text hover:underline"
                        >
                          {application.candidate ? `${application.candidate.firstName} ${application.candidate.lastName}` : 'Unknown candidate'}
                        </Link>
                        <p className="text-xs text-mentor-text-muted">{application.candidate?.email || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <span className="badge badge-neutral">{application.source}</span>
                        <span className={`badge ${APPLICATION_STATUS_BADGE[application.status]}`}>
                          {APPLICATION_STATUS_LABELS[application.status]}
                        </span>
                        <span className="text-xs text-mentor-text-muted whitespace-nowrap">{formatDate(application.appliedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!applicationsLoading && !applicationsError && applicationsTotalPages > 1 && (
                <div className="px-1 py-4 border-t border-mentor-border flex items-center justify-between gap-4 mt-2">
                  <p className="text-xs text-mentor-text-muted">
                    Page {applicationsPage} of {applicationsTotalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApplicationsPage((p) => Math.max(1, p - 1))}
                      disabled={applicationsPage <= 1}
                      className="btn btn-secondary px-3 py-2"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      onClick={() => setApplicationsPage((p) => Math.min(applicationsTotalPages, p + 1))}
                      disabled={applicationsPage >= applicationsTotalPages}
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
              <h2 className="section-title flex items-center gap-2 mb-1">
                <ListOrdered size={18} className="text-mentor-text-muted" />
                Candidate Ranking
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                Ranking uses Explainable Score (19B). The AI screening score is shown for reference only.
              </p>

              <form onSubmit={handleApplyRankingFilters} className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="label mb-1 block">Status</label>
                  <select
                    value={rankingStatusInput}
                    onChange={(e) => setRankingStatusInput(e.target.value as EmployerJobApplicationStatus | '')}
                    className="input"
                  >
                    <option value="">All statuses</option>
                    {APPLICATION_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {APPLICATION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label mb-1 block">Min. Score</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rankingMinScoreInput}
                    onChange={(e) => setRankingMinScoreInput(e.target.value)}
                    placeholder="0"
                    className="input w-24"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="label mb-1 block">Search Candidate</label>
                  <input
                    type="text"
                    value={rankingSearchInput}
                    onChange={(e) => setRankingSearchInput(e.target.value)}
                    placeholder="Name or email..."
                    className="input w-full"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  Apply
                </button>
                <button type="button" onClick={handleClearRankingFilters} className="btn btn-secondary">
                  Clear
                </button>
              </form>

              {rankingLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : rankingError ? (
                <div className="p-8 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{rankingError}</p>
                  <button onClick={fetchRanking} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : !ranking || ranking.summary.totalApplications === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No applications yet.</p>
              ) : (
                <>
                  <p className="text-xs text-mentor-text-muted mb-3">
                    {ranking.summary.rankedCount} ranked &middot; {ranking.summary.unrankedCount} not yet ranked
                    {ranking.summary.averageScore !== undefined && (
                      <>
                        {' '}
                        &middot; avg {ranking.summary.averageScore} &middot; high {ranking.summary.highestScore} &middot; low{' '}
                        {ranking.summary.lowestScore}
                      </>
                    )}
                  </p>

                  {ranking.ranked.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary py-4">
                      {Object.keys(appliedRankingFilters).some((k) => (appliedRankingFilters as any)[k])
                        ? 'No ranked candidates match these filters.'
                        : 'No candidates have an explainable score yet.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto -mx-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                            <th className="px-2 py-2 font-medium">Rank</th>
                            <th className="px-2 py-2 font-medium">Candidate</th>
                            <th className="px-2 py-2 font-medium">Status</th>
                            <th className="px-2 py-2 font-medium">Explainable</th>
                            <th className="px-2 py-2 font-medium">AI Score</th>
                            <th className="px-2 py-2 font-medium">Recommendation</th>
                            <th className="px-2 py-2 font-medium">Gaps</th>
                            <th className="px-2 py-2 font-medium">Applied</th>
                            <th className="px-2 py-2 font-medium">Shortlist</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-mentor-border">
                          {ranking.ranked.map((row) => (
                            <tr key={row.applicationId}>
                              <td className="px-2 py-2.5 font-semibold text-mentor-text">#{row.rank}</td>
                              <td className="px-2 py-2.5">
                                <Link
                                  to={`/organizations/${organizationId}/employer/candidates/${row.candidate.id}`}
                                  className="font-medium text-mentor-text hover:underline"
                                >
                                  {row.candidate.firstName} {row.candidate.lastName}
                                </Link>
                                <p className="text-xs text-mentor-text-muted">{row.candidate.email}</p>
                              </td>
                              <td className="px-2 py-2.5">
                                <span className={`badge ${APPLICATION_STATUS_BADGE[row.applicationStatus]}`}>
                                  {APPLICATION_STATUS_LABELS[row.applicationStatus]}
                                </span>
                              </td>
                              <td className="px-2 py-2.5 font-semibold text-mentor-text">{row.explainableScore}/100</td>
                              <td className="px-2 py-2.5 text-mentor-text-secondary">{row.aiScreeningScore}/100</td>
                              <td className="px-2 py-2.5">
                                <span className={`badge ${RECOMMENDATION_BADGE[row.recommendation]}`}>
                                  {RECOMMENDATION_LABELS[row.recommendation]}
                                </span>
                              </td>
                              <td className="px-2 py-2.5 text-xs text-mentor-text-secondary whitespace-nowrap">
                                {row.gapSummary ? `${row.gapSummary.criticalGapCount}c / ${row.gapSummary.highGapCount}h` : '—'}
                              </td>
                              <td className="px-2 py-2.5 text-xs text-mentor-text-muted whitespace-nowrap">
                                <Link to={`/organizations/${organizationId}/employer/applications/${row.applicationId}`} className="hover:underline">
                                  {formatDate(row.scoredAt)}
                                </Link>
                              </td>
                              <td className="px-2 py-2.5 whitespace-nowrap">
                                {row.applicationStatus === 'shortlisted' ? (
                                  <span className="badge badge-success">Shortlisted</span>
                                ) : row.applicationStatus === 'screening' && canShortlist ? (
                                  <button
                                    onClick={() => handleShortlist(row.applicationId, `${row.candidate.firstName} ${row.candidate.lastName}`)}
                                    disabled={shortlistingApplicationId === row.applicationId}
                                    className="btn btn-secondary px-3 py-1.5 text-xs"
                                  >
                                    <Star size={14} />
                                    {shortlistingApplicationId === row.applicationId ? 'Shortlisting...' : 'Shortlist'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-mentor-text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {shortlistActionError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mt-3">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{shortlistActionError}</p>
                    </div>
                  )}

                  {ranking.unranked.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-mentor-border">
                      <p className="label mb-2">Not yet ranked</p>
                      <div className="divide-y divide-mentor-border">
                        {ranking.unranked.map((row) => (
                          <Link
                            key={row.applicationId}
                            to={`/organizations/${organizationId}/employer/applications/${row.applicationId}`}
                            className="flex items-center justify-between gap-3 py-2.5 hover:bg-mentor-surface transition-colors -mx-2 px-2 rounded"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-mentor-text truncate">
                                {row.candidate.firstName} {row.candidate.lastName}
                              </p>
                              <p className="text-xs text-mentor-text-muted truncate">{row.candidate.email}</p>
                            </div>
                            <span className="badge badge-neutral shrink-0">{UNRANKED_REASON_LABELS[row.reason] || row.reason}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <Scale size={18} className="text-mentor-text-muted" />
                Assessment Comparison
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                Ordered by finalized post-assessment evidence (comparisonPosition) — distinct from Candidate Ranking above, which uses
                pre-interview screening scores.
              </p>

              <form onSubmit={handleApplyComparisonFilters} className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="label mb-1 block">Status</label>
                  <select
                    value={comparisonStatusInput}
                    onChange={(e) => setComparisonStatusInput(e.target.value as EmployerJobApplicationStatus | '')}
                    className="input"
                  >
                    <option value="">All statuses</option>
                    {APPLICATION_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {APPLICATION_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label mb-1 block">Min. Overall Score</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={comparisonMinScoreInput}
                    onChange={(e) => setComparisonMinScoreInput(e.target.value)}
                    placeholder="0"
                    className="input w-24"
                  />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="label mb-1 block">Search Candidate</label>
                  <input
                    type="text"
                    value={comparisonSearchInput}
                    onChange={(e) => setComparisonSearchInput(e.target.value)}
                    placeholder="First or last name..."
                    className="input w-full"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  Apply
                </button>
                <button type="button" onClick={handleClearComparisonFilters} className="btn btn-secondary">
                  Clear
                </button>
              </form>

              {comparisonLoading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : comparisonError ? (
                <div className="p-8 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{comparisonError}</p>
                  <button onClick={fetchComparison} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : !comparison || comparison.summary.totalApplications === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No applications yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                    <div className="surface-muted p-3">
                      <p className="text-xs text-mentor-text-muted">Finalized</p>
                      <p className="text-lg font-semibold text-mentor-text">{comparison.summary.finalizedCount}</p>
                    </div>
                    <div className="surface-muted p-3">
                      <p className="text-xs text-mentor-text-muted">Awaiting Finalization</p>
                      <p className="text-lg font-semibold text-mentor-text">{comparison.summary.notReadyCount}</p>
                    </div>
                    <div className="surface-muted p-3">
                      <p className="text-xs text-mentor-text-muted">Average Score</p>
                      <p className="text-lg font-semibold text-mentor-text">
                        {comparison.summary.averageOverallScore !== undefined ? `${comparison.summary.averageOverallScore}/100` : '—'}
                      </p>
                    </div>
                  </div>

                  {comparison.comparison.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary py-4">
                      {Object.keys(appliedComparisonFilters).some((k) => (appliedComparisonFilters as any)[k])
                        ? 'No finalized candidates match these filters.'
                        : 'No candidates have a finalized assessment yet.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto -mx-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                            <th className="px-2 py-2 font-medium">#</th>
                            <th className="px-2 py-2 font-medium">Candidate</th>
                            <th className="px-2 py-2 font-medium">Status</th>
                            <th className="px-2 py-2 font-medium">Overall</th>
                            <th className="px-2 py-2 font-medium">Rubric</th>
                            <th className="px-2 py-2 font-medium">Coverage</th>
                            <th className="px-2 py-2 font-medium">Weight</th>
                            <th className="px-2 py-2 font-medium">Evidence</th>
                            <th className="px-2 py-2 font-medium">Follow-up</th>
                            <th className="px-2 py-2 font-medium">Finalized</th>
                            <th className="px-2 py-2 font-medium" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-mentor-border">
                          {comparison.comparison.map((row) => (
                            <React.Fragment key={row.applicationId}>
                              <tr>
                                <td className="px-2 py-2.5 font-semibold text-mentor-text">#{row.comparisonPosition}</td>
                                <td className="px-2 py-2.5">
                                  <Link
                                    to={`/organizations/${organizationId}/employer/applications/${row.applicationId}`}
                                    className="font-medium text-mentor-text hover:underline"
                                  >
                                    {row.candidate.firstName} {row.candidate.lastName}
                                  </Link>
                                </td>
                                <td className="px-2 py-2.5">
                                  <span className={`badge ${APPLICATION_STATUS_BADGE[row.applicationStatus]}`}>
                                    {APPLICATION_STATUS_LABELS[row.applicationStatus]}
                                  </span>
                                </td>
                                <td className="px-2 py-2.5 font-semibold text-mentor-text">{row.assessment.overallScore}/100</td>
                                <td className="px-2 py-2.5 text-mentor-text-secondary">{row.assessment.averageRubricScore}/5</td>
                                <td className="px-2 py-2.5 text-mentor-text-secondary">{row.assessment.competencyCoveragePercent}%</td>
                                <td className="px-2 py-2.5 text-mentor-text-secondary">{row.assessment.assessedWeight}%</td>
                                <td className="px-2 py-2.5 text-xs text-mentor-text-secondary whitespace-nowrap">
                                  {row.assessment.evidenceSummary.strongCount}s/{row.assessment.evidenceSummary.sufficientCount}sf/
                                  {row.assessment.evidenceSummary.partialCount}p/{row.assessment.evidenceSummary.insufficientCount}i
                                </td>
                                <td className="px-2 py-2.5 text-xs text-mentor-text-secondary whitespace-nowrap">
                                  {row.assessment.evidenceSummary.followUpCompetencyCount} (
                                  {row.assessment.evidenceSummary.criticalFollowUpCount} critical)
                                </td>
                                <td className="px-2 py-2.5 text-xs text-mentor-text-muted whitespace-nowrap">
                                  {formatDate(row.assessment.finalizedAt)}
                                </td>
                                <td className="px-2 py-2.5 whitespace-nowrap">
                                  <button
                                    onClick={() =>
                                      setExpandedComparisonRow(expandedComparisonRow === row.applicationId ? null : row.applicationId)
                                    }
                                    className="btn btn-secondary px-2 py-1"
                                    aria-label="Toggle competency detail"
                                  >
                                    {expandedComparisonRow === row.applicationId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </button>
                                </td>
                              </tr>
                              {expandedComparisonRow === row.applicationId && (
                                <tr>
                                  <td colSpan={11} className="px-2 py-3 bg-mentor-surface">
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {row.competencies.map((c) => (
                                        <div key={c.competencyName} className="surface-muted p-2">
                                          <p className="text-xs font-medium text-mentor-text">
                                            {c.competencyName} <span className="text-mentor-text-muted capitalize">({c.importance})</span>
                                          </p>
                                          <p className="text-xs text-mentor-text-secondary">
                                            JD Weight: {c.jdWeight}% &middot; Score: {c.score}/5 &middot;{' '}
                                            <span className="capitalize">{c.evidenceStatus}</span>
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {comparison.notReady.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-mentor-border">
                      <p className="label mb-2">Assessment not finalized</p>
                      <div className="divide-y divide-mentor-border">
                        {comparison.notReady.map((row) => (
                          <Link
                            key={row.applicationId}
                            to={`/organizations/${organizationId}/employer/applications/${row.applicationId}`}
                            className="flex items-center justify-between gap-3 py-2.5 hover:bg-mentor-surface transition-colors -mx-2 px-2 rounded"
                          >
                            <p className="text-sm font-medium text-mentor-text truncate">
                              {row.candidate.firstName} {row.candidate.lastName}
                            </p>
                            <span className="badge badge-neutral shrink-0">Assessment not finalized</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Star size={18} className="text-mentor-text-muted" />
                Shortlisted Candidates
              </h2>

              {jobShortlistLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : jobShortlistError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{jobShortlistError}</p>
                  <button onClick={fetchJobShortlist} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : jobShortlist.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No candidates shortlisted yet.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {jobShortlist.map((row) => (
                    <div key={row.applicationId} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
                      <div className="flex-1 min-w-0">
                        {row.candidate ? (
                          <Link
                            to={`/organizations/${organizationId}/employer/candidates/${row.candidate.id}`}
                            className="text-sm font-medium text-mentor-text hover:underline"
                          >
                            {row.candidate.firstName} {row.candidate.lastName}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-mentor-text">Unknown candidate</p>
                        )}
                        <p className="text-xs text-mentor-text-muted">{row.candidate?.email || '—'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        {row.explainableScore !== null && (
                          <span className="text-sm font-semibold text-mentor-text">{row.explainableScore}/100</span>
                        )}
                        <span className={`badge ${APPLICATION_STATUS_BADGE[row.applicationStatus]}`}>
                          {APPLICATION_STATUS_LABELS[row.applicationStatus]}
                        </span>
                        <Link
                          to={`/organizations/${organizationId}/employer/applications/${row.applicationId}`}
                          className="text-xs text-mentor-text-muted hover:underline whitespace-nowrap"
                        >
                          {row.shortlistedAt ? formatDate(row.shortlistedAt) : '—'}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerJobDetailPage;
