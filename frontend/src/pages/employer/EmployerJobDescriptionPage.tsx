import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerJob,
  JobDescriptionSource,
  EmployerJobDescriptionSourceType,
  JobDescriptionAnalysisRecord,
  JobDescriptionAnalysis,
  JobDescriptionAnalysisUsage,
  JobDescriptionSkillsRecord,
  JobDescriptionSkill,
  EmployerJobSkillCategory,
  EmployerJobSkillRequirement,
  EmployerJobSkillImportance,
  JobDescriptionCompetenciesRecord,
  JobDescriptionCompetency,
  EmployerJobCompetencyCategory,
  EmployerJobCompetencyImportance,
  JobIntelligenceSnapshotRecord,
  JobIntelligenceReadiness,
} from '../../api/employerApi';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  Circle,
  Eye,
  X,
  FileText,
  Sparkles,
  RefreshCw,
  ListChecks,
  Target,
  ShieldCheck,
} from 'lucide-react';

const JD_MIN_LENGTH = 50;
const JD_MAX_LENGTH = 50000;

const SOURCE_TYPE_OPTIONS: Array<{ value: EmployerJobDescriptionSourceType; label: string }> = [
  { value: 'pasted', label: 'Pasted' },
  { value: 'manual', label: 'Manually written' },
];

const sourceTypeLabel = (value: EmployerJobDescriptionSourceType) =>
  SOURCE_TYPE_OPTIONS.find((o) => o.value === value)?.label || value;
const formatDateTime = (value: string) => new Date(value).toLocaleString();

/** Adaptive precision, matching the app's existing AI-cost display convention — small per-call costs need more than 2dp to not show as $0.00. */
function formatCostUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toFixed(8)}`;
}

/** A labeled list section — omitted entirely by the caller when the array is empty, so structured-analysis sections with no content never render. */
const ListSection: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="label mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="badge badge-neutral">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

const TextSection: React.FC<{ title: string; text?: string }> = ({ title, text }) => {
  if (!text) return null;
  return (
    <div>
      <p className="label mb-1">{title}</p>
      <p className="text-sm text-mentor-text whitespace-pre-wrap">{text}</p>
    </div>
  );
};

/**
 * Structured JD analysis display (17B) — this is raw AI-parsed
 * understanding, not the canonical skill taxonomy (later sprint). Every
 * section is omitted entirely when the backend returned no content for it —
 * never a fabricated "N/A" placeholder.
 */
const StructuredAnalysisView: React.FC<{ analysis: JobDescriptionAnalysis }> = ({ analysis }) => {
  const context = [analysis.location, analysis.workplaceType, analysis.employmentType].filter(Boolean).join(' · ');
  const hasExperience = analysis.experience.minYears !== undefined || analysis.experience.maxYears !== undefined || analysis.experience.description;
  const comp = analysis.compensation;
  const hasComp = comp && (comp.min !== undefined || comp.max !== undefined || comp.rawText);

  return (
    <div className="space-y-5">
      <TextSection title="Summary" text={analysis.summary} />
      <TextSection title="Role Purpose" text={analysis.rolePurpose} />
      <ListSection title="Responsibilities" items={analysis.responsibilities} />
      <ListSection title="Mandatory Requirements" items={analysis.requirements.mandatory} />
      <ListSection title="Preferred Requirements" items={analysis.requirements.preferred} />

      {hasExperience && (
        <div>
          <p className="label mb-1">Experience</p>
          <p className="text-sm text-mentor-text">
            {analysis.experience.minYears !== undefined || analysis.experience.maxYears !== undefined
              ? `${analysis.experience.minYears ?? 0} – ${analysis.experience.maxYears ?? '∞'} years`
              : null}
            {analysis.experience.description ? ` — ${analysis.experience.description}` : ''}
          </p>
        </div>
      )}

      <ListSection title="Education" items={analysis.education} />
      <ListSection title="Domain Knowledge" items={analysis.domainKnowledge} />
      <ListSection title="Technical Keywords" items={analysis.technicalKeywords} />
      <ListSection title="Tools / Technologies" items={analysis.toolsTechnologies} />
      <ListSection title="Soft Skill Keywords" items={analysis.softSkillKeywords} />

      {context && (
        <div>
          <p className="label mb-1">Location / Workplace / Employment</p>
          <p className="text-sm text-mentor-text">{context}</p>
        </div>
      )}

      {hasComp && (
        <div>
          <p className="label mb-1">Compensation</p>
          <p className="text-sm text-mentor-text">
            {comp!.min !== undefined || comp!.max !== undefined
              ? `${comp!.currency ? `${comp!.currency} ` : ''}${comp!.min ?? '?'} – ${comp!.max ?? '?'}`
              : comp!.rawText}
          </p>
        </div>
      )}

      <div className="pt-3 border-t border-mentor-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-mentor-text-muted">
            Confidence: {Math.round(analysis.confidence.overall * 100)}%
          </span>
          {analysis.confidence.ambiguousSections.map((section) => (
            <span key={section} className="badge badge-warning">
              Ambiguous: {section}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const UsageLine: React.FC<{ usage: JobDescriptionAnalysisUsage }> = ({ usage }) => (
  <p className="text-xs text-mentor-text-muted mt-4 pt-4 border-t border-mentor-border">
    {usage.model} &middot; {usage.totalTokens.toLocaleString()} tokens
    {usage.pricingStatus === 'calculated' ? ` · ~${formatCostUsd(usage.totalCostUsd)}` : ' · cost unavailable'}
  </p>
);

const SKILL_CATEGORY_LABELS: Record<EmployerJobSkillCategory, string> = {
  technical: 'Technical',
  tool: 'Tools',
  domain: 'Domain',
  soft_skill: 'Soft Skills',
  methodology: 'Methodology',
  other: 'Other',
};
const SKILL_CATEGORY_ORDER: EmployerJobSkillCategory[] = ['technical', 'tool', 'domain', 'methodology', 'soft_skill', 'other'];

const SKILL_REQUIREMENT_LABELS: Record<EmployerJobSkillRequirement, string> = {
  mandatory: 'Mandatory',
  preferred: 'Preferred',
  inferred: 'Inferred',
};
const SKILL_REQUIREMENT_BADGE: Record<EmployerJobSkillRequirement, string> = {
  mandatory: 'badge-success',
  preferred: 'badge-info',
  inferred: 'badge-neutral',
};

const SKILL_IMPORTANCE_LABELS: Record<EmployerJobSkillImportance, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const SKILL_IMPORTANCE_BADGE: Record<EmployerJobSkillImportance, string> = {
  critical: 'badge-warning',
  high: 'badge-info',
  medium: 'badge-neutral',
  low: 'badge-neutral',
};

/** One skill's requirement/proficiency/importance/confidence/aliases/evidence — evidence is a native <details> disclosure, not a new package. */
const SkillCard: React.FC<{ skill: JobDescriptionSkill }> = ({ skill }) => (
  <div className="surface-muted p-3">
    <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
      <p className="text-sm font-semibold text-mentor-text">{skill.name}</p>
      <span className="text-xs text-mentor-text-muted">{Math.round(skill.confidence * 100)}% confidence</span>
    </div>
    <div className="flex flex-wrap gap-1.5 mb-2">
      <span className={`badge ${SKILL_REQUIREMENT_BADGE[skill.requirement]}`}>{SKILL_REQUIREMENT_LABELS[skill.requirement]}</span>
      <span className={`badge ${SKILL_IMPORTANCE_BADGE[skill.importance]}`}>{SKILL_IMPORTANCE_LABELS[skill.importance]} importance</span>
      {skill.proficiency !== 'unspecified' && <span className="badge badge-neutral capitalize">{skill.proficiency}</span>}
    </div>
    {skill.aliases.length > 0 && (
      <p className="text-xs text-mentor-text-muted mb-1.5">Also known as: {skill.aliases.join(', ')}</p>
    )}
    {skill.evidence.length > 0 && (
      <details className="text-xs">
        <summary className="cursor-pointer text-primary-600">Evidence ({skill.evidence.length})</summary>
        <ul className="list-disc list-inside mt-1.5 space-y-1 text-mentor-text-secondary">
          {skill.evidence.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

const SkillsGroupedView: React.FC<{ skills: JobDescriptionSkill[] }> = ({ skills }) => {
  if (skills.length === 0) {
    return <p className="text-sm text-mentor-text-secondary text-center py-6">No skills were identified.</p>;
  }
  const byCategory = new Map<EmployerJobSkillCategory, JobDescriptionSkill[]>();
  for (const skill of skills) {
    const list = byCategory.get(skill.category) || [];
    list.push(skill);
    byCategory.set(skill.category, list);
  }
  return (
    <div className="space-y-5">
      {SKILL_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => (
        <div key={category}>
          <p className="label mb-2">{SKILL_CATEGORY_LABELS[category]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {byCategory.get(category)!.map((skill) => (
              <SkillCard key={skill.normalizedName} skill={skill} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const COMPETENCY_CATEGORY_LABELS: Record<EmployerJobCompetencyCategory, string> = {
  technical: 'Technical',
  problem_solving: 'Problem Solving',
  system_design: 'System Design',
  communication: 'Communication',
  leadership: 'Leadership',
  domain: 'Domain',
  execution: 'Execution',
  collaboration: 'Collaboration',
  other: 'Other',
};

const COMPETENCY_IMPORTANCE_LABELS: Record<EmployerJobCompetencyImportance, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
const COMPETENCY_IMPORTANCE_BADGE: Record<EmployerJobCompetencyImportance, string> = {
  critical: 'badge-warning',
  high: 'badge-info',
  medium: 'badge-neutral',
  low: 'badge-neutral',
};

/** One competency's category/importance/weight/linked-skills/evidence/interview-signals/confidence — evidence and signals use native <details> disclosures, not a new package. */
const CompetencyCard: React.FC<{ competency: JobDescriptionCompetency }> = ({ competency }) => (
  <div className="surface-muted p-4">
    <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
      <div>
        <p className="text-sm font-semibold text-mentor-text">{competency.name}</p>
        <p className="text-xs text-mentor-text-muted">{COMPETENCY_CATEGORY_LABELS[competency.category]}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-lg font-bold text-primary-600">{competency.weight}%</p>
        <p className="text-[11px] text-mentor-text-muted">weight</p>
      </div>
    </div>
    <p className="text-sm text-mentor-text-secondary mb-3">{competency.description}</p>
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      <span className={`badge ${COMPETENCY_IMPORTANCE_BADGE[competency.importance]}`}>
        {COMPETENCY_IMPORTANCE_LABELS[competency.importance]} importance
      </span>
      <span className="text-xs text-mentor-text-muted">{Math.round(competency.confidence * 100)}% confidence</span>
    </div>
    {competency.skillNames.length > 0 && (
      <div className="mb-3">
        <p className="text-xs font-medium text-mentor-text-muted mb-1">Linked Skills</p>
        <div className="flex flex-wrap gap-1.5">
          {competency.skillNames.map((name) => (
            <span key={name} className="badge badge-info">
              {name}
            </span>
          ))}
        </div>
      </div>
    )}
    {competency.evidence.length > 0 && (
      <details className="text-xs mb-1.5">
        <summary className="cursor-pointer text-primary-600">Evidence ({competency.evidence.length})</summary>
        <ul className="list-disc list-inside mt-1.5 space-y-1 text-mentor-text-secondary">
          {competency.evidence.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
    )}
    {competency.interviewSignals.length > 0 && (
      <details className="text-xs">
        <summary className="cursor-pointer text-primary-600">Interview Signals ({competency.interviewSignals.length})</summary>
        <ul className="list-disc list-inside mt-1.5 space-y-1 text-mentor-text-secondary">
          {competency.interviewSignals.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

const CompetenciesView: React.FC<{ competencies: JobDescriptionCompetency[] }> = ({ competencies }) => {
  if (competencies.length === 0) {
    return <p className="text-sm text-mentor-text-secondary text-center py-6">No competencies were identified.</p>;
  }
  const totalWeight = competencies.reduce((sum, c) => sum + c.weight, 0);
  const sorted = [...competencies].sort((a, b) => b.weight - a.weight);
  return (
    <div>
      <p className="text-xs font-medium text-mentor-text-muted mb-3">Total weight: {totalWeight}%</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((competency, i) => (
          <CompetencyCard key={i} competency={competency} />
        ))}
      </div>
    </div>
  );
};

const READINESS_CHECKLIST: Array<{ key: keyof JobIntelligenceReadiness; label: string }> = [
  { key: 'jdExists', label: 'JD added' },
  { key: 'analysisCompleted', label: 'Analysis completed' },
  { key: 'skillsCompleted', label: 'Skills extracted' },
  { key: 'competenciesCompleted', label: 'Competencies generated' },
  { key: 'finalized', label: 'Intelligence finalized' },
];

/** DB-derived readiness only — never a client-side guess at what's "done". */
const ReadinessChecklist: React.FC<{ readiness: JobIntelligenceReadiness }> = ({ readiness }) => (
  <ul className="space-y-1.5">
    {READINESS_CHECKLIST.map(({ key, label }) => (
      <li key={key} className="flex items-center gap-2 text-sm">
        {readiness[key] ? (
          <CheckCircle2 size={16} className="text-mentor-success shrink-0" />
        ) : (
          <Circle size={16} className="text-mentor-text-muted shrink-0" />
        )}
        <span className={readiness[key] ? 'text-mentor-text' : 'text-mentor-text-muted'}>{label}</span>
      </li>
    ))}
  </ul>
);

/** Read-only summary of a finalized snapshot — no edit action exists anywhere for a snapshot. */
const IntelligenceSnapshotSummary: React.FC<{ snapshot: JobIntelligenceSnapshotRecord }> = ({ snapshot }) => (
  <div className="space-y-4">
    <div className="flex items-center gap-2 flex-wrap">
      <span className="badge badge-success">Finalized</span>
      <span className="badge badge-info">Version {snapshot.jdVersion}</span>
      <span className="text-xs text-mentor-text-muted">on {formatDateTime(snapshot.finalizedAt)}</span>
    </div>
    {snapshot.snapshot.role.summary && <p className="text-sm text-mentor-text-secondary">{snapshot.snapshot.role.summary}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="stat-tile">
        <div className="stat-tile-value">{snapshot.snapshot.metadata.skillCount}</div>
        <div className="stat-tile-label">Skills</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile-value">{snapshot.snapshot.metadata.competencyCount}</div>
        <div className="stat-tile-label">Competencies</div>
      </div>
      <div className="stat-tile">
        <div className="stat-tile-value">{snapshot.snapshot.metadata.totalCompetencyWeight}%</div>
        <div className="stat-tile-label">Total Weight</div>
      </div>
      {snapshot.snapshot.metadata.analysisConfidence !== undefined && (
        <div className="stat-tile">
          <div className="stat-tile-value">{Math.round(snapshot.snapshot.metadata.analysisConfidence * 100)}%</div>
          <div className="stat-tile-label">Analysis Confidence</div>
        </div>
      )}
    </div>
    <p className="text-xs text-mentor-text-muted">Finalized by membership {snapshot.finalizedByMembershipId}</p>
  </div>
);

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
  const [viewingAnalysis, setViewingAnalysis] = useState<JobDescriptionAnalysisRecord | null>(null);
  const [viewingAnalysisLoading, setViewingAnalysisLoading] = useState(false);

  const [currentAnalysis, setCurrentAnalysis] = useState<JobDescriptionAnalysisRecord | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [currentSkills, setCurrentSkills] = useState<JobDescriptionSkillsRecord | null>(null);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [viewingSkills, setViewingSkills] = useState<JobDescriptionSkillsRecord | null>(null);
  const [viewingSkillsLoading, setViewingSkillsLoading] = useState(false);

  const [currentCompetencies, setCurrentCompetencies] = useState<JobDescriptionCompetenciesRecord | null>(null);
  const [competenciesLoading, setCompetenciesLoading] = useState(true);
  const [competenciesError, setCompetenciesError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [viewingCompetencies, setViewingCompetencies] = useState<JobDescriptionCompetenciesRecord | null>(null);
  const [viewingCompetenciesLoading, setViewingCompetenciesLoading] = useState(false);

  const [currentIntelligence, setCurrentIntelligence] = useState<JobIntelligenceSnapshotRecord | null>(null);
  const [readiness, setReadiness] = useState<JobIntelligenceReadiness | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const [viewingIntelligence, setViewingIntelligence] = useState<JobIntelligenceSnapshotRecord | null>(null);
  const [viewingIntelligenceLoading, setViewingIntelligenceLoading] = useState(false);

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

  const fetchCurrentAnalysis = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const response = await employerApi.getCurrentJobDescriptionAnalysis(organizationId, jobId);
      setCurrentAnalysis(response.data.analysis);
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to load job description analysis');
    } finally {
      setAnalysisLoading(false);
    }
  }, [organizationId, jobId]);

  const fetchCurrentSkills = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const response = await employerApi.getCurrentJobDescriptionSkills(organizationId, jobId);
      setCurrentSkills(response.data.skills);
    } catch (err: any) {
      setSkillsError(err.message || 'Failed to load job description skills');
    } finally {
      setSkillsLoading(false);
    }
  }, [organizationId, jobId]);

  const fetchCurrentCompetencies = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setCompetenciesLoading(true);
    setCompetenciesError(null);
    try {
      const response = await employerApi.getCurrentJobDescriptionCompetencies(organizationId, jobId);
      setCurrentCompetencies(response.data.competencies);
    } catch (err: any) {
      setCompetenciesError(err.message || 'Failed to load job description competencies');
    } finally {
      setCompetenciesLoading(false);
    }
  }, [organizationId, jobId]);

  const fetchCurrentIntelligence = useCallback(async () => {
    if (!organizationId || !jobId) return;
    setIntelligenceLoading(true);
    setIntelligenceError(null);
    try {
      const response = await employerApi.getCurrentJobIntelligence(organizationId, jobId);
      setCurrentIntelligence(response.data.snapshot);
      setReadiness(response.data.readiness);
    } catch (err: any) {
      setIntelligenceError(err.message || 'Failed to load job description intelligence');
    } finally {
      setIntelligenceLoading(false);
    }
  }, [organizationId, jobId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJob();
      fetchJobDescription();
      fetchCurrentAnalysis();
      fetchCurrentSkills();
      fetchCurrentCompetencies();
      fetchCurrentIntelligence();
    }
  }, [
    isSyncing,
    activeOrganization,
    canView,
    fetchJob,
    fetchJobDescription,
    fetchCurrentAnalysis,
    fetchCurrentSkills,
    fetchCurrentCompetencies,
    fetchCurrentIntelligence,
  ]);

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
      // Version awareness: a brand-new version has no analysis, skills, or
      // competencies of its own — never carried forward from the previous
      // version. The old version's analysis/skills/competencies remain
      // intact and viewable in their own history entry.
      setCurrentAnalysis(null);
      setAnalyzeError(null);
      setCurrentSkills(null);
      setExtractError(null);
      setCurrentCompetencies(null);
      setGenerateError(null);
      // The new version has no intelligence snapshot yet either — a brand
      // new source version deterministically starts with every readiness
      // flag false except jdExists (we just created it).
      setCurrentIntelligence(null);
      setReadiness({ jdExists: true, analysisCompleted: false, skillsCompleted: false, competenciesCompleted: false, finalized: false });
      setFinalizeError(null);
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
    setViewingAnalysis(null);
    setViewingSkills(null);
    setViewingCompetencies(null);
    setViewingIntelligence(null);
    try {
      const response = await employerApi.getJobDescriptionSource(organizationId, jobId, source.id);
      setViewingVersion(response.data.source);
    } catch (err: any) {
      setViewingError(err.message || 'Failed to load version');
      setViewingLoading(false);
      return;
    }
    setViewingLoading(false);

    // Historical analysis/skills/competencies are read-only display only — never a new parse/extract/generate trigger.
    setViewingAnalysisLoading(true);
    try {
      const analysisResponse = await employerApi.getJobDescriptionAnalysis(organizationId, jobId, source.id);
      setViewingAnalysis(analysisResponse.data.analysis);
    } catch {
      setViewingAnalysis(null);
    } finally {
      setViewingAnalysisLoading(false);
    }

    setViewingSkillsLoading(true);
    try {
      const skillsResponse = await employerApi.getJobDescriptionSkills(organizationId, jobId, source.id);
      setViewingSkills(skillsResponse.data.skills);
    } catch {
      setViewingSkills(null);
    } finally {
      setViewingSkillsLoading(false);
    }

    setViewingCompetenciesLoading(true);
    try {
      const competenciesResponse = await employerApi.getJobDescriptionCompetencies(organizationId, jobId, source.id);
      setViewingCompetencies(competenciesResponse.data.competencies);
    } catch {
      setViewingCompetencies(null);
    } finally {
      setViewingCompetenciesLoading(false);
    }

    // Historical intelligence is read-only display only — never a
    // finalize trigger. The main finalize endpoint always targets the
    // CURRENT JD version, never a historical one.
    setViewingIntelligenceLoading(true);
    try {
      const intelligenceResponse = await employerApi.getJobIntelligence(organizationId, jobId, source.id);
      setViewingIntelligence(intelligenceResponse.data.snapshot);
    } catch {
      setViewingIntelligence(null);
    } finally {
      setViewingIntelligenceLoading(false);
    }
  };

  const handleCloseViewingVersion = () => {
    setViewingVersion(null);
    setViewingAnalysis(null);
    setViewingSkills(null);
    setViewingCompetencies(null);
    setViewingIntelligence(null);
  };

  const handleAnalyze = async () => {
    if (!organizationId || !jobId) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await employerApi.analyzeCurrentJobDescription(organizationId, jobId);
      setCurrentAnalysis(response.data.analysis);
    } catch (err: any) {
      setAnalyzeError(err.message || 'Failed to analyze job description');
      // A concurrent/in-progress or stale-processing state may have changed
      // server-side even though this request errored — refresh to reflect
      // the true current state rather than leaving a stale view.
      fetchCurrentAnalysis();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleExtractSkills = async () => {
    if (!organizationId || !jobId) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const response = await employerApi.extractCurrentJobDescriptionSkills(organizationId, jobId);
      setCurrentSkills(response.data.skills);
    } catch (err: any) {
      setExtractError(err.message || 'Failed to extract job description skills');
      fetchCurrentSkills();
    } finally {
      setExtracting(false);
    }
  };

  const handleGenerateCompetencies = async () => {
    if (!organizationId || !jobId) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await employerApi.generateCurrentJobDescriptionCompetencies(organizationId, jobId);
      setCurrentCompetencies(response.data.competencies);
    } catch (err: any) {
      setGenerateError(err.message || 'Failed to generate job description competencies');
      fetchCurrentCompetencies();
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (!organizationId || !jobId) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const response = await employerApi.finalizeCurrentJobIntelligence(organizationId, jobId);
      setCurrentIntelligence(response.data.snapshot);
      setReadiness((prev) => (prev ? { ...prev, finalized: true } : prev));
    } catch (err: any) {
      setFinalizeError(err.message || 'Failed to finalize job description intelligence');
      fetchCurrentIntelligence();
    } finally {
      setFinalizing(false);
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
                      <button onClick={handleCloseViewingVersion} className="btn btn-secondary px-3 py-1.5 text-xs">
                        <X size={14} />
                        Close
                      </button>
                    </div>
                    <p className="text-sm text-mentor-text whitespace-pre-wrap">{viewingVersion.rawText}</p>

                    <div className="mt-6 pt-6 border-t border-mentor-border">
                      <h3 className="section-title flex items-center gap-2 mb-3">
                        <Sparkles size={16} className="text-mentor-text-muted" />
                        Structured Analysis
                      </h3>
                      {viewingAnalysisLoading ? (
                        <div className="py-4 text-center">
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                        </div>
                      ) : viewingAnalysis?.status === 'completed' && viewingAnalysis.analysis ? (
                        <>
                          <StructuredAnalysisView analysis={viewingAnalysis.analysis} />
                          {viewingAnalysis.aiUsage && <UsageLine usage={viewingAnalysis.aiUsage} />}
                        </>
                      ) : viewingAnalysis?.status === 'failed' ? (
                        <p className="text-sm text-mentor-error">
                          Analysis failed for this version.{viewingAnalysis.errorMessage ? ` ${viewingAnalysis.errorMessage}` : ''}
                        </p>
                      ) : viewingAnalysis?.status === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Analysis is in progress for this version.</p>
                      ) : (
                        <p className="text-sm text-mentor-text-secondary">Not analyzed yet.</p>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-mentor-border">
                      <h3 className="section-title flex items-center gap-2 mb-3">
                        <ListChecks size={16} className="text-mentor-text-muted" />
                        Skills
                      </h3>
                      {viewingSkillsLoading ? (
                        <div className="py-4 text-center">
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                        </div>
                      ) : viewingSkills?.status === 'completed' ? (
                        <>
                          <SkillsGroupedView skills={viewingSkills.skills} />
                          {viewingSkills.aiUsage && <UsageLine usage={viewingSkills.aiUsage} />}
                        </>
                      ) : viewingSkills?.status === 'failed' ? (
                        <p className="text-sm text-mentor-error">
                          Skill extraction failed for this version.{viewingSkills.errorMessage ? ` ${viewingSkills.errorMessage}` : ''}
                        </p>
                      ) : viewingSkills?.status === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Skill extraction is in progress for this version.</p>
                      ) : (
                        <p className="text-sm text-mentor-text-secondary">Not extracted yet.</p>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-mentor-border">
                      <h3 className="section-title flex items-center gap-2 mb-3">
                        <Target size={16} className="text-mentor-text-muted" />
                        Competencies
                      </h3>
                      {viewingCompetenciesLoading ? (
                        <div className="py-4 text-center">
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                        </div>
                      ) : viewingCompetencies?.status === 'completed' ? (
                        <>
                          <CompetenciesView competencies={viewingCompetencies.competencies} />
                          {viewingCompetencies.aiUsage && <UsageLine usage={viewingCompetencies.aiUsage} />}
                        </>
                      ) : viewingCompetencies?.status === 'failed' ? (
                        <p className="text-sm text-mentor-error">
                          Competency generation failed for this version.
                          {viewingCompetencies.errorMessage ? ` ${viewingCompetencies.errorMessage}` : ''}
                        </p>
                      ) : viewingCompetencies?.status === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Competency generation is in progress for this version.</p>
                      ) : (
                        <p className="text-sm text-mentor-text-secondary">Not generated yet.</p>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-mentor-border">
                      <h3 className="section-title flex items-center gap-2 mb-3">
                        <ShieldCheck size={16} className="text-mentor-text-muted" />
                        JD Intelligence
                      </h3>
                      {viewingIntelligenceLoading ? (
                        <div className="py-4 text-center">
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                        </div>
                      ) : viewingIntelligence ? (
                        <IntelligenceSnapshotSummary snapshot={viewingIntelligence} />
                      ) : (
                        <p className="text-sm text-mentor-text-secondary">This JD version was not finalized.</p>
                      )}
                    </div>
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

                {!viewingVersion && current && (
                  <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-title flex items-center gap-2 mb-0">
                        <Sparkles size={18} className="text-mentor-text-muted" />
                        Job Description Analysis
                      </h2>
                      {!analysisLoading && !analysisError && currentAnalysis?.status === 'processing' && (
                        <button onClick={fetchCurrentAnalysis} className="btn btn-secondary px-3 py-1.5 text-xs">
                          <RefreshCw size={14} />
                          Check Status
                        </button>
                      )}
                      {!analysisLoading &&
                        !analysisError &&
                        currentAnalysis?.status !== 'processing' &&
                        currentAnalysis?.status !== 'completed' &&
                        canManage && (
                          <button onClick={handleAnalyze} disabled={analyzing} className="btn btn-primary">
                            {analyzing
                              ? 'Analyzing...'
                              : currentAnalysis?.status === 'failed'
                              ? 'Retry Analysis'
                              : 'Analyze Job Description'}
                          </button>
                        )}
                    </div>

                    {analyzeError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{analyzeError}</p>
                      </div>
                    )}

                    {analysisLoading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      </div>
                    ) : analysisError ? (
                      <div className="py-6 text-center">
                        <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                        <p className="text-sm text-mentor-text-secondary mb-4">{analysisError}</p>
                        <button onClick={fetchCurrentAnalysis} className="btn btn-primary">
                          Try Again
                        </button>
                      </div>
                    ) : !currentAnalysis ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">Not analyzed yet.</p>
                    ) : currentAnalysis.status === 'processing' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">
                        Analysis is in progress for this job description.
                      </p>
                    ) : currentAnalysis.status === 'failed' ? (
                      <p className="text-sm text-mentor-error text-center py-6">
                        Analysis failed.{currentAnalysis.errorMessage ? ` ${currentAnalysis.errorMessage}` : ''}
                      </p>
                    ) : currentAnalysis.analysis ? (
                      <>
                        <StructuredAnalysisView analysis={currentAnalysis.analysis} />
                        {currentAnalysis.aiUsage && <UsageLine usage={currentAnalysis.aiUsage} />}
                      </>
                    ) : null}
                  </div>
                )}

                {!viewingVersion && current && (
                  <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-title flex items-center gap-2 mb-0">
                        <ListChecks size={18} className="text-mentor-text-muted" />
                        Skills
                      </h2>
                      {!skillsLoading &&
                        !skillsError &&
                        currentAnalysis?.status === 'completed' &&
                        currentSkills?.status === 'processing' && (
                          <button onClick={fetchCurrentSkills} className="btn btn-secondary px-3 py-1.5 text-xs">
                            <RefreshCw size={14} />
                            Check Status
                          </button>
                        )}
                      {!skillsLoading &&
                        !skillsError &&
                        currentAnalysis?.status === 'completed' &&
                        currentSkills?.status !== 'processing' &&
                        currentSkills?.status !== 'completed' &&
                        canManage && (
                          <button onClick={handleExtractSkills} disabled={extracting} className="btn btn-primary">
                            {extracting ? 'Extracting...' : currentSkills?.status === 'failed' ? 'Retry Extraction' : 'Extract Skills'}
                          </button>
                        )}
                    </div>

                    {extractError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{extractError}</p>
                      </div>
                    )}

                    {skillsLoading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      </div>
                    ) : skillsError ? (
                      <div className="py-6 text-center">
                        <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                        <p className="text-sm text-mentor-text-secondary mb-4">{skillsError}</p>
                        <button onClick={fetchCurrentSkills} className="btn btn-primary">
                          Try Again
                        </button>
                      </div>
                    ) : currentAnalysis?.status !== 'completed' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">
                        Analyze the job description before extracting skills.
                      </p>
                    ) : !currentSkills ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">Not extracted yet.</p>
                    ) : currentSkills.status === 'processing' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">
                        Skill extraction is in progress for this job description.
                      </p>
                    ) : currentSkills.status === 'failed' ? (
                      <p className="text-sm text-mentor-error text-center py-6">
                        Skill extraction failed.{currentSkills.errorMessage ? ` ${currentSkills.errorMessage}` : ''}
                      </p>
                    ) : (
                      <>
                        <SkillsGroupedView skills={currentSkills.skills} />
                        {currentSkills.aiUsage && <UsageLine usage={currentSkills.aiUsage} />}
                      </>
                    )}
                  </div>
                )}

                {!viewingVersion && current && (
                  <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-title flex items-center gap-2 mb-0">
                        <Target size={18} className="text-mentor-text-muted" />
                        Competencies
                      </h2>
                      {!competenciesLoading &&
                        !competenciesError &&
                        currentAnalysis?.status === 'completed' &&
                        currentSkills?.status === 'completed' &&
                        currentCompetencies?.status === 'processing' && (
                          <button onClick={fetchCurrentCompetencies} className="btn btn-secondary px-3 py-1.5 text-xs">
                            <RefreshCw size={14} />
                            Check Status
                          </button>
                        )}
                      {!competenciesLoading &&
                        !competenciesError &&
                        currentAnalysis?.status === 'completed' &&
                        currentSkills?.status === 'completed' &&
                        currentCompetencies?.status !== 'processing' &&
                        currentCompetencies?.status !== 'completed' &&
                        canManage && (
                          <button onClick={handleGenerateCompetencies} disabled={generating} className="btn btn-primary">
                            {generating
                              ? 'Generating...'
                              : currentCompetencies?.status === 'failed'
                              ? 'Retry Generation'
                              : 'Generate Competencies'}
                          </button>
                        )}
                    </div>

                    {generateError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{generateError}</p>
                      </div>
                    )}

                    {competenciesLoading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      </div>
                    ) : competenciesError ? (
                      <div className="py-6 text-center">
                        <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                        <p className="text-sm text-mentor-text-secondary mb-4">{competenciesError}</p>
                        <button onClick={fetchCurrentCompetencies} className="btn btn-primary">
                          Try Again
                        </button>
                      </div>
                    ) : currentAnalysis?.status !== 'completed' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">Analyze the job description first.</p>
                    ) : currentSkills?.status !== 'completed' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">Extract skills first.</p>
                    ) : !currentCompetencies ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">Not generated yet.</p>
                    ) : currentCompetencies.status === 'processing' ? (
                      <p className="text-sm text-mentor-text-secondary text-center py-6">
                        Competency generation is in progress for this job description.
                      </p>
                    ) : currentCompetencies.status === 'failed' ? (
                      <p className="text-sm text-mentor-error text-center py-6">
                        Competency generation failed.{currentCompetencies.errorMessage ? ` ${currentCompetencies.errorMessage}` : ''}
                      </p>
                    ) : (
                      <>
                        <CompetenciesView competencies={currentCompetencies.competencies} />
                        {currentCompetencies.aiUsage && <UsageLine usage={currentCompetencies.aiUsage} />}
                      </>
                    )}
                  </div>
                )}

                {!viewingVersion && current && (
                  <div className="card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="section-title flex items-center gap-2 mb-0">
                        <ShieldCheck size={18} className="text-mentor-text-muted" />
                        JD Intelligence
                      </h2>
                    </div>

                    {finalizeError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{finalizeError}</p>
                      </div>
                    )}

                    {intelligenceLoading ? (
                      <div className="py-6 text-center">
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      </div>
                    ) : intelligenceError ? (
                      <div className="py-6 text-center">
                        <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                        <p className="text-sm text-mentor-text-secondary mb-4">{intelligenceError}</p>
                        <button onClick={fetchCurrentIntelligence} className="btn btn-primary">
                          Try Again
                        </button>
                      </div>
                    ) : !readiness ? null : readiness.finalized && currentIntelligence ? (
                      <IntelligenceSnapshotSummary snapshot={currentIntelligence} />
                    ) : (
                      <>
                        <ReadinessChecklist readiness={readiness} />
                        {readiness.jdExists &&
                          readiness.analysisCompleted &&
                          readiness.skillsCompleted &&
                          readiness.competenciesCompleted &&
                          !readiness.finalized &&
                          canManage && (
                            <div className="mt-4 pt-4 border-t border-mentor-border">
                              <p className="text-xs text-mentor-text-muted mb-3">
                                Finalization creates an immutable snapshot used by downstream hiring workflows.
                              </p>
                              <button onClick={handleFinalize} disabled={finalizing} className="btn btn-primary">
                                {finalizing ? 'Finalizing...' : 'Finalize JD Intelligence'}
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </div>
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
