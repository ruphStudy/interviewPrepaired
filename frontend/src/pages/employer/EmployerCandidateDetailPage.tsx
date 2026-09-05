import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerCandidate,
  EmployerCandidateStatus,
  EmployerCandidateSource,
  EMPLOYER_CANDIDATE_SOURCES,
  EMPLOYER_CANDIDATE_STATUS_TRANSITIONS,
  CandidateResume,
  CANDIDATE_RESUME_ALLOWED_EXTENSIONS,
  CANDIDATE_RESUME_MAX_FILE_SIZE_BYTES,
  CandidateResumeAnalysis,
  CandidateResumeProfile,
  EmployerJobApplication,
  CandidateSourceAttribution,
} from '../../api/employerApi';
import { EMPTY_CANDIDATE_FORM, CandidateFormState, candidateFormToPayload, candidateToFormState } from './candidateFormUtils';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  CheckCircle2,
  FileText,
  Download,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Tag,
  Plus,
  X,
} from 'lucide-react';

const CANDIDATE_APPLICATIONS_PAGE_LIMIT = 20;

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

const RESUME_FILE_TYPE_LABELS: Record<string, string> = {
  '.pdf': 'PDF',
  '.docx': 'Word (DOCX)',
  '.doc': 'Word (DOC)',
  '.txt': 'Text',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCost(usd: number): string {
  return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

/** Compact usage strip shown under a completed analysis — model, total tokens, estimated cost. Only rendered when the backend actually returned aiUsage. */
const ResumeAnalysisUsage: React.FC<{ usage: CandidateResumeAnalysis['aiUsage'] }> = ({ usage }) => {
  if (!usage) return null;
  return (
    <p className="text-xs text-mentor-text-muted">
      {usage.model} &middot; {usage.totalTokens.toLocaleString()} tokens
      {usage.pricingStatus === 'calculated' ? ` · est. ${formatCost(usage.totalCostUsd)}` : ''}
    </p>
  );
};

/** Read-only rendering of a parsed resume profile — reused for both the current analysis section and a historical version's expanded view. */
const ResumeProfileSummary: React.FC<{ profile: CandidateResumeProfile }> = ({ profile }) => {
  const displayName = profile.name?.fullName || [profile.name?.firstName, profile.name?.lastName].filter(Boolean).join(' ');
  const contactLine = [profile.contact?.email, profile.contact?.phone, profile.contact?.location].filter(Boolean).join(' · ');
  const links = [
    { label: 'LinkedIn', url: profile.contact?.linkedinUrl },
    { label: 'GitHub', url: profile.contact?.githubUrl },
    { label: 'Portfolio', url: profile.contact?.portfolioUrl },
  ].filter((l) => l.url);

  return (
    <div className="space-y-5">
      {(displayName || profile.headline || profile.summary) && (
        <div>
          {displayName && <p className="text-sm font-medium text-mentor-text">{displayName}</p>}
          {profile.headline && <p className="text-sm text-mentor-text-secondary">{profile.headline}</p>}
          {profile.summary && <p className="text-sm text-mentor-text-secondary mt-1 whitespace-pre-wrap">{profile.summary}</p>}
          {profile.totalExperienceYears !== undefined && (
            <p className="text-xs text-mentor-text-muted mt-1">{profile.totalExperienceYears} years total experience</p>
          )}
        </div>
      )}

      {(contactLine || links.length > 0) && (
        <div>
          <p className="label mb-1.5">Contact</p>
          {contactLine && <p className="text-sm text-mentor-text-secondary">{contactLine}</p>}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-3 mt-1">
              {links.map((l) => (
                <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary-600 hover:underline">
                  {l.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {profile.experience.length > 0 && (
        <div>
          <p className="label mb-2">Experience</p>
          <div className="space-y-3">
            {profile.experience.map((exp, i) => (
              <div key={i} className="surface-muted p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium text-mentor-text">
                    {[exp.title, exp.company].filter(Boolean).join(' at ') || 'Untitled role'}
                  </p>
                  {exp.isCurrent && <span className="badge badge-success">Current</span>}
                </div>
                <p className="text-xs text-mentor-text-muted">
                  {[exp.location, [exp.startDate, exp.endDate].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}
                </p>
                {exp.responsibilities.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-mentor-text-secondary mt-1.5 space-y-0.5">
                    {exp.responsibilities.map((r, j) => (
                      <li key={j}>{r}</li>
                    ))}
                  </ul>
                )}
                {exp.achievements.length > 0 && (
                  <ul className="list-disc list-inside text-sm text-mentor-text-secondary mt-1.5 space-y-0.5">
                    {exp.achievements.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {exp.technologies.map((t) => (
                      <span key={t} className="badge badge-neutral">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.education.length > 0 && (
        <div>
          <p className="label mb-2">Education</p>
          <div className="space-y-2">
            {profile.education.map((edu, i) => (
              <div key={i} className="surface-muted p-3">
                <p className="text-sm font-medium text-mentor-text">{edu.degree || 'Degree not specified'}</p>
                <p className="text-xs text-mentor-text-muted">
                  {[edu.field, edu.institution, [edu.startYear, edu.endYear].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.skills.length > 0 && (
        <div>
          <p className="label mb-2">Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.map((s) => (
              <span key={s} className="badge badge-info">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.toolsTechnologies.length > 0 && (
        <div>
          <p className="label mb-2">Tools / Technologies</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.toolsTechnologies.map((t) => (
              <span key={t} className="badge badge-neutral">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.certifications.length > 0 && (
        <div>
          <p className="label mb-2">Certifications</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.certifications.map((c) => (
              <span key={c} className="badge badge-neutral">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.projects.length > 0 && (
        <div>
          <p className="label mb-2">Projects</p>
          <div className="space-y-2">
            {profile.projects.map((proj, i) => (
              <div key={i} className="surface-muted p-3">
                <p className="text-sm font-medium text-mentor-text">{proj.name || 'Untitled project'}</p>
                {proj.description && <p className="text-sm text-mentor-text-secondary mt-0.5">{proj.description}</p>}
                {proj.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {proj.technologies.map((t) => (
                      <span key={t} className="badge badge-neutral">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.languages.length > 0 && (
        <div>
          <p className="label mb-2">Languages</p>
          <div className="flex flex-wrap gap-1.5">
            {profile.languages.map((l) => (
              <span key={l} className="badge badge-neutral">
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="label mb-1.5">Confidence</p>
        <p className="text-sm text-mentor-text-secondary">{Math.round(profile.confidence.overall * 100)}% overall</p>
        {profile.confidence.ambiguousSections.length > 0 && (
          <p className="text-xs text-mentor-text-muted mt-1">
            Less certain about: {profile.confidence.ambiguousSections.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
};

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

  const [resumeCurrent, setResumeCurrent] = useState<CandidateResume | null>(null);
  const [resumeHistory, setResumeHistory] = useState<CandidateResume[]>([]);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [resumeAnalysis, setResumeAnalysis] = useState<CandidateResumeAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeActionError, setAnalyzeActionError] = useState<string | null>(null);

  const [expandedHistoryAnalysisId, setExpandedHistoryAnalysisId] = useState<string | null>(null);
  const [historyAnalysisCache, setHistoryAnalysisCache] = useState<Record<string, CandidateResumeAnalysis | null>>({});
  const [historyAnalysisLoadingId, setHistoryAnalysisLoadingId] = useState<string | null>(null);
  const [historyAnalysisError, setHistoryAnalysisError] = useState<Record<string, string>>({});

  const [applications, setApplications] = useState<EmployerJobApplication[]>([]);
  const [applicationsPage, setApplicationsPage] = useState(1);
  const [applicationsTotal, setApplicationsTotal] = useState(0);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);

  const [sourceAttributions, setSourceAttributions] = useState<CandidateSourceAttribution[]>([]);
  const [sourceAttributionsLoading, setSourceAttributionsLoading] = useState(true);
  const [sourceAttributionsError, setSourceAttributionsError] = useState<string | null>(null);

  const [showAddAttribution, setShowAddAttribution] = useState(false);
  const [attrSource, setAttrSource] = useState<EmployerCandidateSource | ''>('');
  const [attrSourceName, setAttrSourceName] = useState('');
  const [attrExternalReferenceId, setAttrExternalReferenceId] = useState('');
  const [attrReferrerName, setAttrReferrerName] = useState('');
  const [attrReferrerEmail, setAttrReferrerEmail] = useState('');
  const [attrAgencyName, setAttrAgencyName] = useState('');
  const [attrJobPortalName, setAttrJobPortalName] = useState('');
  const [attrCampaignName, setAttrCampaignName] = useState('');
  const [attrSourceUrl, setAttrSourceUrl] = useState('');
  const [attrNotes, setAttrNotes] = useState('');
  const [addAttributionSubmitting, setAddAttributionSubmitting] = useState(false);
  const [addAttributionError, setAddAttributionError] = useState<string | null>(null);

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

  const fetchResumes = useCallback(async () => {
    if (!organizationId || !candidateId) return;
    setResumeLoading(true);
    setResumeError(null);
    try {
      const response = await employerApi.getCandidateResumes(organizationId, candidateId);
      setResumeCurrent(response.data.current);
      setResumeHistory(response.data.history);
    } catch (err: any) {
      setResumeError(err.message || 'Failed to load resumes');
    } finally {
      setResumeLoading(false);
    }
  }, [organizationId, candidateId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchResumes();
    }
  }, [isSyncing, activeOrganization, canView, fetchResumes]);

  const handleResumeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    const file = e.target.files?.[0] || null;
    if (!file) {
      setUploadFile(null);
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!CANDIDATE_RESUME_ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Unsupported file type. Supported formats: ${CANDIDATE_RESUME_ALLOWED_EXTENSIONS.join(', ')}`);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > CANDIDATE_RESUME_MAX_FILE_SIZE_BYTES) {
      setUploadError(`File exceeds the maximum size of ${Math.floor(CANDIDATE_RESUME_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB`);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadFile(file);
  };

  const handleUploadResume = async () => {
    if (!organizationId || !candidateId || !uploadFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      await employerApi.uploadCandidateResume(organizationId, candidateId, uploadFile);
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setUploadSuccess('Resume uploaded successfully.');
      setTimeout(() => setUploadSuccess(null), 3000);
      await fetchResumes();
      // The new upload is now the current resume — re-check its analysis
      // state from the server (a brand-new version always comes back null,
      // "Not analyzed yet." — analysis is never copied forward).
      await fetchResumeAnalysis();
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload resume');
    } finally {
      setUploading(false);
    }
  };

  const fetchResumeAnalysis = useCallback(async () => {
    if (!organizationId || !candidateId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const response = await employerApi.getCurrentCandidateResumeAnalysis(organizationId, candidateId);
      setResumeAnalysis(response.data.analysis);
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to load resume analysis');
    } finally {
      setAnalysisLoading(false);
    }
  }, [organizationId, candidateId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchResumeAnalysis();
    }
  }, [isSyncing, activeOrganization, canView, fetchResumeAnalysis]);

  const handleAnalyzeResume = async () => {
    if (!organizationId || !candidateId) return;
    setAnalyzing(true);
    setAnalyzeActionError(null);
    try {
      const response = await employerApi.analyzeCurrentCandidateResume(organizationId, candidateId);
      setResumeAnalysis(response.data.analysis);
    } catch (err: any) {
      setAnalyzeActionError(err.message || 'Failed to analyze resume');
      // The backend already persisted a FAILED row for a genuine analysis
      // failure — refetch so the failure/errorMessage is reflected here too.
      await fetchResumeAnalysis();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleToggleHistoryAnalysis = async (resume: CandidateResume) => {
    if (expandedHistoryAnalysisId === resume.id) {
      setExpandedHistoryAnalysisId(null);
      return;
    }
    setExpandedHistoryAnalysisId(resume.id);
    if (historyAnalysisCache[resume.id] !== undefined || !organizationId || !candidateId) return;
    setHistoryAnalysisLoadingId(resume.id);
    setHistoryAnalysisError((prev) => {
      const next = { ...prev };
      delete next[resume.id];
      return next;
    });
    try {
      const response = await employerApi.getCandidateResumeAnalysis(organizationId, candidateId, resume.id);
      setHistoryAnalysisCache((prev) => ({ ...prev, [resume.id]: response.data.analysis }));
    } catch (err: any) {
      setHistoryAnalysisError((prev) => ({ ...prev, [resume.id]: err.message || 'Failed to load analysis' }));
    } finally {
      setHistoryAnalysisLoadingId(null);
    }
  };

  const handleDownloadResume = async (resume: CandidateResume) => {
    if (!organizationId || !candidateId) return;
    setDownloadError(null);
    setDownloadingId(resume.id);
    try {
      const blob = await employerApi.getCandidateResumeFile(organizationId, candidateId, resume.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resume.originalFileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download resume');
    } finally {
      setDownloadingId(null);
    }
  };

  const fetchApplications = useCallback(async () => {
    if (!organizationId || !candidateId) return;
    setApplicationsLoading(true);
    setApplicationsError(null);
    try {
      const response = await employerApi.listApplications(organizationId, {
        candidateId,
        page: applicationsPage,
        limit: CANDIDATE_APPLICATIONS_PAGE_LIMIT,
      });
      setApplications(response.data.applications);
      setApplicationsTotal(response.data.pagination.total);
    } catch (err: any) {
      setApplicationsError(err.message || 'Failed to load job applications');
    } finally {
      setApplicationsLoading(false);
    }
  }, [organizationId, candidateId, applicationsPage]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchApplications();
    }
  }, [isSyncing, activeOrganization, canView, fetchApplications]);

  const applicationsTotalPages = Math.max(1, Math.ceil(applicationsTotal / CANDIDATE_APPLICATIONS_PAGE_LIMIT));

  const fetchSourceAttributions = useCallback(async () => {
    if (!organizationId || !candidateId) return;
    setSourceAttributionsLoading(true);
    setSourceAttributionsError(null);
    try {
      const response = await employerApi.listCandidateSourceAttributions(organizationId, candidateId);
      setSourceAttributions(response.data.attributions);
    } catch (err: any) {
      setSourceAttributionsError(err.message || 'Failed to load source attribution history');
    } finally {
      setSourceAttributionsLoading(false);
    }
  }, [organizationId, candidateId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchSourceAttributions();
    }
  }, [isSyncing, activeOrganization, canView, fetchSourceAttributions]);

  const handleOpenAddAttribution = () => {
    setShowAddAttribution(true);
    setAttrSource('');
    setAttrSourceName('');
    setAttrExternalReferenceId('');
    setAttrReferrerName('');
    setAttrReferrerEmail('');
    setAttrAgencyName('');
    setAttrJobPortalName('');
    setAttrCampaignName('');
    setAttrSourceUrl('');
    setAttrNotes('');
    setAddAttributionError(null);
  };

  const handleAddAttribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !candidateId) return;
    if (!attrSource) {
      setAddAttributionError('Source is required');
      return;
    }
    setAddAttributionSubmitting(true);
    setAddAttributionError(null);
    try {
      await employerApi.createCandidateSourceAttribution(organizationId, candidateId, {
        source: attrSource,
        sourceName: attrSourceName.trim() || undefined,
        externalReferenceId: attrExternalReferenceId.trim() || undefined,
        referrerName: attrReferrerName.trim() || undefined,
        referrerEmail: attrReferrerEmail.trim() || undefined,
        agencyName: attrAgencyName.trim() || undefined,
        jobPortalName: attrJobPortalName.trim() || undefined,
        campaignName: attrCampaignName.trim() || undefined,
        sourceUrl: attrSourceUrl.trim() || undefined,
        notes: attrNotes.trim() || undefined,
      });
      setShowAddAttribution(false);
      await fetchSourceAttributions();
    } catch (err: any) {
      setAddAttributionError(err.message || 'Failed to record source attribution');
    } finally {
      setAddAttributionSubmitting(false);
    }
  };

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

            <div className="card mt-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2 mb-0">
                  <Tag size={18} className="text-mentor-text-muted" />
                  Source & Attribution
                </h2>
                {canManage && candidate.status !== 'archived' && !showAddAttribution && (
                  <button onClick={handleOpenAddAttribution} className="btn btn-secondary">
                    <Plus size={16} />
                    Add Source Attribution
                  </button>
                )}
              </div>

              <div className="surface-muted p-3 mb-4">
                <p className="text-xs text-mentor-text-muted mb-1">Primary Source</p>
                <p className="text-sm font-medium text-mentor-text">{sourceLabel(candidate.source)}</p>
                <p className="text-xs text-mentor-text-muted mt-1">
                  This is the candidate's current primary source. Changing it (via Edit above) never rewrites the history below.
                </p>
              </div>

              {activeOrganization.status === 'archived' && (
                <p className="text-xs text-mentor-text-muted mb-4">
                  This organization is archived — adding a source attribution is disabled.
                </p>
              )}
              {activeOrganization.status !== 'archived' && candidate.status === 'archived' && (
                <p className="text-xs text-mentor-text-muted mb-4">
                  This candidate is archived — adding a source attribution is disabled.
                </p>
              )}

              {showAddAttribution && (
                <form onSubmit={handleAddAttribution} className="surface-muted p-4 mb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="label mb-0">Add Source Attribution</p>
                    <button
                      type="button"
                      onClick={() => setShowAddAttribution(false)}
                      className="text-mentor-text-muted hover:text-mentor-text"
                      aria-label="Close"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {addAttributionError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{addAttributionError}</p>
                    </div>
                  )}
                  <div>
                    <label className="label">Source</label>
                    <select
                      value={attrSource}
                      onChange={(e) => setAttrSource(e.target.value as EmployerCandidateSource)}
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

                  {attrSource === 'referral' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Referrer Name</label>
                        <input
                          type="text"
                          value={attrReferrerName}
                          onChange={(e) => setAttrReferrerName(e.target.value)}
                          className="input"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="label">Referrer Email</label>
                        <input
                          type="email"
                          value={attrReferrerEmail}
                          onChange={(e) => setAttrReferrerEmail(e.target.value)}
                          className="input"
                          maxLength={254}
                        />
                      </div>
                    </div>
                  )}

                  {attrSource === 'agency' && (
                    <div>
                      <label className="label">Agency Name</label>
                      <input
                        type="text"
                        value={attrAgencyName}
                        onChange={(e) => setAttrAgencyName(e.target.value)}
                        className="input"
                        maxLength={200}
                      />
                    </div>
                  )}

                  {attrSource === 'job_portal' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Job Portal Name</label>
                        <input
                          type="text"
                          value={attrJobPortalName}
                          onChange={(e) => setAttrJobPortalName(e.target.value)}
                          className="input"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="label">External Reference ID</label>
                        <input
                          type="text"
                          value={attrExternalReferenceId}
                          onChange={(e) => setAttrExternalReferenceId(e.target.value)}
                          className="input"
                          maxLength={150}
                        />
                      </div>
                    </div>
                  )}

                  {attrSource === 'careers' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Campaign Name</label>
                        <input
                          type="text"
                          value={attrCampaignName}
                          onChange={(e) => setAttrCampaignName(e.target.value)}
                          className="input"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="label">Source URL</label>
                        <input
                          type="url"
                          value={attrSourceUrl}
                          onChange={(e) => setAttrSourceUrl(e.target.value)}
                          className="input"
                          maxLength={300}
                        />
                      </div>
                    </div>
                  )}

                  {attrSource === 'import' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Source Name</label>
                        <input
                          type="text"
                          value={attrSourceName}
                          onChange={(e) => setAttrSourceName(e.target.value)}
                          className="input"
                          maxLength={200}
                        />
                      </div>
                      <div>
                        <label className="label">External Reference ID</label>
                        <input
                          type="text"
                          value={attrExternalReferenceId}
                          onChange={(e) => setAttrExternalReferenceId(e.target.value)}
                          className="input"
                          maxLength={150}
                        />
                      </div>
                    </div>
                  )}

                  {(attrSource === 'manual' || attrSource === 'other') && (
                    <div>
                      <label className="label">Source Name (optional)</label>
                      <input
                        type="text"
                        value={attrSourceName}
                        onChange={(e) => setAttrSourceName(e.target.value)}
                        className="input"
                        maxLength={200}
                      />
                    </div>
                  )}

                  <div>
                    <label className="label">Notes</label>
                    <textarea value={attrNotes} onChange={(e) => setAttrNotes(e.target.value)} className="input" rows={2} maxLength={1000} />
                  </div>

                  <div className="flex items-center gap-3">
                    <button type="submit" disabled={addAttributionSubmitting} className="btn btn-primary">
                      {addAttributionSubmitting ? 'Saving...' : 'Save Attribution'}
                    </button>
                    <button type="button" onClick={() => setShowAddAttribution(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              <p className="label mb-2">Source History</p>
              {sourceAttributionsLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : sourceAttributionsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{sourceAttributionsError}</p>
                  <button onClick={fetchSourceAttributions} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : sourceAttributions.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary py-2">No additional source attribution recorded.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {sourceAttributions.map((attr) => {
                    const detailParts = [attr.sourceName, attr.referrerName, attr.agencyName, attr.jobPortalName, attr.campaignName].filter(
                      Boolean
                    );
                    return (
                      <div key={attr.id} className="py-3">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="badge badge-neutral">{sourceLabel(attr.source)}</span>
                          {detailParts.length > 0 && <span className="text-sm text-mentor-text">{detailParts.join(' · ')}</span>}
                        </div>
                        {attr.referrerEmail && <p className="text-xs text-mentor-text-muted">{attr.referrerEmail}</p>}
                        {attr.externalReferenceId && <p className="text-xs text-mentor-text-muted">Ref: {attr.externalReferenceId}</p>}
                        {attr.sourceUrl && (
                          <a
                            href={attr.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary-600 hover:underline break-all"
                          >
                            {attr.sourceUrl}
                          </a>
                        )}
                        {attr.notes && <p className="text-sm text-mentor-text-secondary mt-1">{attr.notes}</p>}
                        <p className="text-xs text-mentor-text-muted mt-1">
                          {formatDate(attr.createdAt)} &middot; recorded by membership {attr.recordedByMembershipId}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <FileText size={18} className="text-mentor-text-muted" />
                Resume
              </h2>

              {resumeLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : resumeError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{resumeError}</p>
                  <button onClick={fetchResumes} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {!resumeCurrent ? (
                    <p className="text-sm text-mentor-text-secondary py-2 mb-4">No resume uploaded yet.</p>
                  ) : (
                    <div className="surface-muted p-4 mb-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="badge badge-success">Current</span>
                          <span className="badge badge-info">v{resumeCurrent.version}</span>
                          <span className="text-sm font-medium text-mentor-text truncate">{resumeCurrent.originalFileName}</span>
                        </div>
                        <p className="text-xs text-mentor-text-muted">
                          {RESUME_FILE_TYPE_LABELS[resumeCurrent.fileExtension] || resumeCurrent.fileExtension} &middot;{' '}
                          {formatFileSize(resumeCurrent.fileSize)} &middot; Uploaded {formatDate(resumeCurrent.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownloadResume(resumeCurrent)}
                        disabled={downloadingId === resumeCurrent.id}
                        className="btn btn-secondary shrink-0"
                      >
                        <Download size={16} />
                        {downloadingId === resumeCurrent.id ? 'Downloading...' : 'View / Download'}
                      </button>
                    </div>
                  )}

                  {downloadError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{downloadError}</p>
                    </div>
                  )}

                  {canManage && candidate.status !== 'archived' && (
                    <div className="surface-muted p-4 mb-5">
                      {uploadError && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-3">
                          <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-error">{uploadError}</p>
                        </div>
                      )}
                      {uploadSuccess && (
                        <div className="flex items-start gap-2 bg-mentor-mint dark:bg-future-success/10 border border-emerald-200 dark:border-future-success/20 rounded-lg p-3 mb-3">
                          <CheckCircle2 size={16} className="text-mentor-success mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-success">{uploadSuccess}</p>
                        </div>
                      )}
                      <label className="label">{resumeCurrent ? 'Upload New Version' : 'Upload Resume'}</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={CANDIDATE_RESUME_ALLOWED_EXTENSIONS.join(',')}
                        onChange={handleResumeFileChange}
                        className="input"
                      />
                      <p className="text-xs text-mentor-text-muted mt-1.5">
                        Supported formats: PDF, DOCX, DOC, TXT &middot; Max size:{' '}
                        {Math.floor(CANDIDATE_RESUME_MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <button onClick={handleUploadResume} disabled={!uploadFile || uploading} className="btn btn-primary">
                          {uploading ? 'Uploading...' : resumeCurrent ? 'Upload New Version' : 'Upload Resume'}
                        </button>
                      </div>
                    </div>
                  )}

                  {activeOrganization.status === 'archived' && (
                    <p className="text-xs text-mentor-text-muted mb-4">This organization is archived — resume upload is disabled.</p>
                  )}
                  {activeOrganization.status !== 'archived' && candidate.status === 'archived' && (
                    <p className="text-xs text-mentor-text-muted mb-4">This candidate is archived — resume upload is disabled.</p>
                  )}

                  {resumeHistory.length > 0 && (
                    <div>
                      <p className="label mb-2">Version History</p>
                      <div className="divide-y divide-mentor-border">
                        {resumeHistory.map((resume) => {
                          const isExpanded = expandedHistoryAnalysisId === resume.id;
                          const cachedAnalysis = historyAnalysisCache[resume.id];
                          const rowAnalysisError = historyAnalysisError[resume.id];
                          return (
                            <div key={resume.id} className="py-3">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {resume.isCurrent && <span className="badge badge-success">Current</span>}
                                    <span className="badge badge-neutral">v{resume.version}</span>
                                    <span className="text-sm text-mentor-text truncate">{resume.originalFileName}</span>
                                  </div>
                                  <p className="text-xs text-mentor-text-muted mt-0.5">
                                    {RESUME_FILE_TYPE_LABELS[resume.fileExtension] || resume.fileExtension} &middot;{' '}
                                    {formatFileSize(resume.fileSize)} &middot; {formatDate(resume.createdAt)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => handleToggleHistoryAnalysis(resume)}
                                    className="btn btn-secondary px-3 py-1.5 text-xs"
                                  >
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    Analysis
                                  </button>
                                  <button
                                    onClick={() => handleDownloadResume(resume)}
                                    disabled={downloadingId === resume.id}
                                    className="btn btn-secondary px-3 py-1.5 text-xs"
                                  >
                                    <Download size={14} />
                                    {downloadingId === resume.id ? 'Downloading...' : 'Download'}
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="surface-muted p-3 mt-2">
                                  {historyAnalysisLoadingId === resume.id ? (
                                    <div className="py-4 text-center">
                                      <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                                    </div>
                                  ) : rowAnalysisError ? (
                                    <p className="text-sm text-mentor-error">{rowAnalysisError}</p>
                                  ) : !cachedAnalysis ? (
                                    <p className="text-sm text-mentor-text-secondary">Not analyzed yet.</p>
                                  ) : cachedAnalysis.status === 'processing' ? (
                                    <p className="text-sm text-mentor-text-secondary">Analysis in progress...</p>
                                  ) : cachedAnalysis.status === 'failed' ? (
                                    <p className="text-sm text-mentor-error">{cachedAnalysis.errorMessage || 'Analysis failed.'}</p>
                                  ) : cachedAnalysis.profile ? (
                                    <ResumeProfileSummary profile={cachedAnalysis.profile} />
                                  ) : (
                                    <p className="text-sm text-mentor-text-secondary">Not analyzed yet.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Sparkles size={18} className="text-mentor-text-muted" />
                Resume Analysis
              </h2>

              {!resumeCurrent ? (
                <p className="text-sm text-mentor-text-secondary py-2">Upload a resume first.</p>
              ) : analysisLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : analysisError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{analysisError}</p>
                  <button onClick={fetchResumeAnalysis} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {analyzeActionError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{analyzeActionError}</p>
                    </div>
                  )}

                  {!resumeAnalysis ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">Not analyzed yet.</p>
                      {canManage && candidate.status !== 'archived' && (
                        <button onClick={handleAnalyzeResume} disabled={analyzing} className="btn btn-primary">
                          <Sparkles size={16} />
                          {analyzing ? 'Analyzing...' : 'Analyze Resume'}
                        </button>
                      )}
                    </div>
                  ) : resumeAnalysis.status === 'processing' ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">
                        <span className="badge badge-warning mr-2">Processing</span>
                        Analysis is in progress...
                      </p>
                      <button onClick={fetchResumeAnalysis} className="btn btn-secondary">
                        Check Status
                      </button>
                    </div>
                  ) : resumeAnalysis.status === 'failed' ? (
                    <div className="py-2">
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-3">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{resumeAnalysis.errorMessage || 'Resume analysis failed.'}</p>
                      </div>
                      {canManage && candidate.status !== 'archived' && (
                        <button onClick={handleAnalyzeResume} disabled={analyzing} className="btn btn-primary">
                          {analyzing ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        <span className="badge badge-success">Parsed data available</span>
                      </div>
                      {resumeAnalysis.profile && <ResumeProfileSummary profile={resumeAnalysis.profile} />}
                      <div className="mt-4">
                        <ResumeAnalysisUsage usage={resumeAnalysis.aiUsage} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Briefcase size={18} className="text-mentor-text-muted" />
                Job Applications
              </h2>

              {applicationsLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : applicationsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{applicationsError}</p>
                  <button onClick={fetchApplications} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : applications.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">This candidate hasn't applied to any jobs yet.</p>
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
                          to={`/organizations/${organizationId}/employer/jobs/${application.jobId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm font-medium text-mentor-text hover:underline"
                        >
                          {application.job?.title || 'Unknown job'}
                        </Link>
                        <p className="text-xs text-mentor-text-muted">{application.job?.jobCode || '—'}</p>
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
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerCandidateDetailPage;
