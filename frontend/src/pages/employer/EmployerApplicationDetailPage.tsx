import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerJobApplication,
  EmployerJobApplicationStatus,
  EMPLOYER_JOB_APPLICATION_SOURCES,
  EMPLOYER_JOB_APPLICATION_STATUS_TRANSITIONS,
  ApplicationScreening,
  ScreeningResult,
  ApplicationScreeningScore,
  ScreeningScore,
  ApplicationScreeningGap,
  ScreeningGap,
  ApplicationShortlistDecision,
  ApplicationInterviewBlueprint,
  InterviewBlueprint,
} from '../../api/employerApi';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  CheckCircle2,
  Target,
  Calculator,
  GitCompareArrows,
  Star,
  ClipboardList,
} from 'lucide-react';

const BLUEPRINT_CATEGORY_LABELS: Record<string, string> = {
  technical: 'Technical',
  problem_solving: 'Problem Solving',
  system_design: 'System Design',
  domain: 'Domain',
  behavioral: 'Behavioral',
  leadership: 'Leadership',
  communication: 'Communication',
  experience: 'Experience',
};

const BLUEPRINT_DIFFICULTY_BADGE: Record<string, string> = {
  easy: 'badge-success',
  medium: 'badge-warning',
  hard: 'badge-neutral',
};

/** Read-only rendering of a completed interview blueprint — a PLAN of question intents, never final candidate-facing questions. */
const BlueprintView: React.FC<{ blueprint: InterviewBlueprint }> = ({ blueprint }) => (
  <div className="space-y-5">
    <div>
      <p className="text-lg font-semibold text-mentor-text">{blueprint.title}</p>
      <p className="text-xs text-mentor-text-muted mt-1">
        {blueprint.estimatedDurationMinutes} min estimated &middot; {blueprint.metadata.totalSections} sections &middot;{' '}
        {blueprint.metadata.totalPlannedQuestions} planned questions
      </p>
    </div>

    {blueprint.focusAreas.length > 0 && (
      <div>
        <p className="label mb-2">Focus Areas</p>
        <div className="flex flex-wrap gap-1.5">
          {blueprint.focusAreas.map((f) => (
            <span key={f} className="badge badge-info">
              {f}
            </span>
          ))}
        </div>
      </div>
    )}

    {blueprint.avoidAreas.length > 0 && (
      <div>
        <p className="label mb-2">Avoid Areas</p>
        <div className="flex flex-wrap gap-1.5">
          {blueprint.avoidAreas.map((a) => (
            <span key={a} className="badge badge-neutral">
              {a}
            </span>
          ))}
        </div>
      </div>
    )}

    <div className="space-y-3">
      {blueprint.sections.map((section) => (
        <div key={section.id} className="surface-muted p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-mentor-text">
              {section.order}. {section.title}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="badge badge-info">{BLUEPRINT_CATEGORY_LABELS[section.category] || section.category}</span>
              <span className="text-xs text-mentor-text-muted">{section.durationMinutes} min</span>
            </div>
          </div>
          <p className="text-sm text-mentor-text-secondary mb-2">{section.objective}</p>

          {(section.competencies.length > 0 || section.skills.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {section.competencies.map((c) => (
                <span key={c} className="badge badge-success">
                  {c}
                </span>
              ))}
              {section.skills.map((s) => (
                <span key={s} className="badge badge-neutral">
                  {s}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs font-medium text-mentor-text-muted mb-1.5">Question Intents (not final questions)</p>
          <div className="space-y-2">
            {section.questionPlan.map((q, i) => (
              <div key={i} className="bg-mentor-surface rounded-lg p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-mentor-text">{q.intent}</p>
                  <span className={`badge ${BLUEPRINT_DIFFICULTY_BADGE[q.difficulty]} shrink-0`}>{q.difficulty}</span>
                </div>
                {q.evidenceExpected.length > 0 && (
                  <p className="text-xs text-mentor-text-muted mt-1">Evidence expected: {q.evidenceExpected.join(', ')}</p>
                )}
                {q.followUpFocus.length > 0 && (
                  <p className="text-xs text-mentor-text-muted mt-0.5">Follow-up focus: {q.followUpFocus.join(', ')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

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

function formatCost(usd: number): string {
  return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

/** Read-only rendering of a completed screening result. */
const ScreeningResultView: React.FC<{ result: ScreeningResult }> = ({ result }) => (
  <div className="space-y-5">
    <div className="flex items-center gap-3 flex-wrap">
      <div>
        <p className="text-xs text-mentor-text-muted mb-0.5">Overall Score</p>
        <p className="text-2xl font-semibold text-mentor-text">{result.overallScore}</p>
      </div>
      <span className={`badge ${RECOMMENDATION_BADGE[result.recommendation]}`}>{RECOMMENDATION_LABELS[result.recommendation]}</span>
      <span className="text-xs text-mentor-text-muted ml-auto">Confidence: {Math.round(result.confidence * 100)}%</span>
    </div>

    <div>
      <p className="label mb-2">
        Skill Match &middot; <span className="text-mentor-text-secondary font-normal">{result.skillMatch.score}/100</span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-mentor-text-muted mb-1">Matched</p>
          <div className="flex flex-wrap gap-1.5">
            {result.skillMatch.matchedSkills.length > 0 ? (
              result.skillMatch.matchedSkills.map((s) => (
                <span key={s} className="badge badge-success">
                  {s}
                </span>
              ))
            ) : (
              <span className="text-xs text-mentor-text-muted">—</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-mentor-text-muted mb-1">Partial</p>
          <div className="flex flex-wrap gap-1.5">
            {result.skillMatch.partialSkills.length > 0 ? (
              result.skillMatch.partialSkills.map((s) => (
                <span key={s} className="badge badge-warning">
                  {s}
                </span>
              ))
            ) : (
              <span className="text-xs text-mentor-text-muted">—</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-mentor-text-muted mb-1">Missing</p>
          <div className="flex flex-wrap gap-1.5">
            {result.skillMatch.missingSkills.length > 0 ? (
              result.skillMatch.missingSkills.map((s) => (
                <span key={s} className="badge badge-neutral">
                  {s}
                </span>
              ))
            ) : (
              <span className="text-xs text-mentor-text-muted">—</span>
            )}
          </div>
        </div>
      </div>
    </div>

    {result.competencyMatch.length > 0 && (
      <div>
        <p className="label mb-2">Competency Match</p>
        <div className="space-y-2">
          {result.competencyMatch.map((c) => (
            <div key={c.competencyName} className="surface-muted p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-mentor-text">{c.competencyName}</p>
                <span className="text-sm text-mentor-text-secondary shrink-0">{c.score}/100</span>
              </div>
              {c.evidence.length > 0 && (
                <ul className="list-disc list-inside text-xs text-mentor-text-secondary mt-1.5 space-y-0.5">
                  {c.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <p className="label mb-1">
          Experience Match &middot; <span className="text-mentor-text-secondary font-normal">{result.experienceMatch.score}/100</span>
        </p>
        {result.experienceMatch.summary && <p className="text-sm text-mentor-text-secondary">{result.experienceMatch.summary}</p>}
      </div>
      <div>
        <p className="label mb-1">
          Education Match &middot; <span className="text-mentor-text-secondary font-normal">{result.educationMatch.score}/100</span>
        </p>
        {result.educationMatch.summary && <p className="text-sm text-mentor-text-secondary">{result.educationMatch.summary}</p>}
      </div>
    </div>

    {result.strengths.length > 0 && (
      <div>
        <p className="label mb-2">Strengths</p>
        <ul className="list-disc list-inside text-sm text-mentor-text-secondary space-y-0.5">
          {result.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    )}

    {result.concerns.length > 0 && (
      <div>
        <p className="label mb-2">Concerns</p>
        <ul className="list-disc list-inside text-sm text-mentor-text-secondary space-y-0.5">
          {result.concerns.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const SCORE_COMPONENT_LABELS = {
  skills: 'Skills',
  competencies: 'Competencies',
  experience: 'Experience',
  education: 'Education',
} as const;

/**
 * Read-only rendering of a deterministic 19B explainable score. Deliberately
 * shown ALONGSIDE (never instead of) the AI's own `result.overallScore` —
 * these are two distinct numbers and this view never conflates them.
 */
const ExplainableScoreView: React.FC<{ score: ScreeningScore; aiOverallScore: number }> = ({ score, aiOverallScore }) => (
  <div className="space-y-5">
    <div className="flex items-center gap-6 flex-wrap">
      <div>
        <p className="text-xs text-mentor-text-muted mb-0.5">Calculated Score</p>
        <p className="text-2xl font-semibold text-mentor-text">{score.overallScore}/100</p>
      </div>
      <div>
        <p className="text-xs text-mentor-text-muted mb-0.5">AI Screening Score</p>
        <p className="text-2xl font-semibold text-mentor-text-secondary">{aiOverallScore}/100</p>
      </div>
      <span className="text-xs text-mentor-text-muted ml-auto">{score.calculationVersion}</span>
    </div>

    <div>
      <p className="label mb-2">Score Components</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.keys(SCORE_COMPONENT_LABELS) as Array<keyof typeof SCORE_COMPONENT_LABELS>).map((key) => {
          const component = score.components[key];
          return (
            <div key={key} className="surface-muted p-3">
              <p className="text-xs text-mentor-text-muted mb-1">{SCORE_COMPONENT_LABELS[key]}</p>
              <p className="text-lg font-semibold text-mentor-text">{component.score}/100</p>
              <p className="text-xs text-mentor-text-secondary mt-1">
                Weight {Math.round(component.weight * 100)}% &middot; Contribution {component.contribution}
              </p>
            </div>
          );
        })}
      </div>
    </div>

    {score.competencyBreakdown.length > 0 && (
      <div>
        <p className="label mb-2">Competency Breakdown</p>
        <div className="space-y-2">
          {score.competencyBreakdown.map((c) => (
            <div key={c.name} className="surface-muted p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-mentor-text">{c.name}</p>
                <span className="text-xs text-mentor-text-secondary shrink-0">
                  JD Weight {c.jdWeight} &middot; Match {c.matchScore}/100 &middot; Contribution {c.weightedContribution}
                </span>
              </div>
              {c.evidence.length > 0 && (
                <ul className="list-disc list-inside text-xs text-mentor-text-secondary mt-1.5 space-y-0.5">
                  {c.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    <p className="text-xs text-mentor-text-muted">Formula: 35% Skills + 40% Competencies + 20% Experience + 5% Education</p>
  </div>
);

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEVERITY_BADGE_CLASS: Record<string, string> = {
  critical: 'badge bg-red-50 text-red-700 dark:bg-future-error/10 dark:text-future-error',
  high: 'badge badge-warning',
  medium: 'badge badge-info',
  low: 'badge badge-neutral',
};

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => (
  <span className={SEVERITY_BADGE_CLASS[severity] || 'badge badge-neutral'}>{SEVERITY_LABELS[severity] || severity}</span>
);

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

/**
 * Read-only rendering of a deterministic 19C gap analysis. Informational
 * only — never implies a status change, ranking, or shortlist decision.
 */
const GapAnalysisView: React.FC<{ gap: ScreeningGap }> = ({ gap }) => (
  <div className="space-y-5">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="stat-tile">
        <p className="stat-tile-value">{gap.summary.criticalGapCount}</p>
        <p className="text-xs text-mentor-text-muted mt-1">Critical</p>
      </div>
      <div className="stat-tile">
        <p className="stat-tile-value">{gap.summary.highGapCount}</p>
        <p className="text-xs text-mentor-text-muted mt-1">High</p>
      </div>
      <div className="stat-tile">
        <p className="stat-tile-value">{gap.summary.mediumGapCount}</p>
        <p className="text-xs text-mentor-text-muted mt-1">Medium</p>
      </div>
      <div className="stat-tile">
        <p className="stat-tile-value">{gap.summary.lowGapCount}</p>
        <p className="text-xs text-mentor-text-muted mt-1">Low</p>
      </div>
    </div>
    <p className="text-xs text-mentor-text-muted">
      {gap.summary.matchedSkillCount} matched &middot; {gap.summary.partialSkillCount} partial &middot; {gap.summary.missingSkillCount}{' '}
      missing skills
    </p>

    {gap.skillGaps.length > 0 && (
      <div>
        <p className="label mb-2">Skill Gaps</p>
        <div className="space-y-2">
          {gap.skillGaps.map((s) => (
            <div key={s.skillName} className="surface-muted p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-mentor-text">{s.skillName}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="badge badge-neutral">{capitalize(s.status)}</span>
                  <span className="badge badge-neutral">{capitalize(s.requirement)}</span>
                  <span className="badge badge-neutral">{capitalize(s.importance)}</span>
                  <SeverityBadge severity={s.severity} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {gap.competencyGaps.length > 0 && (
      <div>
        <p className="label mb-2">Competency Gaps</p>
        <div className="space-y-2">
          {gap.competencyGaps.map((c) => (
            <div key={c.competencyName} className="surface-muted p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium text-mentor-text">{c.competencyName}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-mentor-text-secondary">
                    JD Weight {c.jdWeight} &middot; Match {c.matchScore}/100
                  </span>
                  <SeverityBadge severity={c.severity} />
                </div>
              </div>
              {c.evidence.length > 0 && (
                <ul className="list-disc list-inside text-xs text-mentor-text-secondary mt-1.5 space-y-0.5">
                  {c.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    )}

    {gap.experienceGap && (
      <div>
        <p className="label mb-2 flex items-center gap-2">
          Experience Gap <SeverityBadge severity={gap.experienceGap.severity} />
        </p>
        <div className="surface-muted p-3 text-sm text-mentor-text-secondary space-y-1">
          {gap.experienceGap.required && <p>Required: {gap.experienceGap.required}</p>}
          {gap.experienceGap.candidate && <p>Candidate: {gap.experienceGap.candidate}</p>}
          <p>Score: {gap.experienceGap.score}/100</p>
          {gap.experienceGap.summary && <p>{gap.experienceGap.summary}</p>}
        </div>
      </div>
    )}

    {gap.educationGap && (
      <div>
        <p className="label mb-2 flex items-center gap-2">
          Education Gap <SeverityBadge severity={gap.educationGap.severity} />
        </p>
        <div className="surface-muted p-3 text-sm text-mentor-text-secondary space-y-1">
          <p>Score: {gap.educationGap.score}/100</p>
          {gap.educationGap.summary && <p>{gap.educationGap.summary}</p>}
        </div>
      </div>
    )}

    {gap.strengths.length > 0 && (
      <div>
        <p className="label mb-2">Strengths</p>
        <ul className="list-disc list-inside text-sm text-mentor-text-secondary space-y-0.5">
          {gap.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>
    )}

    <p className="text-xs text-mentor-text-muted">{gap.calculationVersion}</p>
  </div>
);

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

  const [screening, setScreening] = useState<ApplicationScreening | null>(null);
  const [screeningLoading, setScreeningLoading] = useState(true);
  const [screeningError, setScreeningError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [screeningScore, setScreeningScore] = useState<ApplicationScreeningScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [calculatingScore, setCalculatingScore] = useState(false);
  const [calculateScoreError, setCalculateScoreError] = useState<string | null>(null);

  const [screeningGap, setScreeningGap] = useState<ApplicationScreeningGap | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [gapError, setGapError] = useState<string | null>(null);
  const [generatingGap, setGeneratingGap] = useState(false);
  const [generateGapError, setGenerateGapError] = useState<string | null>(null);

  const [shortlistDecision, setShortlistDecision] = useState<ApplicationShortlistDecision | null>(null);
  const [shortlistDecisionLoading, setShortlistDecisionLoading] = useState(true);
  const [shortlistDecisionError, setShortlistDecisionError] = useState<string | null>(null);

  const [blueprint, setBlueprint] = useState<ApplicationInterviewBlueprint | null>(null);
  const [blueprintLoading, setBlueprintLoading] = useState(true);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);
  const [generatingBlueprint, setGeneratingBlueprint] = useState(false);
  const [generateBlueprintError, setGenerateBlueprintError] = useState<string | null>(null);

  // Best-effort prerequisite hints only — the backend's own 409 messages on
  // "Run Screening" remain the actual authority if these can't be determined.
  const [jdFinalized, setJdFinalized] = useState<boolean | null>(null);
  const [resumeAnalyzed, setResumeAnalyzed] = useState<boolean | null>(null);
  const [prereqLoading, setPrereqLoading] = useState(true);

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

  const fetchScreening = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setScreeningLoading(true);
    setScreeningError(null);
    try {
      const response = await employerApi.getApplicationScreening(organizationId, applicationId);
      setScreening(response.data.screening);
    } catch (err: any) {
      setScreeningError(err.message || 'Failed to load screening');
    } finally {
      setScreeningLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchScreening();
    }
  }, [isSyncing, activeOrganization, canView, fetchScreening]);

  const jobId = application?.jobId;
  const candidateId = application?.candidateId;

  useEffect(() => {
    if (isSyncing || activeOrganization?.type !== 'company' || !canView || !organizationId || !jobId || !candidateId) return;
    let cancelled = false;
    (async () => {
      setPrereqLoading(true);
      try {
        const [jdResponse, analysisResponse] = await Promise.all([
          employerApi.getCurrentJobIntelligence(organizationId, jobId),
          employerApi.getCurrentCandidateResumeAnalysis(organizationId, candidateId),
        ]);
        if (cancelled) return;
        setJdFinalized(jdResponse.data.readiness.finalized);
        setResumeAnalyzed(analysisResponse.data.analysis?.status === 'completed');
      } catch {
        // Non-fatal — "Run Screening" itself will surface the real prerequisite error from the backend.
        if (!cancelled) {
          setJdFinalized(null);
          setResumeAnalyzed(null);
        }
      } finally {
        if (!cancelled) setPrereqLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSyncing, activeOrganization, canView, organizationId, jobId, candidateId]);

  const handleRunScreening = async () => {
    if (!organizationId || !applicationId) return;
    setRunning(true);
    setRunError(null);
    try {
      const response = await employerApi.screenApplication(organizationId, applicationId);
      setScreening(response.data.screening);
    } catch (err: any) {
      setRunError(err.message || 'Failed to screen application');
      // The backend may have already persisted a FAILED row — pick it up.
      await fetchScreening();
    } finally {
      setRunning(false);
    }
  };

  const fetchScreeningScore = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setScoreLoading(true);
    setScoreError(null);
    try {
      const response = await employerApi.getApplicationScreeningScore(organizationId, applicationId);
      setScreeningScore(response.data.score);
    } catch (err: any) {
      setScoreError(err.message || 'Failed to load explainable score');
    } finally {
      setScoreLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && screening?.status === 'completed') {
      fetchScreeningScore();
    }
  }, [isSyncing, activeOrganization, canView, screening?.status, fetchScreeningScore]);

  const handleCalculateScore = async () => {
    if (!organizationId || !applicationId) return;
    setCalculatingScore(true);
    setCalculateScoreError(null);
    try {
      const response = await employerApi.calculateApplicationScreeningScore(organizationId, applicationId);
      setScreeningScore(response.data.score);
    } catch (err: any) {
      setCalculateScoreError(err.message || 'Failed to calculate explainable score');
    } finally {
      setCalculatingScore(false);
    }
  };

  const fetchScreeningGap = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setGapLoading(true);
    setGapError(null);
    try {
      const response = await employerApi.getApplicationScreeningGaps(organizationId, applicationId);
      setScreeningGap(response.data.gap);
    } catch (err: any) {
      setGapError(err.message || 'Failed to load gap analysis');
    } finally {
      setGapLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && screeningScore) {
      fetchScreeningGap();
    }
  }, [isSyncing, activeOrganization, canView, screeningScore?.id, fetchScreeningGap]);

  const handleGenerateGaps = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingGap(true);
    setGenerateGapError(null);
    try {
      const response = await employerApi.generateApplicationScreeningGaps(organizationId, applicationId);
      setScreeningGap(response.data.gap);
    } catch (err: any) {
      setGenerateGapError(err.message || 'Failed to generate gap analysis');
    } finally {
      setGeneratingGap(false);
    }
  };

  const fetchShortlistDecision = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setShortlistDecisionLoading(true);
    setShortlistDecisionError(null);
    try {
      const response = await employerApi.getApplicationShortlist(organizationId, applicationId);
      setShortlistDecision(response.data.decision);
    } catch (err: any) {
      setShortlistDecisionError(err.message || 'Failed to load shortlist status');
    } finally {
      setShortlistDecisionLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchShortlistDecision();
    }
  }, [isSyncing, activeOrganization, canView, fetchShortlistDecision]);

  const fetchBlueprint = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setBlueprintLoading(true);
    setBlueprintError(null);
    try {
      const response = await employerApi.getEmployerInterviewBlueprint(organizationId, applicationId);
      setBlueprint(response.data.blueprint);
    } catch (err: any) {
      setBlueprintError(err.message || 'Failed to load interview blueprint');
    } finally {
      setBlueprintLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchBlueprint();
    }
  }, [isSyncing, activeOrganization, canView, fetchBlueprint]);

  const handleGenerateBlueprint = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingBlueprint(true);
    setGenerateBlueprintError(null);
    try {
      const response = await employerApi.generateEmployerInterviewBlueprint(organizationId, applicationId);
      setBlueprint(response.data.blueprint);
    } catch (err: any) {
      setGenerateBlueprintError(err.message || 'Failed to generate interview blueprint');
      // The backend may have already persisted a FAILED row — pick it up.
      await fetchBlueprint();
    } finally {
      setGeneratingBlueprint(false);
    }
  };

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
      if (targetStatus === 'shortlisted') {
        // Shortlisting goes through the dedicated 19E workflow rather than
        // the bare generic transition — it enforces the current screening/
        // score eligibility and records an audit decision, then performs
        // this exact same status transition under the hood.
        await employerApi.shortlistApplication(organizationId, applicationId);
        await Promise.all([fetchApplication(), fetchShortlistDecision()]);
      } else {
        const response = await employerApi.updateApplicationStatus(organizationId, applicationId, targetStatus);
        setApplication(response.data.application);
      }
      setStatusSuccess(`Status updated to ${STATUS_LABELS[targetStatus]}.`);
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

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Target size={18} className="text-mentor-text-muted" />
                Screening
              </h2>

              {screeningLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : screeningError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{screeningError}</p>
                  <button onClick={fetchScreening} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {runError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{runError}</p>
                    </div>
                  )}

                  {!screening ? (
                    <div className="py-2">
                      {!prereqLoading && jdFinalized === false ? (
                        <p className="text-sm text-mentor-text-secondary mb-3">
                          Finalize this job's JD Intelligence before screening candidates.
                        </p>
                      ) : !prereqLoading && resumeAnalyzed === false ? (
                        <p className="text-sm text-mentor-text-secondary mb-3">Analyze the candidate's resume before screening.</p>
                      ) : (
                        <p className="text-sm text-mentor-text-secondary mb-3">Ready to screen this application.</p>
                      )}
                      {canEdit && (
                        <button onClick={handleRunScreening} disabled={running} className="btn btn-primary">
                          <Target size={16} />
                          {running ? 'Screening...' : 'Run Screening'}
                        </button>
                      )}
                    </div>
                  ) : screening.status === 'processing' ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">
                        <span className="badge badge-warning mr-2">Processing</span>
                        Screening is in progress...
                      </p>
                      <button onClick={fetchScreening} className="btn btn-secondary">
                        Check Status
                      </button>
                    </div>
                  ) : screening.status === 'failed' ? (
                    <div className="py-2">
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-3">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{screening.errorMessage || 'Screening failed.'}</p>
                      </div>
                      {canEdit && (
                        <button onClick={handleRunScreening} disabled={running} className="btn btn-primary">
                          {running ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {screening.result && <ScreeningResultView result={screening.result} />}
                      {screening.aiUsage && (
                        <p className="text-xs text-mentor-text-muted mt-4">
                          {screening.aiUsage.model} &middot; {screening.aiUsage.totalTokens.toLocaleString()} tokens
                          {screening.aiUsage.pricingStatus === 'calculated' ? ` · est. ${formatCost(screening.aiUsage.totalCostUsd)}` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {screening?.status === 'completed' && (
              <div className="card mt-6">
                <h2 className="section-title flex items-center gap-2 mb-4">
                  <Calculator size={18} className="text-mentor-text-muted" />
                  Explainable Score
                </h2>

                {scoreLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                  </div>
                ) : scoreError ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                    <p className="text-sm text-mentor-text-secondary mb-4">{scoreError}</p>
                    <button onClick={fetchScreeningScore} className="btn btn-primary">
                      Try Again
                    </button>
                  </div>
                ) : (
                  <>
                    {calculateScoreError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{calculateScoreError}</p>
                      </div>
                    )}

                    {!screeningScore ? (
                      <div className="py-2">
                        <p className="text-sm text-mentor-text-secondary mb-3">
                          Calculate a deterministic, transparent score breakdown for this screening.
                        </p>
                        {canEdit && (
                          <button onClick={handleCalculateScore} disabled={calculatingScore} className="btn btn-primary">
                            <Calculator size={16} />
                            {calculatingScore ? 'Calculating...' : 'Calculate Explainable Score'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <ExplainableScoreView score={screeningScore.score} aiOverallScore={screening.result?.overallScore ?? 0} />
                    )}
                  </>
                )}
              </div>
            )}

            {screening?.status === 'completed' && (
              <div className="card mt-6">
                <h2 className="section-title flex items-center gap-2 mb-4">
                  <GitCompareArrows size={18} className="text-mentor-text-muted" />
                  Gap Analysis
                </h2>

                {!screeningScore ? (
                  <p className="text-sm text-mentor-text-secondary py-2">Calculate Explainable Score first.</p>
                ) : gapLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                  </div>
                ) : gapError ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                    <p className="text-sm text-mentor-text-secondary mb-4">{gapError}</p>
                    <button onClick={fetchScreeningGap} className="btn btn-primary">
                      Try Again
                    </button>
                  </div>
                ) : (
                  <>
                    {generateGapError && (
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{generateGapError}</p>
                      </div>
                    )}

                    {!screeningGap ? (
                      <div className="py-2">
                        <p className="text-sm text-mentor-text-secondary mb-3">
                          Generate a deterministic skill and requirement gap analysis for this screening.
                        </p>
                        {canEdit && (
                          <button onClick={handleGenerateGaps} disabled={generatingGap} className="btn btn-primary">
                            <GitCompareArrows size={16} />
                            {generatingGap ? 'Generating...' : 'Generate Gap Analysis'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <GapAnalysisView gap={screeningGap.gap} />
                    )}
                  </>
                )}
              </div>
            )}

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Star size={18} className="text-mentor-text-muted" />
                Shortlist Status
              </h2>
              {shortlistDecisionLoading ? (
                <div className="p-4 text-center">
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : shortlistDecisionError ? (
                <p className="text-sm text-mentor-error">{shortlistDecisionError}</p>
              ) : shortlistDecision ? (
                <p className="text-sm text-mentor-text">
                  Shortlisted on {formatDateTime(shortlistDecision.decidedAt)} by membership {shortlistDecision.decidedByMembershipId}
                  {' · '}score {shortlistDecision.explainableScore}/100
                </p>
              ) : (
                <p className="text-sm text-mentor-text-secondary">Not shortlisted.</p>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <ClipboardList size={18} className="text-mentor-text-muted" />
                Blueprint / Interview Plan
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                A structured interview plan — question intents to guide the interviewer, never final questions to read aloud.
              </p>

              {application.status !== 'shortlisted' ? (
                <p className="text-sm text-mentor-text-secondary py-2">Shortlist this candidate first.</p>
              ) : blueprintLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : blueprintError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{blueprintError}</p>
                  <button onClick={fetchBlueprint} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {generateBlueprintError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{generateBlueprintError}</p>
                    </div>
                  )}

                  {!blueprint ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">No interview blueprint generated yet.</p>
                      {canEdit && (
                        <button onClick={handleGenerateBlueprint} disabled={generatingBlueprint} className="btn btn-primary">
                          <ClipboardList size={16} />
                          {generatingBlueprint ? 'Generating...' : 'Generate Interview Blueprint'}
                        </button>
                      )}
                    </div>
                  ) : blueprint.status === 'processing' ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">
                        <span className="badge badge-warning mr-2">Processing</span>
                        Blueprint generation is in progress...
                      </p>
                      <button onClick={fetchBlueprint} className="btn btn-secondary">
                        Check Status
                      </button>
                    </div>
                  ) : blueprint.status === 'failed' ? (
                    <div className="py-2">
                      <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-3">
                        <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                        <p className="text-sm text-mentor-error">{blueprint.errorMessage || 'Blueprint generation failed.'}</p>
                      </div>
                      {canEdit && (
                        <button onClick={handleGenerateBlueprint} disabled={generatingBlueprint} className="btn btn-primary">
                          {generatingBlueprint ? 'Retrying...' : 'Retry'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div>
                      {blueprint.blueprint && <BlueprintView blueprint={blueprint.blueprint} />}
                      {blueprint.aiUsage && (
                        <p className="text-xs text-mentor-text-muted mt-4">
                          {blueprint.aiUsage.model} &middot; {blueprint.aiUsage.totalTokens.toLocaleString()} tokens
                          {blueprint.aiUsage.pricingStatus === 'calculated' ? ` · est. ${formatCost(blueprint.aiUsage.totalCostUsd)}` : ''}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerApplicationDetailPage;
