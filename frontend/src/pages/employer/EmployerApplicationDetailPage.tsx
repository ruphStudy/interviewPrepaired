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
  ApplicationInterviewRubric,
  InterviewCompetencyRubric,
  RubricScoringAnchors,
  ApplicationInterviewInvitation,
  EmployerInterviewSessionSummary,
  EmployerInterviewSessionQuestions,
  EmployerInterviewSessionAnswers,
  EmployerHiringAnswerReasoningSignals,
  EmployerHiringAnswerConfidenceSignals,
  EmployerHiringAssessmentConsistency,
  EmployerHiringClaimVerification,
  EmployerHiringReasoningConfidenceAggregate,
  EmployerInterviewGraph,
  EmployerInterviewFollowUpRoute,
  EmployerInterviewCompetencyCoverage,
  EmployerInterviewAdaptiveRoute,
  EmployerInterviewGraphAnalytics,
  EmployerInterviewScenario,
  EmployerInterviewScenarioInput,
  EmployerInterviewScenarioCategory,
  EmployerInterviewScenarioDifficulty,
  EmployerInterviewScenarioQuestionSet,
  EmployerInterviewScenarioResponseEvaluation,
  EmployerInterviewScenarioSessionDetail,
  EmployerInterviewScenarioReport,
  EmployerHiringAssessmentResult,
  EmployerHiringEvidenceMatrix,
  EmployerHiringFollowUpPlan,
  EmployerHiringAssessmentReportDetail,
  HiringReportReviewSummary,
  FinalizationReadinessChecklist,
  EmployerHiringAssessmentFinalization,
  ApplicationTimeline,
  EmployerJobApplicationDecisionRecord,
  EmployerJobApplicationDecisionType,
  EmployerJobApplicationDecisionReasonCode,
  EMPLOYER_JOB_APPLICATION_DECISION_TYPES,
  EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES,
  EmployerJobApplicationNoteRecord,
  EmployerJobApplicationCollaborator,
  EmployerAvailableCollaborationMember,
  EmployerJobApplicationCollaborationRole,
  EMPLOYER_JOB_APPLICATION_COLLABORATION_ROLES,
  EmployerCandidateCommunicationRecord,
  EmployerCandidateCommunicationDirection,
  EmployerCandidateCommunicationChannel,
  EmployerCandidateCommunicationType,
  EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS,
  EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS,
  EMPLOYER_CANDIDATE_COMMUNICATION_TYPES,
  EmployerApplicationSkillGraph,
  EmployerApplicationSkillIntelligence,
  EmployerInterviewKnowledgeConfig,
  OrganizationKnowledgeBase,
  EmployerHiringKnowledgeGroundedEvaluation,
  EmployerInterviewKnowledgeAnalytics,
  EmployerCodingQuestionSummary,
  EmployerCodingAssessmentSession,
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
  ListChecks,
  Send,
  MonitorPlay,
  History,
  X,
  UserPlus,
  MessageSquare,
  Network,
  Plus,
} from 'lucide-react';

const INVITATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  accepted: 'Accepted',
  expired: 'Expired',
  revoked: 'Revoked',
};

const INVITATION_STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  active: 'badge-success',
  accepted: 'badge-info',
  expired: 'badge-neutral',
  revoked: 'badge-neutral',
};

const RUBRIC_IMPORTANCE_BADGE: Record<string, string> = {
  critical: 'badge-warning',
  high: 'badge-info',
  medium: 'badge-neutral',
  low: 'badge-neutral',
};

const RUBRIC_SCORE_KEYS = [1, 2, 3, 4, 5] as const;

/** Read-only rendering of a deterministic 20B evaluation rubric — guides interviewer evaluation only, never a candidate score; the 1-5 anchors are shown as reference criteria, never as if a candidate has already been scored. */
const RubricView: React.FC<{ rubric: InterviewCompetencyRubric }> = ({ rubric }) => (
  <div className="space-y-5">
    <div className="surface-muted p-4">
      <p className="label mb-2">Coverage Summary</p>
      <p className="text-sm text-mentor-text">
        {rubric.coverage.coveredCompetencies}/{rubric.coverage.totalCompetencies} competencies covered ({rubric.coverage.coveragePercent}%)
      </p>
      <p className="text-xs text-mentor-text-muted mt-1">
        Critical: {rubric.coverage.criticalCovered}/{rubric.coverage.criticalTotal} &middot; High: {rubric.coverage.highCovered}/
        {rubric.coverage.highTotal}
      </p>
      {rubric.coverage.uncoveredCompetencies.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-mentor-text-muted mb-1">Uncovered:</p>
          <div className="flex flex-wrap gap-1.5">
            {rubric.coverage.uncoveredCompetencies.map((name) => (
              <span key={name} className="badge badge-neutral">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>

    <div className="space-y-3">
      {rubric.competencies.map((c) => (
        <div key={c.competencyName} className="surface-muted p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
            <p className="text-sm font-semibold text-mentor-text">{c.competencyName}</p>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`badge ${RUBRIC_IMPORTANCE_BADGE[c.importance] || 'badge-neutral'}`}>{c.importance}</span>
              <span className="text-xs text-mentor-text-muted">weight {c.jdWeight}</span>
            </div>
          </div>
          {c.description && <p className="text-sm text-mentor-text-secondary mb-2">{c.description}</p>}
          <p className="text-xs text-mentor-text-muted mb-2">
            {c.sectionIds.length} section{c.sectionIds.length === 1 ? '' : 's'} &middot; {c.plannedIntentCount} planned intent
            {c.plannedIntentCount === 1 ? '' : 's'}
          </p>
          {c.evidenceSignals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {c.evidenceSignals.map((s) => (
                <span key={s} className="badge badge-neutral">
                  {s}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs font-medium text-mentor-text-muted mb-1.5">Scoring Anchors (1-5)</p>
          <div className="space-y-1.5">
            {RUBRIC_SCORE_KEYS.map((n) => (
              <div key={n} className="flex gap-2 text-xs">
                <span className="font-semibold text-mentor-text-muted shrink-0 w-4">{n}</span>
                <p className="text-mentor-text-secondary">{c.scoringAnchors[`score${n}` as keyof RubricScoringAnchors]}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

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
const capitalizeStatus = (value?: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '—');

const labelizeCode = (value?: string) => (value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

// 29E — deliberately worded to avoid implying deception detection ("Candidate lied"/"False") — see Sprint 29E wording rules.
const KNOWLEDGE_ALIGNMENT_LABEL: Record<string, string> = {
  aligned: 'Aligned',
  partially_aligned: 'Partially Aligned',
  conflicting: 'Conflicting',
  insufficient_evidence: 'Insufficient Evidence',
  not_applicable: 'Not Applicable',
};
const KNOWLEDGE_ALIGNMENT_BADGE: Record<string, string> = {
  aligned: 'badge-success',
  partially_aligned: 'badge-warning',
  conflicting: 'badge-warning',
  insufficient_evidence: 'badge-neutral',
  not_applicable: 'badge-neutral',
};
const KNOWLEDGE_ALIGNMENT_NOTE: Record<string, string> = {
  aligned: 'This response aligns with the organization knowledge retrieved for this question.',
  partially_aligned: 'This response partially aligns with the organization knowledge retrieved for this question.',
  conflicting: 'This response conflicts with the organization knowledge retrieved for this question.',
  insufficient_evidence: "There isn't enough retrieved organization knowledge to assess this response.",
  not_applicable: 'Knowledge alignment does not apply to this response.',
};
const KNOWLEDGE_CLAIM_LABEL: Record<string, string> = {
  supported: 'Supported',
  partially_supported: 'Partially Supported',
  conflicting: 'Conflicting',
  not_supported: 'Not Supported',
  unverifiable: 'Unverifiable',
};
const KNOWLEDGE_CLAIM_BADGE: Record<string, string> = {
  supported: 'badge-success',
  partially_supported: 'badge-warning',
  conflicting: 'badge-warning',
  not_supported: 'badge-neutral',
  unverifiable: 'badge-neutral',
};
const KNOWLEDGE_CLAIM_NOTE: Record<string, string> = {
  supported: 'Confirmed by the retrieved organization knowledge.',
  partially_supported: 'Partially confirmed by the retrieved organization knowledge.',
  conflicting: 'This response conflicts with the organization knowledge retrieved for this question.',
  not_supported: 'Not supported by the retrieved organization knowledge.',
  unverifiable: 'Cannot be verified from the retrieved organization knowledge.',
};

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

  const [rubric, setRubric] = useState<ApplicationInterviewRubric | null>(null);
  const [rubricLoading, setRubricLoading] = useState(true);
  const [rubricError, setRubricError] = useState<string | null>(null);
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [generateRubricError, setGenerateRubricError] = useState<string | null>(null);

  const [invitation, setInvitation] = useState<ApplicationInterviewInvitation | null>(null);
  const [invitationLoading, setInvitationLoading] = useState(true);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  const [expiresInDaysInput, setExpiresInDaysInput] = useState('7');
  const [invitationMessageInput, setInvitationMessageInput] = useState('');
  const [creatingInvitation, setCreatingInvitation] = useState(false);
  const [createInvitationError, setCreateInvitationError] = useState<string | null>(null);

  const [regeneratingInvitation, setRegeneratingInvitation] = useState(false);
  const [regenerateInvitationError, setRegenerateInvitationError] = useState<string | null>(null);

  const [revokingInvitation, setRevokingInvitation] = useState(false);
  const [revokeInvitationError, setRevokeInvitationError] = useState<string | null>(null);

  // Shown only once, right after create/regenerate in THIS session — the
  // raw token is never persisted server-side and never returned by GET.
  const [rawInvitationToken, setRawInvitationToken] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const [interviewSession, setInterviewSession] = useState<EmployerInterviewSessionSummary | null>(null);
  const [interviewSessionLoading, setInterviewSessionLoading] = useState(true);
  const [interviewSessionError, setInterviewSessionError] = useState<string | null>(null);

  const [knowledgeConfig, setKnowledgeConfig] = useState<EmployerInterviewKnowledgeConfig | null>(null);
  const [knowledgeConfigLoading, setKnowledgeConfigLoading] = useState(false);
  const [knowledgeConfigError, setKnowledgeConfigError] = useState<string | null>(null);
  const [availableKnowledgeBases, setAvailableKnowledgeBases] = useState<OrganizationKnowledgeBase[]>([]);
  const [availableKnowledgeBasesLoading, setAvailableKnowledgeBasesLoading] = useState(false);
  const [kcEnabled, setKcEnabled] = useState(false);
  const [kcSelectedKbIds, setKcSelectedKbIds] = useState<string[]>([]);
  const [kcMaxChunks, setKcMaxChunks] = useState(5);
  const [savingKnowledgeConfig, setSavingKnowledgeConfig] = useState(false);
  const [saveKnowledgeConfigError, setSaveKnowledgeConfigError] = useState<string | null>(null);

  const [codingSession, setCodingSession] = useState<EmployerCodingAssessmentSession | null>(null);
  const [codingSessionLoading, setCodingSessionLoading] = useState(false);
  const [codingSessionError, setCodingSessionError] = useState<string | null>(null);
  const [readyCodingQuestions, setReadyCodingQuestions] = useState<EmployerCodingQuestionSummary[]>([]);
  const [selectedCodingQuestionIds, setSelectedCodingQuestionIds] = useState<string[]>([]);
  const [savingCodingSession, setSavingCodingSession] = useState(false);
  const [saveCodingSessionError, setSaveCodingSessionError] = useState<string | null>(null);

  const [sessionQuestions, setSessionQuestions] = useState<EmployerInterviewSessionQuestions | null>(null);
  const [sessionQuestionsLoading, setSessionQuestionsLoading] = useState(false);
  const [sessionQuestionsError, setSessionQuestionsError] = useState<string | null>(null);

  const [sessionAnswers, setSessionAnswers] = useState<EmployerInterviewSessionAnswers | null>(null);
  const [sessionAnswersLoading, setSessionAnswersLoading] = useState(false);
  const [sessionAnswersError, setSessionAnswersError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateError, setEvaluateError] = useState<string | null>(null);

  const [reasoningSignalsByQuestion, setReasoningSignalsByQuestion] = useState<Record<string, EmployerHiringAnswerReasoningSignals>>({});
  const [reasoningLoadingByQuestion, setReasoningLoadingByQuestion] = useState<Record<string, boolean>>({});
  const [reasoningErrorByQuestion, setReasoningErrorByQuestion] = useState<Record<string, string>>({});
  const [reasoningGeneratingByQuestion, setReasoningGeneratingByQuestion] = useState<Record<string, boolean>>({});

  const [confidenceSignalsByQuestion, setConfidenceSignalsByQuestion] = useState<Record<string, EmployerHiringAnswerConfidenceSignals>>({});
  const [confidenceLoadingByQuestion, setConfidenceLoadingByQuestion] = useState<Record<string, boolean>>({});
  const [confidenceErrorByQuestion, setConfidenceErrorByQuestion] = useState<Record<string, string>>({});
  const [confidenceGeneratingByQuestion, setConfidenceGeneratingByQuestion] = useState<Record<string, boolean>>({});

  const [assessmentConsistency, setAssessmentConsistency] = useState<EmployerHiringAssessmentConsistency | null>(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [generatingConsistency, setGeneratingConsistency] = useState(false);

  const [claimVerification, setClaimVerification] = useState<EmployerHiringClaimVerification | null>(null);
  const [claimVerificationLoading, setClaimVerificationLoading] = useState(false);
  const [claimVerificationError, setClaimVerificationError] = useState<string | null>(null);
  const [generatingClaimVerification, setGeneratingClaimVerification] = useState(false);

  const [reasoningConfidenceAggregate, setReasoningConfidenceAggregate] = useState<EmployerHiringReasoningConfidenceAggregate | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [buildingAggregate, setBuildingAggregate] = useState(false);
  const [buildAggregateError, setBuildAggregateError] = useState<string | null>(null);

  const [interviewGraph, setInterviewGraph] = useState<EmployerInterviewGraph | null>(null);
  const [interviewGraphLoading, setInterviewGraphLoading] = useState(false);
  const [interviewGraphError, setInterviewGraphError] = useState<string | null>(null);
  const [buildingInterviewGraph, setBuildingInterviewGraph] = useState(false);
  const [buildInterviewGraphError, setBuildInterviewGraphError] = useState<string | null>(null);

  const [followUpRouteByQuestion, setFollowUpRouteByQuestion] = useState<Record<string, EmployerInterviewFollowUpRoute>>({});
  const [followUpRouteLoadingByQuestion, setFollowUpRouteLoadingByQuestion] = useState<Record<string, boolean>>({});
  const [followUpRouteErrorByQuestion, setFollowUpRouteErrorByQuestion] = useState<Record<string, string>>({});
  const [followUpRouteGeneratingByQuestion, setFollowUpRouteGeneratingByQuestion] = useState<Record<string, boolean>>({});

  const [knowledgeEvaluationByQuestion, setKnowledgeEvaluationByQuestion] = useState<Record<string, EmployerHiringKnowledgeGroundedEvaluation>>({});
  const [knowledgeEvaluationLoadingByQuestion, setKnowledgeEvaluationLoadingByQuestion] = useState<Record<string, boolean>>({});
  const [knowledgeEvaluationErrorByQuestion, setKnowledgeEvaluationErrorByQuestion] = useState<Record<string, string>>({});
  const [knowledgeEvaluationGeneratingByQuestion, setKnowledgeEvaluationGeneratingByQuestion] = useState<Record<string, boolean>>({});

  const [knowledgeAnalytics, setKnowledgeAnalytics] = useState<EmployerInterviewKnowledgeAnalytics | null>(null);
  const [knowledgeAnalyticsLoading, setKnowledgeAnalyticsLoading] = useState(false);
  const [knowledgeAnalyticsError, setKnowledgeAnalyticsError] = useState<string | null>(null);
  const [buildingKnowledgeAnalytics, setBuildingKnowledgeAnalytics] = useState(false);
  const [buildKnowledgeAnalyticsError, setBuildKnowledgeAnalyticsError] = useState<string | null>(null);

  const [competencyCoverage, setCompetencyCoverage] = useState<EmployerInterviewCompetencyCoverage | null>(null);
  const [competencyCoverageLoading, setCompetencyCoverageLoading] = useState(false);
  const [competencyCoverageError, setCompetencyCoverageError] = useState<string | null>(null);
  const [buildingCompetencyCoverage, setBuildingCompetencyCoverage] = useState(false);
  const [buildCompetencyCoverageError, setBuildCompetencyCoverageError] = useState<string | null>(null);

  const [adaptiveRoutes, setAdaptiveRoutes] = useState<EmployerInterviewAdaptiveRoute[]>([]);
  const [adaptiveRoutesLoading, setAdaptiveRoutesLoading] = useState(false);
  const [adaptiveRoutesError, setAdaptiveRoutesError] = useState<string | null>(null);
  const [selectingAdaptiveRoute, setSelectingAdaptiveRoute] = useState(false);
  const [selectAdaptiveRouteError, setSelectAdaptiveRouteError] = useState<string | null>(null);

  const [graphAnalytics, setGraphAnalytics] = useState<EmployerInterviewGraphAnalytics | null>(null);
  const [graphAnalyticsLoading, setGraphAnalyticsLoading] = useState(false);
  const [graphAnalyticsError, setGraphAnalyticsError] = useState<string | null>(null);
  const [buildingGraphAnalytics, setBuildingGraphAnalytics] = useState(false);
  const [buildGraphAnalyticsError, setBuildGraphAnalyticsError] = useState<string | null>(null);

  const [scenarios, setScenarios] = useState<EmployerInterviewScenario[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [showScenarioForm, setShowScenarioForm] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [scenarioTitle, setScenarioTitle] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioCategory, setScenarioCategory] = useState<EmployerInterviewScenarioCategory>('technical');
  const [scenarioSituation, setScenarioSituation] = useState('');
  const [scenarioCandidateRole, setScenarioCandidateRole] = useState('');
  const [scenarioConstraints, setScenarioConstraints] = useState('');
  const [scenarioAvailableInformation, setScenarioAvailableInformation] = useState('');
  const [scenarioTargetCompetencies, setScenarioTargetCompetencies] = useState<string[]>([]);
  const [scenarioDifficulty, setScenarioDifficulty] = useState<EmployerInterviewScenarioDifficulty>('medium');
  const [scenarioObjectives, setScenarioObjectives] = useState('');
  const [scenarioSuccessEvidence, setScenarioSuccessEvidence] = useState('');
  const [scenarioFailureSignals, setScenarioFailureSignals] = useState('');
  const [savingScenario, setSavingScenario] = useState(false);
  const [saveScenarioError, setSaveScenarioError] = useState<string | null>(null);
  const [scenarioActionErrorById, setScenarioActionErrorById] = useState<Record<string, string>>({});
  const [scenarioActionPendingId, setScenarioActionPendingId] = useState<string | null>(null);

  const [expandedScenarioId, setExpandedScenarioId] = useState<string | null>(null);
  const [scenarioQuestionsById, setScenarioQuestionsById] = useState<Record<string, EmployerInterviewScenarioQuestionSet>>({});
  const [scenarioQuestionsLoadingById, setScenarioQuestionsLoadingById] = useState<Record<string, boolean>>({});
  const [scenarioQuestionsErrorById, setScenarioQuestionsErrorById] = useState<Record<string, string>>({});
  const [generatingScenarioQuestionsId, setGeneratingScenarioQuestionsId] = useState<string | null>(null);

  const [scenarioSessionById, setScenarioSessionById] = useState<Record<string, EmployerInterviewScenarioSessionDetail>>({});
  const [scenarioSessionLoadingById, setScenarioSessionLoadingById] = useState<Record<string, boolean>>({});
  const [scenarioSessionErrorById, setScenarioSessionErrorById] = useState<Record<string, string>>({});

  const [evaluationByStepKey, setEvaluationByStepKey] = useState<Record<string, EmployerInterviewScenarioResponseEvaluation>>({});
  const [evaluationLoadingByStepKey, setEvaluationLoadingByStepKey] = useState<Record<string, boolean>>({});
  const [evaluationErrorByStepKey, setEvaluationErrorByStepKey] = useState<Record<string, string>>({});
  const [evaluatingStepKey, setEvaluatingStepKey] = useState<string | null>(null);

  const [scenarioReportById, setScenarioReportById] = useState<Record<string, EmployerInterviewScenarioReport>>({});
  const [scenarioReportLoadingById, setScenarioReportLoadingById] = useState<Record<string, boolean>>({});
  const [scenarioReportErrorById, setScenarioReportErrorById] = useState<Record<string, string>>({});
  const [buildingScenarioReportId, setBuildingScenarioReportId] = useState<string | null>(null);
  const [buildScenarioReportErrorById, setBuildScenarioReportErrorById] = useState<Record<string, string>>({});

  const [assessmentResult, setAssessmentResult] = useState<EmployerHiringAssessmentResult | null>(null);
  const [assessmentResultLoading, setAssessmentResultLoading] = useState(false);
  const [assessmentResultError, setAssessmentResultError] = useState<string | null>(null);
  const [generatingResult, setGeneratingResult] = useState(false);
  const [generateResultError, setGenerateResultError] = useState<string | null>(null);

  const [evidenceMatrix, setEvidenceMatrix] = useState<EmployerHiringEvidenceMatrix | null>(null);
  const [evidenceMatrixLoading, setEvidenceMatrixLoading] = useState(false);
  const [evidenceMatrixError, setEvidenceMatrixError] = useState<string | null>(null);
  const [generatingEvidence, setGeneratingEvidence] = useState(false);
  const [generateEvidenceError, setGenerateEvidenceError] = useState<string | null>(null);

  const [followUpPlan, setFollowUpPlan] = useState<EmployerHiringFollowUpPlan | null>(null);
  const [followUpPlanLoading, setFollowUpPlanLoading] = useState(false);
  const [followUpPlanError, setFollowUpPlanError] = useState<string | null>(null);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [generateFollowUpError, setGenerateFollowUpError] = useState<string | null>(null);

  const [hiringReport, setHiringReport] = useState<EmployerHiringAssessmentReportDetail | null>(null);
  const [hiringReportLoading, setHiringReportLoading] = useState(false);
  const [hiringReportError, setHiringReportError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [generateReportError, setGenerateReportError] = useState<string | null>(null);

  const [reviewSummary, setReviewSummary] = useState<HiringReportReviewSummary | null>(null);
  const [reviewSummaryLoading, setReviewSummaryLoading] = useState(false);
  const [reviewSummaryError, setReviewSummaryError] = useState<string | null>(null);
  const [reviewNotesDraft, setReviewNotesDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [saveReviewError, setSaveReviewError] = useState<string | null>(null);

  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadReportError, setDownloadReportError] = useState<string | null>(null);

  const [finalization, setFinalization] = useState<EmployerHiringAssessmentFinalization | null>(null);
  const [finalizationChecklist, setFinalizationChecklist] = useState<FinalizationReadinessChecklist | null>(null);
  const [finalizationLoading, setFinalizationLoading] = useState(false);
  const [finalizationError, setFinalizationError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<ApplicationTimeline | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<EmployerJobApplicationDecisionRecord[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState(true);
  const [decisionsError, setDecisionsError] = useState<string | null>(null);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [decisionTypeInput, setDecisionTypeInput] = useState<EmployerJobApplicationDecisionType>('continue_process');
  const [reasonCodeInput, setReasonCodeInput] = useState<EmployerJobApplicationDecisionReasonCode>('skills_match');
  const [decisionNotesInput, setDecisionNotesInput] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);
  const [saveDecisionError, setSaveDecisionError] = useState<string | null>(null);

  const [internalNotes, setInternalNotes] = useState<EmployerJobApplicationNoteRecord[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newNoteMentionIds, setNewNoteMentionIds] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [saveNoteError, setSaveNoteError] = useState<string | null>(null);

  const [collaborators, setCollaborators] = useState<EmployerJobApplicationCollaborator[]>([]);
  const [availableMembers, setAvailableMembers] = useState<EmployerAvailableCollaborationMember[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(true);
  const [collaboratorsError, setCollaboratorsError] = useState<string | null>(null);
  const [newCollaboratorMembershipId, setNewCollaboratorMembershipId] = useState('');
  const [newCollaboratorRole, setNewCollaboratorRole] = useState<EmployerJobApplicationCollaborationRole>('interviewer');
  const [savingCollaborator, setSavingCollaborator] = useState(false);
  const [saveCollaboratorError, setSaveCollaboratorError] = useState<string | null>(null);
  const [removingCollaboratorId, setRemovingCollaboratorId] = useState<string | null>(null);

  const [communications, setCommunications] = useState<EmployerCandidateCommunicationRecord[]>([]);
  const [communicationsLoading, setCommunicationsLoading] = useState(true);
  const [communicationsError, setCommunicationsError] = useState<string | null>(null);
  const [showCommunicationForm, setShowCommunicationForm] = useState(false);
  const [commDirection, setCommDirection] = useState<EmployerCandidateCommunicationDirection>('outbound');
  const [commChannel, setCommChannel] = useState<EmployerCandidateCommunicationChannel>('email');
  const [commType, setCommType] = useState<EmployerCandidateCommunicationType>('outreach');
  const [commSubject, setCommSubject] = useState('');
  const [commSummary, setCommSummary] = useState('');
  const [commOccurredAt, setCommOccurredAt] = useState('');
  const [savingCommunication, setSavingCommunication] = useState(false);
  const [saveCommunicationError, setSaveCommunicationError] = useState<string | null>(null);

  const [skillGraph, setSkillGraph] = useState<EmployerApplicationSkillGraph | null>(null);
  const [skillGraphLoading, setSkillGraphLoading] = useState(true);
  const [skillGraphError, setSkillGraphError] = useState<string | null>(null);
  const [buildingSkillGraph, setBuildingSkillGraph] = useState(false);
  const [buildSkillGraphError, setBuildSkillGraphError] = useState<string | null>(null);
  const [skillIntelligence, setSkillIntelligence] = useState<EmployerApplicationSkillIntelligence | null>(null);
  const [skillIntelligenceLoading, setSkillIntelligenceLoading] = useState(true);
  const [skillIntelligenceError, setSkillIntelligenceError] = useState<string | null>(null);
  const [buildingSkillIntelligence, setBuildingSkillIntelligence] = useState(false);
  const [buildSkillIntelligenceError, setBuildSkillIntelligenceError] = useState<string | null>(null);

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

  const fetchRubric = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setRubricLoading(true);
    setRubricError(null);
    try {
      const response = await employerApi.getEmployerInterviewRubric(organizationId, applicationId);
      setRubric(response.data.rubric);
    } catch (err: any) {
      setRubricError(err.message || 'Failed to load interview evaluation rubric');
    } finally {
      setRubricLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchRubric();
    }
  }, [isSyncing, activeOrganization, canView, fetchRubric]);

  const handleGenerateRubric = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingRubric(true);
    setGenerateRubricError(null);
    try {
      const response = await employerApi.generateEmployerInterviewRubric(organizationId, applicationId);
      setRubric(response.data.rubric);
    } catch (err: any) {
      setGenerateRubricError(err.message || 'Failed to generate interview evaluation rubric');
    } finally {
      setGeneratingRubric(false);
    }
  };

  const fetchInvitation = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setInvitationLoading(true);
    setInvitationError(null);
    try {
      const response = await employerApi.getEmployerInterviewInvitation(organizationId, applicationId);
      setInvitation(response.data.invitation);
    } catch (err: any) {
      setInvitationError(err.message || 'Failed to load interview invitation');
    } finally {
      setInvitationLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchInvitation();
    }
  }, [isSyncing, activeOrganization, canView, fetchInvitation]);

  const fetchInterviewSession = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setInterviewSessionLoading(true);
    setInterviewSessionError(null);
    try {
      const response = await employerApi.getEmployerInterviewSession(organizationId, applicationId);
      setInterviewSession(response.data.session);
    } catch (err: any) {
      setInterviewSessionError(err.message || 'Failed to load interview session');
    } finally {
      setInterviewSessionLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchInterviewSession();
    }
  }, [isSyncing, activeOrganization, canView, fetchInterviewSession]);

  const fetchKnowledgeConfig = useCallback(async () => {
    if (!organizationId || !interviewSession) return;
    setKnowledgeConfigLoading(true);
    setKnowledgeConfigError(null);
    try {
      const response = await employerApi.getEmployerInterviewKnowledgeConfig(organizationId, interviewSession.id);
      setKnowledgeConfig(response.data);
      setKcEnabled(response.data.enabled);
      setKcSelectedKbIds(response.data.knowledgeBaseIds);
      setKcMaxChunks(response.data.maxRetrievedChunks);
    } catch (err: any) {
      setKnowledgeConfigError(err.message || 'Failed to load organization knowledge configuration');
    } finally {
      setKnowledgeConfigLoading(false);
    }
  }, [organizationId, interviewSession]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && interviewSession) {
      fetchKnowledgeConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, activeOrganization, canView, interviewSession?.id]);

  const fetchAvailableKnowledgeBases = useCallback(async () => {
    if (!organizationId) return;
    setAvailableKnowledgeBasesLoading(true);
    try {
      const response = await employerApi.listOrganizationKnowledgeBases(organizationId);
      setAvailableKnowledgeBases(response.data.knowledgeBases.filter((kb) => kb.status === 'active'));
    } catch {
      // Non-critical — the config section still works with an empty picker; surfaced via saveKnowledgeConfigError on save if it matters.
    } finally {
      setAvailableKnowledgeBasesLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canManage && interviewSession) {
      fetchAvailableKnowledgeBases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, activeOrganization, canManage, interviewSession?.id]);

  const handleSaveKnowledgeConfig = async () => {
    if (!organizationId || !interviewSession) return;
    setSavingKnowledgeConfig(true);
    setSaveKnowledgeConfigError(null);
    try {
      const response = await employerApi.updateEmployerInterviewKnowledgeConfig(organizationId, interviewSession.id, {
        enabled: kcEnabled,
        knowledgeBaseIds: kcSelectedKbIds,
        maxRetrievedChunks: kcMaxChunks,
      });
      setKnowledgeConfig(response.data);
    } catch (err: any) {
      setSaveKnowledgeConfigError(err.message || 'Failed to save organization knowledge configuration');
    } finally {
      setSavingKnowledgeConfig(false);
    }
  };

  const fetchCodingSession = useCallback(async () => {
    if (!organizationId || !interviewSession) return;
    setCodingSessionLoading(true);
    setCodingSessionError(null);
    try {
      const response = await employerApi.getEmployerCodingAssessmentSession(organizationId, interviewSession.id);
      setCodingSession(response.data);
    } catch (err: any) {
      setCodingSessionError(err.message || 'Failed to load coding assessment session');
    } finally {
      setCodingSessionLoading(false);
    }
  }, [organizationId, interviewSession]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && interviewSession) {
      fetchCodingSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, activeOrganization, canView, interviewSession?.id]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canManage && interviewSession) {
      employerApi
        .listEmployerCodingQuestions(organizationId!, { status: 'ready' })
        .then((res) => setReadyCodingQuestions(res.data.questions))
        .catch(() => {});
    }
  }, [isSyncing, activeOrganization, canManage, interviewSession?.id, organizationId]);

  const handleSaveCodingSession = async () => {
    if (!organizationId || !interviewSession) return;
    setSavingCodingSession(true);
    setSaveCodingSessionError(null);
    try {
      const response = await employerApi.createOrUpdateEmployerCodingAssessmentSession(organizationId, interviewSession.id, selectedCodingQuestionIds);
      setCodingSession(response.data);
    } catch (err: any) {
      setSaveCodingSessionError(err.message || 'Failed to save coding assessment');
    } finally {
      setSavingCodingSession(false);
    }
  };

  const fetchSessionQuestions = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setSessionQuestionsLoading(true);
    setSessionQuestionsError(null);
    try {
      const response = await employerApi.getEmployerInterviewSessionQuestions(organizationId, applicationId);
      setSessionQuestions(response.data.session);
    } catch (err: any) {
      setSessionQuestionsError(err.message || 'Failed to load interview questions');
    } finally {
      setSessionQuestionsLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && interviewSession) {
      fetchSessionQuestions();
    }
  }, [isSyncing, activeOrganization, canView, interviewSession, fetchSessionQuestions]);

  const fetchSessionAnswers = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setSessionAnswersLoading(true);
    setSessionAnswersError(null);
    try {
      const response = await employerApi.getEmployerInterviewSessionAnswers(organizationId, applicationId);
      setSessionAnswers(response.data.session);
    } catch (err: any) {
      setSessionAnswersError(err.message || 'Failed to load interview answers');
    } finally {
      setSessionAnswersLoading(false);
    }
  }, [organizationId, applicationId]);

  const isSessionCompleted = interviewSession?.status === 'completed' || interviewSession?.status === 'evaluated';

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && isSessionCompleted) {
      fetchSessionAnswers();
    }
  }, [isSyncing, activeOrganization, canView, isSessionCompleted, fetchSessionAnswers]);

  const handleEvaluateAssessment = async () => {
    if (!organizationId || !applicationId) return;
    setEvaluating(true);
    setEvaluateError(null);
    try {
      const response = await employerApi.evaluateEmployerInterviewSession(organizationId, applicationId);
      setSessionAnswers(response.data.session);
    } catch (err: any) {
      setEvaluateError(err.message || 'Failed to evaluate interview');
    } finally {
      setEvaluating(false);
    }
  };

  const fetchReasoningSignals = useCallback(
    async (questionId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setReasoningLoadingByQuestion((prev) => ({ ...prev, [questionId]: true }));
      setReasoningErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
      try {
        const response = await employerApi.getEmployerHiringAnswerReasoningSignals(organizationId, sessionAnswers.sessionId, Number(questionId));
        setReasoningSignalsByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
      } catch (err: any) {
        setReasoningErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to load reasoning evidence' }));
      } finally {
        setReasoningLoadingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      sessionAnswers.questions.forEach((q) => {
        if (q.evaluation) fetchReasoningSignals(q.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleGenerateReasoningSignals = async (questionId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setReasoningGeneratingByQuestion((prev) => ({ ...prev, [questionId]: true }));
    setReasoningErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const response = await employerApi.generateEmployerHiringAnswerReasoningSignals(organizationId, sessionAnswers.sessionId, Number(questionId));
      setReasoningSignalsByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
    } catch (err: any) {
      setReasoningErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to generate reasoning evidence' }));
    } finally {
      setReasoningGeneratingByQuestion((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const fetchConfidenceSignals = useCallback(
    async (questionId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setConfidenceLoadingByQuestion((prev) => ({ ...prev, [questionId]: true }));
      setConfidenceErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
      try {
        const response = await employerApi.getEmployerHiringAnswerConfidenceSignals(organizationId, sessionAnswers.sessionId, Number(questionId));
        setConfidenceSignalsByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
      } catch (err: any) {
        setConfidenceErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to load confidence intelligence' }));
      } finally {
        setConfidenceLoadingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      sessionAnswers.questions.forEach((q) => {
        if (q.evaluation) fetchConfidenceSignals(q.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleGenerateConfidenceSignals = async (questionId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setConfidenceGeneratingByQuestion((prev) => ({ ...prev, [questionId]: true }));
    setConfidenceErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const response = await employerApi.generateEmployerHiringAnswerConfidenceSignals(organizationId, sessionAnswers.sessionId, Number(questionId));
      setConfidenceSignalsByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
    } catch (err: any) {
      setConfidenceErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to generate confidence intelligence' }));
    } finally {
      setConfidenceGeneratingByQuestion((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const fetchAssessmentConsistency = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setConsistencyLoading(true);
    setConsistencyError(null);
    try {
      const response = await employerApi.getEmployerHiringAssessmentConsistency(organizationId, sessionAnswers.sessionId);
      setAssessmentConsistency(response.data);
    } catch (err: any) {
      setConsistencyError(err.message || 'Failed to load consistency analysis');
    } finally {
      setConsistencyLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      fetchAssessmentConsistency();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleGenerateConsistency = async () => {
    if (!organizationId || !sessionAnswers) return;
    setGeneratingConsistency(true);
    setConsistencyError(null);
    try {
      const response = await employerApi.generateEmployerHiringAssessmentConsistency(organizationId, sessionAnswers.sessionId);
      setAssessmentConsistency(response.data);
    } catch (err: any) {
      setConsistencyError(err.message || 'Failed to generate consistency analysis');
    } finally {
      setGeneratingConsistency(false);
    }
  };

  const fetchClaimVerification = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setClaimVerificationLoading(true);
    setClaimVerificationError(null);
    try {
      const response = await employerApi.getEmployerHiringClaimVerification(organizationId, sessionAnswers.sessionId);
      setClaimVerification(response.data);
    } catch (err: any) {
      setClaimVerificationError(err.message || 'Failed to load claim evidence alignment');
    } finally {
      setClaimVerificationLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      fetchClaimVerification();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleGenerateClaimVerification = async () => {
    if (!organizationId || !sessionAnswers) return;
    setGeneratingClaimVerification(true);
    setClaimVerificationError(null);
    try {
      const response = await employerApi.generateEmployerHiringClaimVerification(organizationId, sessionAnswers.sessionId);
      setClaimVerification(response.data);
    } catch (err: any) {
      setClaimVerificationError(err.message || 'Failed to generate claim evidence alignment');
    } finally {
      setGeneratingClaimVerification(false);
    }
  };

  const fetchReasoningConfidenceAggregate = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setAggregateLoading(true);
    setAggregateError(null);
    try {
      const response = await employerApi.getEmployerHiringReasoningConfidenceAggregate(organizationId, sessionAnswers.sessionId);
      setReasoningConfidenceAggregate(response.data);
    } catch (err: any) {
      setAggregateError(err.message || 'Failed to load reasoning & confidence overview');
    } finally {
      setAggregateLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      fetchReasoningConfidenceAggregate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleBuildAggregate = async () => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingAggregate(true);
    setBuildAggregateError(null);
    try {
      const response = await employerApi.buildEmployerHiringReasoningConfidenceAggregate(organizationId, sessionAnswers.sessionId);
      setReasoningConfidenceAggregate(response.data);
    } catch (err: any) {
      setBuildAggregateError(err.message || 'Failed to build reasoning & confidence overview');
    } finally {
      setBuildingAggregate(false);
    }
  };

  const fetchInterviewGraph = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setInterviewGraphLoading(true);
    setInterviewGraphError(null);
    try {
      const response = await employerApi.getEmployerInterviewGraph(organizationId, sessionAnswers.sessionId);
      setInterviewGraph(response.data);
    } catch (err: any) {
      setInterviewGraphError(err.message || 'Failed to load interview graph');
    } finally {
      setInterviewGraphLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.sessionId) {
      fetchInterviewGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId]);

  const handleBuildInterviewGraph = async () => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingInterviewGraph(true);
    setBuildInterviewGraphError(null);
    try {
      const response = await employerApi.buildEmployerInterviewGraph(organizationId, sessionAnswers.sessionId);
      setInterviewGraph(response.data);
    } catch (err: any) {
      setBuildInterviewGraphError(err.message || 'Failed to build interview graph');
    } finally {
      setBuildingInterviewGraph(false);
    }
  };

  const fetchFollowUpRoute = useCallback(
    async (questionId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setFollowUpRouteLoadingByQuestion((prev) => ({ ...prev, [questionId]: true }));
      setFollowUpRouteErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
      try {
        const response = await employerApi.getEmployerInterviewFollowUpRoute(organizationId, sessionAnswers.sessionId, Number(questionId));
        setFollowUpRouteByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
      } catch (err: any) {
        setFollowUpRouteErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to load follow-up route' }));
      } finally {
        setFollowUpRouteLoadingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      sessionAnswers.questions.forEach((q) => {
        if (q.evaluation) fetchFollowUpRoute(q.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus, sessionAnswers?.questions.length]);

  const handleGenerateFollowUpRoute = async (questionId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setFollowUpRouteGeneratingByQuestion((prev) => ({ ...prev, [questionId]: true }));
    setFollowUpRouteErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const response = await employerApi.generateEmployerInterviewFollowUpRoute(organizationId, sessionAnswers.sessionId, Number(questionId));
      setFollowUpRouteByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
      if (response.data.generated && response.data.decision === 'follow_up') {
        // A new answerable question was appended to the interview — refresh so it shows up in the sequence.
        fetchSessionAnswers();
      }
    } catch (err: any) {
      setFollowUpRouteErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to generate follow-up route' }));
    } finally {
      setFollowUpRouteGeneratingByQuestion((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const fetchKnowledgeEvaluation = useCallback(
    async (questionId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setKnowledgeEvaluationLoadingByQuestion((prev) => ({ ...prev, [questionId]: true }));
      setKnowledgeEvaluationErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
      try {
        const response = await employerApi.getEmployerHiringKnowledgeGroundedEvaluation(organizationId, sessionAnswers.sessionId, Number(questionId));
        setKnowledgeEvaluationByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
      } catch (err: any) {
        setKnowledgeEvaluationErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to load knowledge alignment' }));
      } finally {
        setKnowledgeEvaluationLoadingByQuestion((prev) => ({ ...prev, [questionId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      sessionAnswers.questions.forEach((q) => {
        if (q.answerText) fetchKnowledgeEvaluation(q.id);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus, sessionAnswers?.questions.length]);

  const handleGenerateKnowledgeEvaluation = async (questionId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setKnowledgeEvaluationGeneratingByQuestion((prev) => ({ ...prev, [questionId]: true }));
    setKnowledgeEvaluationErrorByQuestion((prev) => ({ ...prev, [questionId]: '' }));
    try {
      const response = await employerApi.generateEmployerHiringKnowledgeGroundedEvaluation(
        organizationId,
        sessionAnswers.sessionId,
        Number(questionId)
      );
      setKnowledgeEvaluationByQuestion((prev) => ({ ...prev, [questionId]: response.data }));
    } catch (err: any) {
      setKnowledgeEvaluationErrorByQuestion((prev) => ({ ...prev, [questionId]: err.message || 'Failed to run knowledge alignment evaluation' }));
    } finally {
      setKnowledgeEvaluationGeneratingByQuestion((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  const fetchKnowledgeAnalytics = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setKnowledgeAnalyticsLoading(true);
    setKnowledgeAnalyticsError(null);
    try {
      const response = await employerApi.getEmployerInterviewKnowledgeAnalytics(organizationId, sessionAnswers.sessionId);
      setKnowledgeAnalytics(response.data);
    } catch (err: any) {
      setKnowledgeAnalyticsError(err.message || 'Failed to load knowledge analytics');
    } finally {
      setKnowledgeAnalyticsLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.hiringEvaluationStatus === 'completed') {
      fetchKnowledgeAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId, sessionAnswers?.hiringEvaluationStatus]);

  const handleBuildKnowledgeAnalytics = async () => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingKnowledgeAnalytics(true);
    setBuildKnowledgeAnalyticsError(null);
    try {
      const response = await employerApi.buildEmployerInterviewKnowledgeAnalytics(organizationId, sessionAnswers.sessionId);
      setKnowledgeAnalytics(response.data);
    } catch (err: any) {
      setBuildKnowledgeAnalyticsError(err.message || 'Failed to build knowledge analytics');
    } finally {
      setBuildingKnowledgeAnalytics(false);
    }
  };

  const fetchCompetencyCoverage = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setCompetencyCoverageLoading(true);
    setCompetencyCoverageError(null);
    try {
      const response = await employerApi.getEmployerInterviewCompetencyCoverage(organizationId, sessionAnswers.sessionId);
      setCompetencyCoverage(response.data);
    } catch (err: any) {
      setCompetencyCoverageError(err.message || 'Failed to load competency coverage');
    } finally {
      setCompetencyCoverageLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.sessionId) {
      fetchCompetencyCoverage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId]);

  const handleBuildCompetencyCoverage = async () => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingCompetencyCoverage(true);
    setBuildCompetencyCoverageError(null);
    try {
      const response = await employerApi.buildEmployerInterviewCompetencyCoverage(organizationId, sessionAnswers.sessionId);
      setCompetencyCoverage(response.data);
    } catch (err: any) {
      setBuildCompetencyCoverageError(err.message || 'Failed to build competency coverage');
    } finally {
      setBuildingCompetencyCoverage(false);
    }
  };

  const fetchAdaptiveRoutes = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setAdaptiveRoutesLoading(true);
    setAdaptiveRoutesError(null);
    try {
      const response = await employerApi.getEmployerInterviewAdaptiveRouteHistory(organizationId, sessionAnswers.sessionId);
      setAdaptiveRoutes(response.data.routes);
    } catch (err: any) {
      setAdaptiveRoutesError(err.message || 'Failed to load adaptive routing history');
    } finally {
      setAdaptiveRoutesLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.sessionId) {
      fetchAdaptiveRoutes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId]);

  const handleSelectAdaptiveRoute = async () => {
    if (!organizationId || !sessionAnswers) return;
    setSelectingAdaptiveRoute(true);
    setSelectAdaptiveRouteError(null);
    try {
      const latest = adaptiveRoutes[adaptiveRoutes.length - 1];
      const sourceQuestionIndex = latest?.selectedQuestionIndex;
      const response = await employerApi.selectEmployerInterviewAdaptiveRoute(organizationId, sessionAnswers.sessionId, sourceQuestionIndex);
      setAdaptiveRoutes((prev) => [...prev, response.data]);
    } catch (err: any) {
      setSelectAdaptiveRouteError(err.message || 'Failed to select next question');
    } finally {
      setSelectingAdaptiveRoute(false);
    }
  };

  const fetchGraphAnalytics = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setGraphAnalyticsLoading(true);
    setGraphAnalyticsError(null);
    try {
      const response = await employerApi.getEmployerInterviewGraphAnalytics(organizationId, sessionAnswers.sessionId);
      setGraphAnalytics(response.data);
    } catch (err: any) {
      setGraphAnalyticsError(err.message || 'Failed to load interview graph analytics');
    } finally {
      setGraphAnalyticsLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.sessionId) {
      fetchGraphAnalytics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId]);

  const handleBuildGraphAnalytics = async () => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingGraphAnalytics(true);
    setBuildGraphAnalyticsError(null);
    try {
      const response = await employerApi.buildEmployerInterviewGraphAnalytics(organizationId, sessionAnswers.sessionId);
      setGraphAnalytics(response.data);
    } catch (err: any) {
      setBuildGraphAnalyticsError(err.message || 'Failed to build interview graph analytics');
    } finally {
      setBuildingGraphAnalytics(false);
    }
  };

  const fetchScenarios = useCallback(async () => {
    if (!organizationId || !sessionAnswers) return;
    setScenariosLoading(true);
    setScenariosError(null);
    try {
      const response = await employerApi.listEmployerInterviewScenarios(organizationId, sessionAnswers.sessionId);
      setScenarios(response.data.scenarios);
    } catch (err: any) {
      setScenariosError(err.message || 'Failed to load scenarios');
    } finally {
      setScenariosLoading(false);
    }
  }, [organizationId, sessionAnswers]);

  useEffect(() => {
    if (sessionAnswers?.sessionId) {
      fetchScenarios();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionAnswers?.sessionId]);

  const splitList = (value: string): string[] =>
    value
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const resetScenarioForm = () => {
    setEditingScenarioId(null);
    setScenarioTitle('');
    setScenarioDescription('');
    setScenarioCategory('technical');
    setScenarioSituation('');
    setScenarioCandidateRole('');
    setScenarioConstraints('');
    setScenarioAvailableInformation('');
    setScenarioTargetCompetencies([]);
    setScenarioDifficulty('medium');
    setScenarioObjectives('');
    setScenarioSuccessEvidence('');
    setScenarioFailureSignals('');
    setSaveScenarioError(null);
  };

  const handleOpenCreateScenario = () => {
    resetScenarioForm();
    setShowScenarioForm(true);
  };

  const handleOpenEditScenario = (scenario: EmployerInterviewScenario) => {
    setEditingScenarioId(scenario.id);
    setScenarioTitle(scenario.title);
    setScenarioDescription(scenario.description);
    setScenarioCategory(scenario.category);
    setScenarioSituation(scenario.context.situation);
    setScenarioCandidateRole(scenario.context.candidateRole);
    setScenarioConstraints(scenario.context.constraints.join(', '));
    setScenarioAvailableInformation(scenario.context.availableInformation.join(', '));
    setScenarioTargetCompetencies(scenario.targetCompetencies);
    setScenarioDifficulty(scenario.difficulty);
    setScenarioObjectives(scenario.objectives.join(', '));
    setScenarioSuccessEvidence(scenario.successEvidence.join(', '));
    setScenarioFailureSignals(scenario.failureSignals.join(', '));
    setSaveScenarioError(null);
    setShowScenarioForm(true);
  };

  const handleToggleTargetCompetency = (name: string) => {
    setScenarioTargetCompetencies((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const handleSubmitScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !sessionAnswers) return;
    setSavingScenario(true);
    setSaveScenarioError(null);
    const input: EmployerInterviewScenarioInput = {
      title: scenarioTitle,
      description: scenarioDescription,
      category: scenarioCategory,
      context: {
        situation: scenarioSituation,
        candidateRole: scenarioCandidateRole,
        constraints: splitList(scenarioConstraints),
        availableInformation: splitList(scenarioAvailableInformation),
      },
      targetCompetencies: scenarioTargetCompetencies,
      difficulty: scenarioDifficulty,
      objectives: splitList(scenarioObjectives),
      successEvidence: splitList(scenarioSuccessEvidence),
      failureSignals: splitList(scenarioFailureSignals),
    };
    try {
      if (editingScenarioId) {
        await employerApi.updateEmployerInterviewScenario(organizationId, sessionAnswers.sessionId, editingScenarioId, input);
      } else {
        await employerApi.createEmployerInterviewScenario(organizationId, sessionAnswers.sessionId, input);
      }
      setShowScenarioForm(false);
      resetScenarioForm();
      fetchScenarios();
    } catch (err: any) {
      setSaveScenarioError(err.message || 'Failed to save scenario');
    } finally {
      setSavingScenario(false);
    }
  };

  const handleMarkScenarioReady = async (scenarioId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setScenarioActionPendingId(scenarioId);
    setScenarioActionErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
    try {
      await employerApi.updateEmployerInterviewScenario(organizationId, sessionAnswers.sessionId, scenarioId, { status: 'ready' });
      fetchScenarios();
    } catch (err: any) {
      setScenarioActionErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to mark scenario ready' }));
    } finally {
      setScenarioActionPendingId(null);
    }
  };

  const handleArchiveScenario = async (scenarioId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setScenarioActionPendingId(scenarioId);
    setScenarioActionErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
    try {
      await employerApi.archiveEmployerInterviewScenario(organizationId, sessionAnswers.sessionId, scenarioId);
      fetchScenarios();
    } catch (err: any) {
      setScenarioActionErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to archive scenario' }));
    } finally {
      setScenarioActionPendingId(null);
    }
  };

  const fetchScenarioQuestions = useCallback(
    async (scenarioId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setScenarioQuestionsLoadingById((prev) => ({ ...prev, [scenarioId]: true }));
      setScenarioQuestionsErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
      try {
        const response = await employerApi.getEmployerInterviewScenarioQuestions(organizationId, sessionAnswers.sessionId, scenarioId);
        setScenarioQuestionsById((prev) => ({ ...prev, [scenarioId]: response.data }));
      } catch (err: any) {
        setScenarioQuestionsErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to load scenario questions' }));
      } finally {
        setScenarioQuestionsLoadingById((prev) => ({ ...prev, [scenarioId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  const fetchScenarioSession = useCallback(
    async (scenarioId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setScenarioSessionLoadingById((prev) => ({ ...prev, [scenarioId]: true }));
      setScenarioSessionErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
      try {
        const response = await employerApi.getEmployerInterviewScenarioSession(organizationId, sessionAnswers.sessionId, scenarioId);
        setScenarioSessionById((prev) => ({ ...prev, [scenarioId]: response.data }));
      } catch (err: any) {
        setScenarioSessionErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to load scenario session' }));
      } finally {
        setScenarioSessionLoadingById((prev) => ({ ...prev, [scenarioId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  const fetchScenarioReport = useCallback(
    async (scenarioId: string) => {
      if (!organizationId || !sessionAnswers) return;
      setScenarioReportLoadingById((prev) => ({ ...prev, [scenarioId]: true }));
      setScenarioReportErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
      try {
        const response = await employerApi.getEmployerInterviewScenarioReport(organizationId, sessionAnswers.sessionId, scenarioId);
        setScenarioReportById((prev) => ({ ...prev, [scenarioId]: response.data }));
      } catch (err: any) {
        setScenarioReportErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to load scenario report' }));
      } finally {
        setScenarioReportLoadingById((prev) => ({ ...prev, [scenarioId]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  const handleBuildScenarioReport = async (scenarioId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setBuildingScenarioReportId(scenarioId);
    setBuildScenarioReportErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
    try {
      const response = await employerApi.buildEmployerInterviewScenarioReport(organizationId, sessionAnswers.sessionId, scenarioId);
      setScenarioReportById((prev) => ({ ...prev, [scenarioId]: response.data }));
    } catch (err: any) {
      setBuildScenarioReportErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to build scenario report' }));
    } finally {
      setBuildingScenarioReportId(null);
    }
  };

  const handleToggleScenarioExpanded = (scenarioId: string) => {
    const next = expandedScenarioId === scenarioId ? null : scenarioId;
    setExpandedScenarioId(next);
    if (next && !scenarioQuestionsById[next]) {
      fetchScenarioQuestions(next);
    }
    if (next && !scenarioSessionById[next]) {
      fetchScenarioSession(next);
    }
    if (next && !scenarioReportById[next]) {
      fetchScenarioReport(next);
    }
  };

  const fetchScenarioResponseEvaluation = useCallback(
    async (scenarioId: string, sequence: number) => {
      if (!organizationId || !sessionAnswers) return;
      const key = `${scenarioId}:${sequence}`;
      setEvaluationLoadingByStepKey((prev) => ({ ...prev, [key]: true }));
      setEvaluationErrorByStepKey((prev) => ({ ...prev, [key]: '' }));
      try {
        const response = await employerApi.getEmployerScenarioResponseEvaluation(organizationId, sessionAnswers.sessionId, scenarioId, sequence);
        setEvaluationByStepKey((prev) => ({ ...prev, [key]: response.data }));
      } catch (err: any) {
        setEvaluationErrorByStepKey((prev) => ({ ...prev, [key]: err.message || 'Failed to load response evaluation' }));
      } finally {
        setEvaluationLoadingByStepKey((prev) => ({ ...prev, [key]: false }));
      }
    },
    [organizationId, sessionAnswers]
  );

  useEffect(() => {
    if (!expandedScenarioId) return;
    const session = scenarioSessionById[expandedScenarioId];
    if (!session) return;
    session.responses.forEach((r) => {
      const key = `${expandedScenarioId}:${r.questionSequence}`;
      if (!evaluationByStepKey[key] && !evaluationLoadingByStepKey[key]) {
        fetchScenarioResponseEvaluation(expandedScenarioId, r.questionSequence);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedScenarioId, scenarioSessionById]);

  const handleGenerateScenarioResponseEvaluation = async (scenarioId: string, sequence: number) => {
    if (!organizationId || !sessionAnswers) return;
    const key = `${scenarioId}:${sequence}`;
    setEvaluatingStepKey(key);
    setEvaluationErrorByStepKey((prev) => ({ ...prev, [key]: '' }));
    try {
      const response = await employerApi.generateEmployerScenarioResponseEvaluation(organizationId, sessionAnswers.sessionId, scenarioId, sequence);
      setEvaluationByStepKey((prev) => ({ ...prev, [key]: response.data }));
    } catch (err: any) {
      setEvaluationErrorByStepKey((prev) => ({ ...prev, [key]: err.message || 'Failed to generate response evaluation' }));
    } finally {
      setEvaluatingStepKey(null);
    }
  };

  const handleGenerateScenarioQuestions = async (scenarioId: string) => {
    if (!organizationId || !sessionAnswers) return;
    setGeneratingScenarioQuestionsId(scenarioId);
    setScenarioQuestionsErrorById((prev) => ({ ...prev, [scenarioId]: '' }));
    try {
      const response = await employerApi.generateEmployerInterviewScenarioQuestions(organizationId, sessionAnswers.sessionId, scenarioId);
      setScenarioQuestionsById((prev) => ({ ...prev, [scenarioId]: response.data }));
    } catch (err: any) {
      setScenarioQuestionsErrorById((prev) => ({ ...prev, [scenarioId]: err.message || 'Failed to generate scenario questions' }));
    } finally {
      setGeneratingScenarioQuestionsId(null);
    }
  };

  const fetchAssessmentResult = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setAssessmentResultLoading(true);
    setAssessmentResultError(null);
    try {
      const response = await employerApi.getEmployerHiringAssessmentResult(organizationId, applicationId);
      setAssessmentResult(response.data.result);
    } catch (err: any) {
      setAssessmentResultError(err.message || 'Failed to load assessment result');
    } finally {
      setAssessmentResultLoading(false);
    }
  }, [organizationId, applicationId]);

  const isEvaluated = sessionAnswers?.hiringEvaluationStatus === 'completed';

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && isEvaluated) {
      fetchAssessmentResult();
    }
  }, [isSyncing, activeOrganization, canView, isEvaluated, fetchAssessmentResult]);

  const handleGenerateResult = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingResult(true);
    setGenerateResultError(null);
    try {
      const response = await employerApi.createEmployerHiringAssessmentResult(organizationId, applicationId);
      setAssessmentResult(response.data.result);
    } catch (err: any) {
      setGenerateResultError(err.message || 'Failed to generate assessment result');
    } finally {
      setGeneratingResult(false);
    }
  };

  const fetchEvidenceMatrix = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setEvidenceMatrixLoading(true);
    setEvidenceMatrixError(null);
    try {
      const response = await employerApi.getEmployerHiringEvidenceMatrix(organizationId, applicationId);
      setEvidenceMatrix(response.data.evidence);
    } catch (err: any) {
      setEvidenceMatrixError(err.message || 'Failed to load evidence analysis');
    } finally {
      setEvidenceMatrixLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && assessmentResult) {
      fetchEvidenceMatrix();
    }
  }, [isSyncing, activeOrganization, canView, assessmentResult, fetchEvidenceMatrix]);

  const handleGenerateEvidence = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingEvidence(true);
    setGenerateEvidenceError(null);
    try {
      const response = await employerApi.createEmployerHiringEvidenceMatrix(organizationId, applicationId);
      setEvidenceMatrix(response.data.evidence);
    } catch (err: any) {
      setGenerateEvidenceError(err.message || 'Failed to generate evidence analysis');
    } finally {
      setGeneratingEvidence(false);
    }
  };

  const needsFollowUp = (evidenceMatrix?.matrix.summary.followUpCompetencyCount ?? 0) > 0;

  const fetchFollowUpPlan = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setFollowUpPlanLoading(true);
    setFollowUpPlanError(null);
    try {
      const response = await employerApi.getEmployerHiringFollowUpPlan(organizationId, applicationId);
      setFollowUpPlan(response.data.followUpPlan);
    } catch (err: any) {
      setFollowUpPlanError(err.message || 'Failed to load follow-up plan');
    } finally {
      setFollowUpPlanLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && needsFollowUp) {
      fetchFollowUpPlan();
    }
  }, [isSyncing, activeOrganization, canView, needsFollowUp, fetchFollowUpPlan]);

  const handleGenerateFollowUp = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingFollowUp(true);
    setGenerateFollowUpError(null);
    try {
      const response = await employerApi.createEmployerHiringFollowUpPlan(organizationId, applicationId);
      setFollowUpPlan(response.data.followUpPlan);
    } catch (err: any) {
      setGenerateFollowUpError(err.message || 'Failed to generate follow-up plan');
    } finally {
      setGeneratingFollowUp(false);
    }
  };

  const reportPrerequisitesReady = Boolean(evidenceMatrix) && (!needsFollowUp || followUpPlan?.status === 'completed');

  const fetchHiringReport = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setHiringReportLoading(true);
    setHiringReportError(null);
    try {
      const response = await employerApi.getEmployerHiringAssessmentReport(organizationId, applicationId);
      setHiringReport(response.data.hiringReport);
    } catch (err: any) {
      setHiringReportError(err.message || 'Failed to load hiring report');
    } finally {
      setHiringReportLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && reportPrerequisitesReady) {
      fetchHiringReport();
    }
  }, [isSyncing, activeOrganization, canView, reportPrerequisitesReady, fetchHiringReport]);

  const handleGenerateReport = async () => {
    if (!organizationId || !applicationId) return;
    setGeneratingReport(true);
    setGenerateReportError(null);
    try {
      const response = await employerApi.createEmployerHiringAssessmentReport(organizationId, applicationId);
      setHiringReport(response.data.hiringReport);
    } catch (err: any) {
      setGenerateReportError(err.message || 'Failed to generate hiring report');
    } finally {
      setGeneratingReport(false);
    }
  };

  const isReportCompleted = hiringReport?.status === 'completed';

  const fetchReviewSummary = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setReviewSummaryLoading(true);
    setReviewSummaryError(null);
    try {
      const response = await employerApi.getHiringReportReviewSummary(organizationId, applicationId);
      setReviewSummary(response.data.reviewSummary);
      setReviewNotesDraft(response.data.reviewSummary?.currentUserReview?.reviewNotes || '');
    } catch (err: any) {
      setReviewSummaryError(err.message || 'Failed to load review summary');
    } finally {
      setReviewSummaryLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && isReportCompleted) {
      fetchReviewSummary();
    }
  }, [isSyncing, activeOrganization, canView, isReportCompleted, fetchReviewSummary]);

  const handleSaveReview = async () => {
    if (!organizationId || !applicationId) return;
    setSavingReview(true);
    setSaveReviewError(null);
    try {
      const response = await employerApi.upsertHiringReportReview(organizationId, applicationId, reviewNotesDraft);
      setReviewSummary(response.data.reviewSummary);
    } catch (err: any) {
      setSaveReviewError(err.message || 'Failed to save review');
    } finally {
      setSavingReview(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!organizationId || !applicationId) return;
    setDownloadingReport(true);
    setDownloadReportError(null);
    try {
      await employerApi.downloadHiringReportExport(organizationId, applicationId);
    } catch (err: any) {
      setDownloadReportError(err.message || 'Failed to download hiring report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const fetchFinalization = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setFinalizationLoading(true);
    setFinalizationError(null);
    try {
      const response = await employerApi.getHiringAssessmentFinalization(organizationId, applicationId);
      setFinalization(response.data.finalization);
      setFinalizationChecklist(response.data.checklist);
    } catch (err: any) {
      setFinalizationError(err.message || 'Failed to load finalization readiness');
    } finally {
      setFinalizationLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView && isReportCompleted) {
      fetchFinalization();
    }
  }, [isSyncing, activeOrganization, canView, isReportCompleted, fetchFinalization]);

  const handleFinalize = async () => {
    if (!organizationId || !applicationId) return;
    if (!window.confirm('Finalization locks this assessment package for downstream comparison. It does not make a hiring decision.')) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const response = await employerApi.createHiringAssessmentFinalization(organizationId, applicationId);
      setFinalization(response.data.finalization);
    } catch (err: any) {
      setFinalizeError(err.message || 'Failed to finalize assessment package');
    } finally {
      setFinalizing(false);
    }
  };

  const fetchTimeline = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const response = await employerApi.getApplicationTimeline(organizationId, applicationId);
      setTimeline(response.data);
    } catch (err: any) {
      setTimelineError(err.message || 'Failed to load application timeline');
    } finally {
      setTimelineLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchTimeline();
    }
  }, [isSyncing, activeOrganization, canView, fetchTimeline]);

  const fetchDecisions = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setDecisionsLoading(true);
    setDecisionsError(null);
    try {
      const response = await employerApi.getEmployerJobApplicationDecisions(organizationId, applicationId);
      setDecisions(response.data.decisions);
    } catch (err: any) {
      setDecisionsError(err.message || 'Failed to load decision log');
    } finally {
      setDecisionsLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchDecisions();
    }
  }, [isSyncing, activeOrganization, canView, fetchDecisions]);

  const handleRecordDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !applicationId) return;
    setSavingDecision(true);
    setSaveDecisionError(null);
    try {
      await employerApi.createEmployerJobApplicationDecision(organizationId, applicationId, {
        decisionType: decisionTypeInput,
        reasonCode: reasonCodeInput,
        notes: decisionNotesInput.trim() || undefined,
      });
      setDecisionNotesInput('');
      setShowDecisionForm(false);
      await Promise.all([fetchDecisions(), fetchTimeline()]);
    } catch (err: any) {
      setSaveDecisionError(err.message || 'Failed to record decision');
    } finally {
      setSavingDecision(false);
    }
  };

  const fetchNotes = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setNotesLoading(true);
    setNotesError(null);
    try {
      const response = await employerApi.getEmployerJobApplicationNotes(organizationId, applicationId);
      setInternalNotes(response.data.notes);
    } catch (err: any) {
      setNotesError(err.message || 'Failed to load notes');
    } finally {
      setNotesLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchNotes();
    }
  }, [isSyncing, activeOrganization, canView, fetchNotes]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !applicationId || !newNoteBody.trim()) return;
    setSavingNote(true);
    setSaveNoteError(null);
    try {
      await employerApi.createEmployerJobApplicationNote(
        organizationId,
        applicationId,
        newNoteBody.trim(),
        newNoteMentionIds.length > 0 ? newNoteMentionIds : undefined
      );
      setNewNoteBody('');
      setNewNoteMentionIds([]);
      await Promise.all([fetchNotes(), fetchTimeline()]);
    } catch (err: any) {
      setSaveNoteError(err.message || 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  const toggleNoteMention = (membershipId: string) => {
    setNewNoteMentionIds((prev) =>
      prev.includes(membershipId)
        ? prev.filter((id) => id !== membershipId)
        : prev.length < 10
        ? [...prev, membershipId]
        : prev
    );
  };

  const fetchCollaborators = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setCollaboratorsLoading(true);
    setCollaboratorsError(null);
    try {
      const response = await employerApi.getEmployerJobApplicationCollaborators(organizationId, applicationId);
      setCollaborators(response.data.collaborators);
      setAvailableMembers(response.data.availableMembers);
    } catch (err: any) {
      setCollaboratorsError(err.message || 'Failed to load collaborators');
    } finally {
      setCollaboratorsLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchCollaborators();
    }
  }, [isSyncing, activeOrganization, canView, fetchCollaborators]);

  const handleAssignCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !applicationId || !newCollaboratorMembershipId) return;
    setSavingCollaborator(true);
    setSaveCollaboratorError(null);
    try {
      await employerApi.assignEmployerJobApplicationCollaborator(
        organizationId,
        applicationId,
        newCollaboratorMembershipId,
        newCollaboratorRole
      );
      setNewCollaboratorMembershipId('');
      await fetchCollaborators();
    } catch (err: any) {
      setSaveCollaboratorError(err.message || 'Failed to assign collaborator');
    } finally {
      setSavingCollaborator(false);
    }
  };

  const handleRemoveCollaborator = async (membershipId: string) => {
    if (!organizationId || !applicationId) return;
    setRemovingCollaboratorId(membershipId);
    setSaveCollaboratorError(null);
    try {
      await employerApi.removeEmployerJobApplicationCollaborator(organizationId, applicationId, membershipId);
      await fetchCollaborators();
    } catch (err: any) {
      setSaveCollaboratorError(err.message || 'Failed to remove collaborator');
    } finally {
      setRemovingCollaboratorId(null);
    }
  };

  const fetchCommunications = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setCommunicationsLoading(true);
    setCommunicationsError(null);
    try {
      const response = await employerApi.getEmployerCandidateCommunications(organizationId, applicationId);
      setCommunications(response.data.communications);
    } catch (err: any) {
      setCommunicationsError(err.message || 'Failed to load communication history');
    } finally {
      setCommunicationsLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchCommunications();
    }
  }, [isSyncing, activeOrganization, canView, fetchCommunications]);

  const handleLogCommunication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !applicationId || !commSummary.trim()) return;
    setSavingCommunication(true);
    setSaveCommunicationError(null);
    try {
      await employerApi.createEmployerCandidateCommunication(organizationId, applicationId, {
        direction: commDirection,
        channel: commChannel,
        communicationType: commType,
        subject: commSubject.trim() || undefined,
        summary: commSummary.trim(),
        occurredAt: commOccurredAt ? new Date(commOccurredAt).toISOString() : undefined,
      });
      setCommSubject('');
      setCommSummary('');
      setCommOccurredAt('');
      setShowCommunicationForm(false);
      await Promise.all([fetchCommunications(), fetchTimeline()]);
    } catch (err: any) {
      setSaveCommunicationError(err.message || 'Failed to record communication');
    } finally {
      setSavingCommunication(false);
    }
  };

  const fetchSkillGraph = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setSkillGraphLoading(true);
    setSkillGraphError(null);
    try {
      const response = await employerApi.getEmployerApplicationSkillGraph(organizationId, applicationId);
      setSkillGraph(response.data);
    } catch (err: any) {
      setSkillGraphError(err.message || 'Failed to load skill graph');
    } finally {
      setSkillGraphLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchSkillGraph();
    }
  }, [isSyncing, activeOrganization, canView, fetchSkillGraph]);

  const handleBuildSkillGraph = async () => {
    if (!organizationId || !applicationId) return;
    setBuildingSkillGraph(true);
    setBuildSkillGraphError(null);
    try {
      const response = await employerApi.buildEmployerApplicationSkillGraph(organizationId, applicationId);
      setSkillGraph(response.data);
    } catch (err: any) {
      setBuildSkillGraphError(err.message || 'Failed to build skill graph');
    } finally {
      setBuildingSkillGraph(false);
    }
  };

  const fetchSkillIntelligence = useCallback(async () => {
    if (!organizationId || !applicationId) return;
    setSkillIntelligenceLoading(true);
    setSkillIntelligenceError(null);
    try {
      const response = await employerApi.getEmployerApplicationSkillIntelligence(organizationId, applicationId);
      setSkillIntelligence(response.data);
    } catch (err: any) {
      setSkillIntelligenceError(err.message || 'Failed to load skill evidence intelligence');
    } finally {
      setSkillIntelligenceLoading(false);
    }
  }, [organizationId, applicationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchSkillIntelligence();
    }
  }, [isSyncing, activeOrganization, canView, fetchSkillIntelligence]);

  const handleBuildSkillIntelligence = async () => {
    if (!organizationId || !applicationId) return;
    setBuildingSkillIntelligence(true);
    setBuildSkillIntelligenceError(null);
    try {
      const response = await employerApi.buildEmployerApplicationSkillIntelligence(organizationId, applicationId);
      setSkillIntelligence(response.data);
    } catch (err: any) {
      setBuildSkillIntelligenceError(err.message || 'Failed to build skill evidence intelligence');
    } finally {
      setBuildingSkillIntelligence(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !applicationId) return;
    setCreatingInvitation(true);
    setCreateInvitationError(null);
    try {
      const days = expiresInDaysInput ? Number(expiresInDaysInput) : undefined;
      const response = await employerApi.createEmployerInterviewInvitation(organizationId, applicationId, {
        expiresInDays: days,
        message: invitationMessageInput.trim() || undefined,
      });
      setInvitation(response.data.invitation);
      setRawInvitationToken(response.data.token);
      setLinkCopied(false);
    } catch (err: any) {
      setCreateInvitationError(err.message || 'Failed to create interview invitation');
    } finally {
      setCreatingInvitation(false);
    }
  };

  const handleRegenerateInvitation = async () => {
    if (!organizationId || !applicationId) return;
    if (!window.confirm('Regenerate the interview invitation? The previous link will no longer work.')) return;
    setRegeneratingInvitation(true);
    setRegenerateInvitationError(null);
    try {
      const response = await employerApi.regenerateEmployerInterviewInvitation(organizationId, applicationId);
      setInvitation(response.data.invitation);
      setRawInvitationToken(response.data.token);
      setLinkCopied(false);
    } catch (err: any) {
      setRegenerateInvitationError(err.message || 'Failed to regenerate interview invitation');
    } finally {
      setRegeneratingInvitation(false);
    }
  };

  const handleRevokeInvitation = async () => {
    if (!organizationId || !applicationId) return;
    if (!window.confirm('Revoke this interview invitation? The candidate will no longer be able to use it.')) return;
    setRevokingInvitation(true);
    setRevokeInvitationError(null);
    try {
      const response = await employerApi.revokeEmployerInterviewInvitation(organizationId, applicationId);
      setInvitation(response.data.invitation);
      setRawInvitationToken(null);
    } catch (err: any) {
      setRevokeInvitationError(err.message || 'Failed to revoke interview invitation');
    } finally {
      setRevokingInvitation(false);
    }
  };

  const handleCopyInvitationLink = async () => {
    if (!rawInvitationToken) return;
    const link = `${window.location.origin}/candidate/interview-invite/${rawInvitationToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the token remains visible in the input for manual copy.
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

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <ListChecks size={18} className="text-mentor-text-muted" />
                Interview Evaluation Rubric
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                This rubric guides interviewer evaluation; it is not a candidate score yet.
              </p>

              {!blueprint || blueprint.status !== 'completed' ? (
                <p className="text-sm text-mentor-text-secondary py-2">Generate Interview Blueprint first.</p>
              ) : rubricLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : rubricError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{rubricError}</p>
                  <button onClick={fetchRubric} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {generateRubricError && (
                    <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
                      <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                      <p className="text-sm text-mentor-error">{generateRubricError}</p>
                    </div>
                  )}

                  {!rubric ? (
                    <div className="py-2">
                      <p className="text-sm text-mentor-text-secondary mb-3">No evaluation rubric generated yet.</p>
                      {canEdit && (
                        <button onClick={handleGenerateRubric} disabled={generatingRubric} className="btn btn-primary">
                          <ListChecks size={16} />
                          {generatingRubric ? 'Generating...' : 'Generate Evaluation Rubric'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <RubricView rubric={rubric.rubric} />
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <Send size={18} className="text-mentor-text-muted" />
                Interview Invitation
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                Creates a secure interview link for the candidate. No email is sent yet — share the link manually.
              </p>

              {application.status !== 'shortlisted' ? (
                <p className="text-sm text-mentor-text-secondary py-2">Shortlist candidate first.</p>
              ) : !blueprint || blueprint.status !== 'completed' ? (
                <p className="text-sm text-mentor-text-secondary py-2">Generate Interview Blueprint first.</p>
              ) : !rubric ? (
                <p className="text-sm text-mentor-text-secondary py-2">Generate Evaluation Rubric first.</p>
              ) : invitationLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : invitationError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{invitationError}</p>
                  <button onClick={fetchInvitation} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : (
                <>
                  {rawInvitationToken && (
                    <div className="surface-muted p-4 mb-4">
                      <p className="label mb-2">Invitation Link — copy now, shown only once</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/candidate/interview-invite/${rawInvitationToken}`}
                          onFocus={(e) => e.target.select()}
                          className="input flex-1 text-xs"
                        />
                        <button onClick={handleCopyInvitationLink} className="btn btn-secondary shrink-0">
                          {linkCopied ? 'Copied!' : 'Copy Link'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!invitation ? (
                    <form onSubmit={handleCreateInvitation} className="space-y-3">
                      {createInvitationError && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                          <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-error">{createInvitationError}</p>
                        </div>
                      )}
                      <div className="sm:w-1/3">
                        <label className="label">Expiry (days)</label>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={expiresInDaysInput}
                          onChange={(e) => setExpiresInDaysInput(e.target.value)}
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="label">Message (optional)</label>
                        <textarea
                          value={invitationMessageInput}
                          onChange={(e) => setInvitationMessageInput(e.target.value)}
                          className="input"
                          rows={2}
                          maxLength={1000}
                        />
                      </div>
                      {canEdit && (
                        <button type="submit" disabled={creatingInvitation} className="btn btn-primary">
                          <Send size={16} />
                          {creatingInvitation ? 'Creating...' : 'Create Invitation'}
                        </button>
                      )}
                    </form>
                  ) : (
                    <div className="space-y-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <dt className="text-xs font-medium text-mentor-text-muted mb-1">Status</dt>
                          <dd>
                            <span className={`badge ${INVITATION_STATUS_BADGE[invitation.status]}`}>
                              {INVITATION_STATUS_LABELS[invitation.status]}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-mentor-text-muted mb-1">Candidate Email</dt>
                          <dd className="text-sm text-mentor-text">{invitation.invitedEmail}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-mentor-text-muted mb-1">Expires</dt>
                          <dd className="text-sm text-mentor-text">{formatDateTime(invitation.expiresAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-mentor-text-muted mb-1">Created</dt>
                          <dd className="text-sm text-mentor-text">{formatDateTime(invitation.createdAt)}</dd>
                        </div>
                      </dl>

                      {revokeInvitationError && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                          <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-error">{revokeInvitationError}</p>
                        </div>
                      )}
                      {regenerateInvitationError && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                          <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-error">{regenerateInvitationError}</p>
                        </div>
                      )}

                      {invitation.status === 'active' && (
                        <div>
                          {!rawInvitationToken && (
                            <p className="text-xs text-mentor-text-muted mb-2">
                              The invitation link was only shown at creation time and cannot be re-displayed for security reasons.
                              Regenerate to issue a new link (this invalidates the current one).
                            </p>
                          )}
                          {canEdit && (
                            <button onClick={handleRevokeInvitation} disabled={revokingInvitation} className="btn btn-secondary">
                              {revokingInvitation ? 'Revoking...' : 'Revoke'}
                            </button>
                          )}
                        </div>
                      )}
                      {(invitation.status === 'expired' || invitation.status === 'revoked') && canEdit && (
                        <button onClick={handleRegenerateInvitation} disabled={regeneratingInvitation} className="btn btn-primary">
                          {regeneratingInvitation ? 'Regenerating...' : 'Regenerate Invitation'}
                        </button>
                      )}
                      {invitation.status === 'accepted' && (
                        <p className="text-xs text-mentor-text-muted">This invitation has been accepted and is now read-only.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <MonitorPlay size={18} className="text-mentor-text-muted" />
                Interview Session
              </h2>

              {interviewSessionLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : interviewSessionError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{interviewSessionError}</p>
                  <button onClick={fetchInterviewSession} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : interviewSession ? (
                <>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <dt className="text-xs font-medium text-mentor-text-muted mb-1">Session ID</dt>
                      <dd className="text-sm text-mentor-text font-mono">{interviewSession.id}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-mentor-text-muted mb-1">Status</dt>
                      <dd className="text-sm text-mentor-text capitalize">{interviewSession.status}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-mentor-text-muted mb-1">Created</dt>
                      <dd className="text-sm text-mentor-text">{formatDateTime(interviewSession.createdAt)}</dd>
                    </div>
                    {interviewSession.completedAt && (
                      <div>
                        <dt className="text-xs font-medium text-mentor-text-muted mb-1">Completed</dt>
                        <dd className="text-sm text-mentor-text">{formatDateTime(interviewSession.completedAt)}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-5 pt-5 border-t border-mentor-border">
                    <h3 className="text-sm font-medium text-mentor-text mb-1">Organization Knowledge</h3>
                    <p className="text-xs text-mentor-text-muted mb-3">
                      Optionally ground question/follow-up generation in your organization's indexed knowledge base
                      content. Disabled by default — the candidate never sees which (or whether) knowledge bases were
                      used.
                    </p>
                    {knowledgeConfigLoading ? (
                      <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                    ) : knowledgeConfigError ? (
                      <div>
                        <p className="text-sm text-mentor-error mb-2">{knowledgeConfigError}</p>
                        <button onClick={fetchKnowledgeConfig} className="btn btn-secondary">
                          Try Again
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm text-mentor-text">
                          <input
                            type="checkbox"
                            checked={kcEnabled}
                            disabled={!canManage}
                            onChange={(e) => setKcEnabled(e.target.checked)}
                          />
                          Use organization knowledge in this interview
                        </label>

                        {kcEnabled && (
                          <>
                            <div>
                              <p className="label mb-1.5">Knowledge Bases</p>
                              {availableKnowledgeBasesLoading ? (
                                <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                              ) : availableKnowledgeBases.length === 0 ? (
                                <p className="text-xs text-mentor-text-muted">No active knowledge bases in this organization yet.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {availableKnowledgeBases.map((kb) => {
                                    const summary = knowledgeConfig?.knowledgeBases.find((s) => s.knowledgeBaseId === kb.id);
                                    const checked = kcSelectedKbIds.includes(kb.id);
                                    return (
                                      <div key={kb.id}>
                                        <label className="flex items-center gap-2 text-sm text-mentor-text">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={!canManage}
                                            onChange={(e) =>
                                              setKcSelectedKbIds((prev) =>
                                                e.target.checked ? [...prev, kb.id] : prev.filter((id) => id !== kb.id)
                                              )
                                            }
                                          />
                                          {kb.name}
                                          <span className="text-xs text-mentor-text-muted">({kb.documentCount} doc{kb.documentCount === 1 ? '' : 's'})</span>
                                        </label>
                                        {checked && summary && !summary.hasIndexedContent && (
                                          <p className="text-xs text-mentor-warning ml-6">
                                            This knowledge base has no indexed content available for interview grounding.
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="max-w-[220px]">
                              <label className="label mb-1 block">Max retrieved chunks per generation</label>
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={kcMaxChunks}
                                disabled={!canManage}
                                onChange={(e) => setKcMaxChunks(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                                className="input"
                              />
                            </div>
                          </>
                        )}

                        {canManage && (
                          <div>
                            {saveKnowledgeConfigError && <p className="text-sm text-mentor-error mb-2">{saveKnowledgeConfigError}</p>}
                            <button onClick={handleSaveKnowledgeConfig} disabled={savingKnowledgeConfig} className="btn btn-primary px-3 py-1.5 text-xs">
                              {savingKnowledgeConfig ? 'Saving...' : 'Save Knowledge Configuration'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-5 border-t border-mentor-border">
                    <h3 className="text-sm font-medium text-mentor-text mb-3">Assessment Questions</h3>
                    {sessionQuestionsLoading ? (
                      <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                    ) : sessionQuestionsError ? (
                      <p className="text-sm text-mentor-error">{sessionQuestionsError}</p>
                    ) : sessionQuestions ? (
                      <div className="space-y-3">
                        <p className="text-sm text-mentor-text-secondary">
                          Materialization: <span className="capitalize font-medium text-mentor-text">{sessionQuestions.materializationStatus}</span>
                          {' · '}
                          {sessionQuestions.totalQuestions} question{sessionQuestions.totalQuestions === 1 ? '' : 's'}
                        </p>
                        {sessionQuestions.questions.length > 0 && (
                          <ul className="space-y-2">
                            {sessionQuestions.questions.slice(0, 5).map((q) => (
                              <li key={q.id} className="surface-muted p-3">
                                <p className="text-sm text-mentor-text">{q.question}</p>
                                <p className="text-xs text-mentor-text-muted mt-1 capitalize">
                                  {q.category || 'general'} &middot; {q.difficulty || 'n/a'}
                                  {q.competencyNames.length > 0 ? ` · ${q.competencyNames.join(', ')}` : ''}
                                </p>
                              </li>
                            ))}
                            {sessionQuestions.questions.length > 5 && (
                              <li className="text-xs text-mentor-text-muted">
                                +{sessionQuestions.questions.length - 5} more question{sessionQuestions.questions.length - 5 === 1 ? '' : 's'}
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-mentor-text-secondary">Not prepared yet.</p>
                    )}
                  </div>

                  {isSessionCompleted && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Employer Evaluation</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">Employer Evaluation — not visible to candidate.</p>

                      {sessionAnswersLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : sessionAnswersError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{sessionAnswersError}</p>
                          <button onClick={fetchSessionAnswers} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : sessionAnswers?.hiringEvaluationStatus === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Evaluating assessment...</p>
                      ) : sessionAnswers?.hiringEvaluationStatus === 'failed' ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">Evaluation failed.</p>
                          {evaluateError && <p className="text-sm text-mentor-error mb-2">{evaluateError}</p>}
                          <button onClick={handleEvaluateAssessment} disabled={evaluating} className="btn btn-secondary">
                            {evaluating ? 'Retrying...' : 'Retry'}
                          </button>
                        </div>
                      ) : sessionAnswers?.hiringEvaluationStatus === 'completed' ? (
                        <div className="space-y-3">
                          {sessionAnswers.questions.map((q) => (
                            <div key={q.id} className="surface-muted p-3">
                              <p className="text-sm text-mentor-text">{q.question}</p>
                              {q.answerText && <p className="text-sm text-mentor-text-secondary mt-1 whitespace-pre-wrap">{q.answerText}</p>}
                              {q.evaluation && (
                                <div className="mt-2 pt-2 border-t border-mentor-border space-y-1.5">
                                  <p className="text-xs font-medium text-mentor-text">
                                    Score: {q.evaluation.overallScore ?? 'n/a'} / 5
                                  </p>
                                  {q.evaluation.competencyScores.length > 0 && (
                                    <ul className="text-xs text-mentor-text-secondary space-y-0.5">
                                      {q.evaluation.competencyScores.map((cs) => (
                                        <li key={cs.competencyName}>
                                          {cs.competencyName}: {cs.score}/5
                                          {cs.evidence.length > 0 ? ` — ${cs.evidence.join('; ')}` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  {q.evaluation.strengths.length > 0 && (
                                    <p className="text-xs text-mentor-success">Strengths: {q.evaluation.strengths.join('; ')}</p>
                                  )}
                                  {q.evaluation.concerns.length > 0 && (
                                    <p className="text-xs text-mentor-warning">Concerns: {q.evaluation.concerns.join('; ')}</p>
                                  )}
                                  {q.evaluation.evidenceSummary && (
                                    <p className="text-xs text-mentor-text-muted">{q.evaluation.evidenceSummary}</p>
                                  )}
                                </div>
                              )}

                              {q.evaluation && (
                                <div className="mt-3 pt-3 border-t border-mentor-border">
                                  <p className="text-xs font-medium text-mentor-text mb-1">Reasoning Evidence</p>
                                  <p className="text-[11px] text-mentor-text-muted mb-2">
                                    Reasoning Evidence describes observable characteristics of this answer. It does not reveal
                                    private thought processes or measure intelligence.
                                  </p>

                                  {reasoningLoadingByQuestion[q.id] ? (
                                    <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                  ) : !reasoningSignalsByQuestion[q.id] || !reasoningSignalsByQuestion[q.id].generated ? (
                                    reasoningSignalsByQuestion[q.id]?.status === 'processing' ? (
                                      <p className="text-xs text-mentor-text-secondary">Analyzing reasoning evidence...</p>
                                    ) : (
                                      <div>
                                        {(reasoningSignalsByQuestion[q.id]?.status === 'failed' ||
                                          reasoningErrorByQuestion[q.id]) && (
                                          <p className="text-xs text-mentor-error mb-1">
                                            {reasoningSignalsByQuestion[q.id]?.errorMessage ||
                                              reasoningErrorByQuestion[q.id] ||
                                              'Reasoning evidence generation failed.'}
                                          </p>
                                        )}
                                        {canManage && (
                                          <button
                                            onClick={() => handleGenerateReasoningSignals(q.id)}
                                            disabled={reasoningGeneratingByQuestion[q.id]}
                                            className="btn btn-secondary px-2 py-1 text-xs"
                                          >
                                            {reasoningGeneratingByQuestion[q.id]
                                              ? 'Analyzing...'
                                              : reasoningSignalsByQuestion[q.id]?.status === 'failed'
                                                ? 'Retry'
                                                : 'Analyze Reasoning Evidence'}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <div className="space-y-1.5">
                                      <span className="badge badge-neutral">
                                        {labelizeCode(reasoningSignalsByQuestion[q.id].overallReasoningEvidence)}
                                      </span>
                                      <ul className="space-y-1 mt-1.5">
                                        {(reasoningSignalsByQuestion[q.id].signals || []).map((s) => (
                                          <li key={s.type} className="text-xs text-mentor-text-secondary">
                                            <span className="font-medium text-mentor-text">{labelizeCode(s.type)}</span>
                                            {' — '}
                                            <span className="badge badge-neutral">{labelizeCode(s.level)}</span>
                                            {s.evidenceSummary && <span className="block text-mentor-text-muted">{s.evidenceSummary}</span>}
                                          </li>
                                        ))}
                                      </ul>
                                      {(reasoningSignalsByQuestion[q.id].limitations || []).length > 0 && (
                                        <p className="text-[11px] text-mentor-text-muted">
                                          Limitations: {(reasoningSignalsByQuestion[q.id].limitations || []).join('; ')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {q.evaluation && (
                                <div className="mt-3 pt-3 border-t border-mentor-border">
                                  <p className="text-xs font-medium text-mentor-text mb-1">Confidence &amp; Uncertainty</p>
                                  <p className="text-[11px] text-mentor-text-muted mb-2">
                                    Confidence Intelligence reflects how certainty and uncertainty are expressed in this answer.
                                    It is not lie detection, truth verification, or a personality assessment.
                                  </p>

                                  {confidenceLoadingByQuestion[q.id] ? (
                                    <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                  ) : !confidenceSignalsByQuestion[q.id] || !confidenceSignalsByQuestion[q.id].generated ? (
                                    confidenceSignalsByQuestion[q.id]?.status === 'processing' ? (
                                      <p className="text-xs text-mentor-text-secondary">Analyzing confidence intelligence...</p>
                                    ) : (
                                      <div>
                                        {(confidenceSignalsByQuestion[q.id]?.status === 'failed' ||
                                          confidenceErrorByQuestion[q.id]) && (
                                          <p className="text-xs text-mentor-error mb-1">
                                            {confidenceSignalsByQuestion[q.id]?.errorMessage ||
                                              confidenceErrorByQuestion[q.id] ||
                                              'Confidence intelligence generation failed.'}
                                          </p>
                                        )}
                                        {canManage && (
                                          <button
                                            onClick={() => handleGenerateConfidenceSignals(q.id)}
                                            disabled={confidenceGeneratingByQuestion[q.id]}
                                            className="btn btn-secondary px-2 py-1 text-xs"
                                          >
                                            {confidenceGeneratingByQuestion[q.id]
                                              ? 'Analyzing...'
                                              : confidenceSignalsByQuestion[q.id]?.status === 'failed'
                                                ? 'Retry'
                                                : 'Analyze Confidence & Uncertainty'}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <div className="space-y-1.5">
                                      <div className="flex flex-wrap gap-1.5">
                                        <span className="badge badge-neutral">
                                          Expression: {labelizeCode(confidenceSignalsByQuestion[q.id].expressionConfidence)}
                                        </span>
                                        <span className="badge badge-neutral">
                                          Uncertainty Awareness: {labelizeCode(confidenceSignalsByQuestion[q.id].uncertaintyAwareness)}
                                        </span>
                                        <span className="badge badge-neutral">
                                          Calibration: {labelizeCode(confidenceSignalsByQuestion[q.id].calibration)}
                                        </span>
                                      </div>

                                      {(confidenceSignalsByQuestion[q.id].claims || []).length > 0 && (
                                        <div className="mt-1.5">
                                          <p className="text-[11px] font-medium text-mentor-text-muted mb-1">Observed Claims</p>
                                          <ul className="space-y-1">
                                            {(confidenceSignalsByQuestion[q.id].claims || []).map((c, idx) => (
                                              <li key={idx} className="text-xs text-mentor-text-secondary">
                                                {c.claimSummary}
                                                <span className="block text-mentor-text-muted">
                                                  {labelizeCode(c.confidenceExpression)} confidence &middot; {labelizeCode(c.supportLevel)}
                                                  &middot; Uncertainty acknowledged: {c.uncertaintyAcknowledged ? 'Yes' : 'No'}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}

                                      {(confidenceSignalsByQuestion[q.id].strengths || []).length > 0 && (
                                        <p className="text-xs text-mentor-success">
                                          Strengths: {(confidenceSignalsByQuestion[q.id].strengths || []).join('; ')}
                                        </p>
                                      )}
                                      {(confidenceSignalsByQuestion[q.id].concerns || []).length > 0 && (
                                        <p className="text-xs text-mentor-warning">
                                          Concerns: {(confidenceSignalsByQuestion[q.id].concerns || []).join('; ')}
                                        </p>
                                      )}
                                      {(confidenceSignalsByQuestion[q.id].limitations || []).length > 0 && (
                                        <p className="text-[11px] text-mentor-text-muted">
                                          Limitations: {(confidenceSignalsByQuestion[q.id].limitations || []).join('; ')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {q.evaluation && (
                                <div className="mt-3 pt-3 border-t border-mentor-border">
                                  <p className="text-xs font-medium text-mentor-text mb-1">Dynamic Follow-up</p>
                                  <p className="text-[11px] text-mentor-text-muted mb-2">
                                    Dynamic follow-ups collect additional assessment evidence. They do not provide coaching or
                                    hints to the candidate.
                                  </p>

                                  {followUpRouteLoadingByQuestion[q.id] ? (
                                    <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                  ) : !followUpRouteByQuestion[q.id] || !followUpRouteByQuestion[q.id].generated ? (
                                    followUpRouteByQuestion[q.id]?.status === 'processing' ? (
                                      <p className="text-xs text-mentor-text-secondary">Analyzing follow-up need...</p>
                                    ) : (
                                      <div>
                                        {(followUpRouteByQuestion[q.id]?.status === 'failed' || followUpRouteErrorByQuestion[q.id]) && (
                                          <p className="text-xs text-mentor-error mb-1">
                                            {followUpRouteByQuestion[q.id]?.errorMessage ||
                                              followUpRouteErrorByQuestion[q.id] ||
                                              'Follow-up routing failed.'}
                                          </p>
                                        )}
                                        {!followUpRouteByQuestion[q.id] && !followUpRouteErrorByQuestion[q.id] && (
                                          <p className="text-xs text-mentor-text-muted mb-1">Not analyzed</p>
                                        )}
                                        {canManage && (
                                          <button
                                            onClick={() => handleGenerateFollowUpRoute(q.id)}
                                            disabled={followUpRouteGeneratingByQuestion[q.id]}
                                            className="btn btn-secondary px-2 py-1 text-xs"
                                          >
                                            {followUpRouteGeneratingByQuestion[q.id]
                                              ? 'Analyzing...'
                                              : followUpRouteByQuestion[q.id]?.status === 'failed'
                                                ? 'Retry'
                                                : 'Evaluate Follow-up Need'}
                                          </button>
                                        )}
                                      </div>
                                    )
                                  ) : followUpRouteByQuestion[q.id].decision === 'continue' ? (
                                    <span className="badge badge-success">Continue — sufficient evidence</span>
                                  ) : (
                                    <div className="space-y-1">
                                      <span className="badge badge-warning">Follow-up generated</span>
                                      <p className="text-xs text-mentor-text-secondary">
                                        Reason: {labelizeCode(followUpRouteByQuestion[q.id].reasonType)} &middot; Target competency:{' '}
                                        {followUpRouteByQuestion[q.id].targetCompetencyName}
                                      </p>
                                      {followUpRouteByQuestion[q.id].generatedQuestionText && (
                                        <p className="text-xs text-mentor-text surface-muted p-2">
                                          Q{(followUpRouteByQuestion[q.id].generatedQuestionIndex ?? 0) + 1}:{' '}
                                          {followUpRouteByQuestion[q.id].generatedQuestionText}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {q.answerText && (
                                <div className="mt-3 pt-3 border-t border-mentor-border">
                                  <p className="text-xs font-medium text-mentor-text mb-1">Organization Knowledge Alignment</p>
                                  <p className="text-[11px] text-mentor-text-muted mb-2">
                                    Optional, employer-internal check of whether this answer aligns with organization knowledge
                                    that was retrieved for this question. Not a truth detector and not a hiring recommendation.
                                  </p>

                                  {(() => {
                                    const entry = knowledgeEvaluationByQuestion[q.id];
                                    if (knowledgeEvaluationLoadingByQuestion[q.id] && !entry) {
                                      return <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />;
                                    }
                                    if (!entry || (!entry.evaluated && entry.available !== false)) {
                                      return (
                                        <div>
                                          {knowledgeEvaluationErrorByQuestion[q.id] && (
                                            <p className="text-xs text-mentor-error mb-1">{knowledgeEvaluationErrorByQuestion[q.id]}</p>
                                          )}
                                          <p className="text-xs text-mentor-text-muted mb-1">Not evaluated</p>
                                          {canManage && (
                                            <button
                                              onClick={() => handleGenerateKnowledgeEvaluation(q.id)}
                                              disabled={knowledgeEvaluationGeneratingByQuestion[q.id]}
                                              className="btn btn-secondary px-2 py-1 text-xs"
                                            >
                                              {knowledgeEvaluationGeneratingByQuestion[q.id]
                                                ? 'Evaluating...'
                                                : 'Evaluate Against Organization Knowledge'}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (entry.available === false) {
                                      return (
                                        <span className="badge badge-neutral">
                                          {entry.reason === 'no_retrievable_knowledge'
                                            ? 'No indexed knowledge available'
                                            : 'Knowledge grounding disabled'}
                                        </span>
                                      );
                                    }
                                    if (entry.status === 'processing') {
                                      return <p className="text-xs text-mentor-text-secondary">Evaluating against organization knowledge...</p>;
                                    }
                                    if (entry.status === 'failed') {
                                      return (
                                        <div>
                                          <p className="text-xs text-mentor-error mb-1">{entry.errorMessage || 'Knowledge alignment evaluation failed.'}</p>
                                          {canManage && (
                                            <button
                                              onClick={() => handleGenerateKnowledgeEvaluation(q.id)}
                                              disabled={knowledgeEvaluationGeneratingByQuestion[q.id]}
                                              className="btn btn-secondary px-2 py-1 text-xs"
                                            >
                                              {knowledgeEvaluationGeneratingByQuestion[q.id] ? 'Retrying...' : 'Retry'}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    }
                                    // completed
                                    const overall = entry.alignment?.overall;
                                    return (
                                      <div className="space-y-2">
                                        <span className={`badge ${KNOWLEDGE_ALIGNMENT_BADGE[overall || 'not_applicable']}`}>
                                          {KNOWLEDGE_ALIGNMENT_LABEL[overall || 'not_applicable']}
                                        </span>
                                        {overall && <p className="text-xs text-mentor-text-secondary">{KNOWLEDGE_ALIGNMENT_NOTE[overall]}</p>}
                                        {entry.summary && <p className="text-xs text-mentor-text-muted">{entry.summary}</p>}

                                        {(entry.alignment?.claims.length ?? 0) > 0 && (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="text-left text-mentor-text-muted border-b border-mentor-border">
                                                  <th className="py-1 pr-2">Claim</th>
                                                  <th className="py-1 pr-2">Alignment</th>
                                                  <th className="py-1 pr-2">Sources</th>
                                                  <th className="py-1 pr-2">Explanation</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {entry.alignment!.claims.map((c, i) => (
                                                  <tr key={i} className="border-b border-mentor-border last:border-0 align-top">
                                                    <td className="py-1.5 pr-2 text-mentor-text">{c.claim}</td>
                                                    <td className="py-1.5 pr-2">
                                                      <span className={`badge ${KNOWLEDGE_CLAIM_BADGE[c.status]}`}>{KNOWLEDGE_CLAIM_LABEL[c.status]}</span>
                                                    </td>
                                                    <td className="py-1.5 pr-2 text-mentor-text-secondary">
                                                      {c.evidenceSourceCount > 0 ? (
                                                        <span title={c.sources.map((s) => `${s.documentTitle} · chunk ${s.chunkIndex}`).join(', ')}>
                                                          {c.evidenceSourceCount} source{c.evidenceSourceCount === 1 ? '' : 's'}
                                                        </span>
                                                      ) : (
                                                        '—'
                                                      )}
                                                    </td>
                                                    <td className="py-1.5 pr-2 text-mentor-text-secondary max-w-[240px]">
                                                      {c.explanation || KNOWLEDGE_CLAIM_NOTE[c.status]}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}

                                        {entry.organizationKnowledgeSignals && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {entry.organizationKnowledgeSignals.demonstratesKnowledge && (
                                              <span className="badge badge-neutral">Demonstrates knowledge</span>
                                            )}
                                            {entry.organizationKnowledgeSignals.usesRelevantTerminology && (
                                              <span className="badge badge-neutral">Uses relevant terminology</span>
                                            )}
                                            {entry.organizationKnowledgeSignals.respectsKnownConstraints && (
                                              <span className="badge badge-neutral">Respects known constraints</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          {evaluateError && <p className="text-sm text-mentor-error mb-2">{evaluateError}</p>}
                          <button onClick={handleEvaluateAssessment} disabled={evaluating} className="btn btn-primary">
                            {evaluating ? 'Evaluating...' : 'Evaluate Assessment'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isSessionCompleted && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Interview Graph</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">
                        Deterministic structure of how this interview's competencies map to its materialized questions — no
                        AI, no dynamic follow-up generation, never changes a running interview.
                      </p>

                      {interviewGraphLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : interviewGraphError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{interviewGraphError}</p>
                          <button onClick={fetchInterviewGraph} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : !interviewGraph || !interviewGraph.built ? (
                        <div>
                          <p className="text-sm text-mentor-text-secondary mb-3">
                            Graph not built yet. It deterministically maps the interview's blueprint/rubric competencies to
                            its materialized questions.
                          </p>
                          {canManage && (
                            <>
                              {buildInterviewGraphError && (
                                <p className="text-sm text-mentor-error mb-2">{buildInterviewGraphError}</p>
                              )}
                              <button onClick={handleBuildInterviewGraph} disabled={buildingInterviewGraph} className="btn btn-primary">
                                {buildingInterviewGraph ? 'Building...' : 'Build Interview Graph'}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        (() => {
                          const summary = interviewGraph.summary!;
                          const nodes = interviewGraph.nodes || [];
                          const edges = interviewGraph.edges || [];
                          const uncovered = interviewGraph.uncoveredCompetencies || [];
                          const competencyNodes = nodes.filter((n) => n.type === 'competency');
                          const questionNodes = nodes.filter((n) => n.type === 'question');

                          return (
                            <div className="space-y-4">
                              {canManage && (
                                <div>
                                  {buildInterviewGraphError && (
                                    <p className="text-sm text-mentor-error mb-2">{buildInterviewGraphError}</p>
                                  )}
                                  <button onClick={handleBuildInterviewGraph} disabled={buildingInterviewGraph} className="btn btn-secondary">
                                    {buildingInterviewGraph ? 'Rebuilding...' : 'Rebuild Interview Graph'}
                                  </button>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Competencies</p>
                                  <p className="text-lg font-semibold text-mentor-text">{summary.competencyNodeCount}</p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Questions</p>
                                  <p className="text-lg font-semibold text-mentor-text">{summary.questionNodeCount}</p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Connections</p>
                                  <p className="text-lg font-semibold text-mentor-text">{summary.edgeCount}</p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Covered Competencies</p>
                                  <p className="text-lg font-semibold text-mentor-success">{summary.coveredCompetencyCount}</p>
                                </div>
                              </div>

                              <div>
                                <p className="label mb-2">Competency Coverage</p>
                                {competencyNodes.length === 0 ? (
                                  <p className="text-xs text-mentor-text-muted">No competency nodes.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {competencyNodes.map((c) => {
                                      const questionIndexes = edges
                                        .filter((e) => e.type === 'competency_to_question' && e.fromNodeId === c.nodeId)
                                        .map((e) => questionNodes.find((q) => q.nodeId === e.toNodeId)?.questionIndex)
                                        .filter((idx): idx is number => typeof idx === 'number')
                                        .sort((a, b) => a - b);
                                      return (
                                        <li key={c.nodeId} className="surface-muted p-3">
                                          <p className="text-sm text-mentor-text">
                                            {c.label} <span className="text-xs text-mentor-text-muted capitalize">({c.metadata?.importance})</span>
                                          </p>
                                          {questionIndexes.length === 0 ? (
                                            <p className="text-xs text-mentor-warning mt-1">No connected questions</p>
                                          ) : (
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                              {questionIndexes.map((idx) => (
                                                <span key={idx} className="badge badge-neutral">
                                                  Q{idx + 1}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>

                              {uncovered.length > 0 && (
                                <div>
                                  <p className="label mb-2">Uncovered Competencies</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {uncovered.map((name) => (
                                      <span key={name} className="badge badge-warning">
                                        {name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}

                      <div className="mt-5 pt-5 border-t border-mentor-border">
                        <h3 className="text-sm font-medium text-mentor-text mb-1">Competency Coverage</h3>
                        <p className="text-xs text-mentor-text-muted mb-3">
                          Live overlay of how much assessment evidence has actually been collected for each competency — not
                          candidate score or performance.
                        </p>

                        {competencyCoverageLoading ? (
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                        ) : competencyCoverageError ? (
                          <div>
                            <p className="text-sm text-mentor-error mb-2">{competencyCoverageError}</p>
                            <button onClick={fetchCompetencyCoverage} className="btn btn-secondary">
                              Try Again
                            </button>
                          </div>
                        ) : !competencyCoverage || !competencyCoverage.built ? (
                          <div>
                            <p className="text-sm text-mentor-text-secondary mb-3">
                              Coverage not built yet. Requires the interview graph above to be built first.
                            </p>
                            {canManage && (
                              <>
                                {buildCompetencyCoverageError && (
                                  <p className="text-sm text-mentor-error mb-2">{buildCompetencyCoverageError}</p>
                                )}
                                <button
                                  onClick={handleBuildCompetencyCoverage}
                                  disabled={buildingCompetencyCoverage || !interviewGraph?.built}
                                  className="btn btn-primary"
                                >
                                  {buildingCompetencyCoverage ? 'Building...' : 'Build Competency Coverage'}
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          (() => {
                            const summary = competencyCoverage.summary!;
                            const competencies = competencyCoverage.competencies || [];
                            const evidenceStateBadge: Record<string, string> = {
                              covered: 'badge-success',
                              partial: 'badge-warning',
                              not_started: 'badge-neutral',
                            };
                            const evidenceStateLabel: Record<string, string> = {
                              covered: 'Covered',
                              partial: 'Partial',
                              not_started: 'Not Started',
                            };

                            return (
                              <div className="space-y-4">
                                {canManage && (
                                  <div>
                                    {buildCompetencyCoverageError && (
                                      <p className="text-sm text-mentor-error mb-2">{buildCompetencyCoverageError}</p>
                                    )}
                                    <button
                                      onClick={handleBuildCompetencyCoverage}
                                      disabled={buildingCompetencyCoverage}
                                      className="btn btn-secondary"
                                    >
                                      {buildingCompetencyCoverage ? 'Rebuilding...' : 'Rebuild Competency Coverage'}
                                    </button>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Covered</p>
                                    <p className="text-lg font-semibold text-mentor-success">{summary.coveredCount}</p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Partial</p>
                                    <p className="text-lg font-semibold text-mentor-warning">{summary.partialCount}</p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Not Started</p>
                                    <p className="text-lg font-semibold text-mentor-text">{summary.notStartedCount}</p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Coverage %</p>
                                    <p className="text-lg font-semibold text-mentor-text">{summary.coveragePercent}%</p>
                                  </div>
                                </div>

                                {competencies.length === 0 ? (
                                  <p className="text-xs text-mentor-text-muted">No competencies in graph.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {competencies.map((c) => (
                                      <li key={c.competencyNodeId} className="surface-muted p-3">
                                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                                          <p className="text-sm text-mentor-text">{c.competencyName}</p>
                                          <span className={`badge ${evidenceStateBadge[c.evidenceState] || 'badge-neutral'}`}>
                                            {evidenceStateLabel[c.evidenceState] || c.evidenceState}
                                          </span>
                                        </div>
                                        <p className="text-xs text-mentor-text-secondary mb-1.5">
                                          {c.plannedQuestionCount} planned &middot; {c.answeredQuestionCount} answered &middot;{' '}
                                          {c.evaluatedQuestionCount} evaluated
                                          {c.dynamicFollowUpCount > 0 &&
                                            ` · ${c.dynamicFollowUpCount} dynamic follow-up${c.dynamicFollowUpCount === 1 ? '' : 's'}`}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {c.questionIndexes.map((idx) => {
                                            const isEvaluatedQ = c.evaluatedQuestionIndexes.includes(idx);
                                            const isAnsweredQ = c.answeredQuestionIndexes.includes(idx);
                                            const isDynamic = (competencyCoverage.dynamicEdges || []).some(
                                              (e) => e.competencyNodeId === c.competencyNodeId && e.questionIndex === idx
                                            );
                                            const symbol = isEvaluatedQ ? '✓' : isAnsweredQ ? '●' : '○';
                                            const label = isEvaluatedQ ? 'Evaluated' : isAnsweredQ ? 'Answered' : 'Not answered';
                                            return (
                                              <span
                                                key={idx}
                                                className={`badge ${isEvaluatedQ ? 'badge-success' : isAnsweredQ ? 'badge-warning' : 'badge-neutral'}`}
                                                title={label}
                                              >
                                                Q{idx + 1} {symbol}
                                                {isDynamic && ' ↳ Dynamic'}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            );
                          })()
                        )}
                      </div>

                      <div className="mt-5 pt-5 border-t border-mentor-border">
                        <h3 className="text-sm font-medium text-mentor-text mb-1">Adaptive Interview Routing</h3>
                        <p className="text-xs text-mentor-text-muted mb-3">
                          Adaptive routing selects from existing assessment questions using competency coverage and existing
                          evaluation evidence. It does not generate a candidate score or hiring recommendation.
                        </p>

                        {adaptiveRoutesLoading ? (
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                        ) : adaptiveRoutesError ? (
                          <div>
                            <p className="text-sm text-mentor-error mb-2">{adaptiveRoutesError}</p>
                            <button onClick={fetchAdaptiveRoutes} className="btn btn-secondary">
                              Try Again
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {canManage && (
                              <div>
                                {selectAdaptiveRouteError && <p className="text-sm text-mentor-error mb-2">{selectAdaptiveRouteError}</p>}
                                <button onClick={handleSelectAdaptiveRoute} disabled={selectingAdaptiveRoute} className="btn btn-primary">
                                  {selectingAdaptiveRoute ? 'Selecting...' : 'Select Next Question'}
                                </button>
                              </div>
                            )}

                            {adaptiveRoutes.length === 0 ? (
                              <p className="text-sm text-mentor-text-secondary">No routing decisions yet.</p>
                            ) : (
                              (() => {
                                const latest = adaptiveRoutes[adaptiveRoutes.length - 1];
                                return (
                                  <div className="space-y-3">
                                    <div className="surface-muted p-3">
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="badge badge-info">{labelizeCode(latest.decision)}</span>
                                        {latest.reasonType && <span className="badge badge-neutral">{labelizeCode(latest.reasonType)}</span>}
                                      </div>
                                      {latest.decision === 'select_question' && (
                                        <p className="text-sm text-mentor-text">
                                          Next: Q{(latest.selectedQuestionIndex ?? 0) + 1}
                                          {latest.selectedCompetencyNames.length > 0 && ` · ${latest.selectedCompetencyNames.join(', ')}`}
                                          {latest.selectedDifficulty && ` · ${labelizeCode(latest.selectedDifficulty)}`}
                                        </p>
                                      )}
                                      <p className="text-xs text-mentor-text-muted mt-1">
                                        {latest.sourceQuestionIndex !== undefined && `From Q${latest.sourceQuestionIndex + 1} · `}
                                        {formatDateTime(latest.createdAt)}
                                      </p>
                                    </div>

                                    {adaptiveRoutes.length > 1 && (
                                      <div>
                                        <p className="label mb-2">Routing History</p>
                                        <ul className="space-y-1.5">
                                          {[...adaptiveRoutes].reverse().map((r) => (
                                            <li key={r.id} className="text-xs text-mentor-text-secondary">
                                              {formatDateTime(r.createdAt)} &middot; {labelizeCode(r.decision)}
                                              {r.decision === 'select_question' && ` → Q${(r.selectedQuestionIndex ?? 0) + 1}`}
                                              {r.reasonType && ` · ${labelizeCode(r.reasonType)}`}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-5 pt-5 border-t border-mentor-border">
                        <h3 className="text-sm font-medium text-mentor-text mb-1">Dynamic Interview Analytics</h3>
                        <p className="text-xs text-mentor-text-muted mb-3">
                          Deterministic routing analytics only — not a candidate performance score or hiring recommendation.
                        </p>

                        {graphAnalyticsLoading ? (
                          <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                        ) : graphAnalyticsError ? (
                          <div>
                            <p className="text-sm text-mentor-error mb-2">{graphAnalyticsError}</p>
                            <button onClick={fetchGraphAnalytics} className="btn btn-secondary">
                              Try Again
                            </button>
                          </div>
                        ) : !graphAnalytics || !graphAnalytics.built ? (
                          <div>
                            <p className="text-sm text-mentor-text-secondary mb-3">Analytics not built yet.</p>
                            {canManage && (
                              <>
                                {buildGraphAnalyticsError && <p className="text-sm text-mentor-error mb-2">{buildGraphAnalyticsError}</p>}
                                <button onClick={handleBuildGraphAnalytics} disabled={buildingGraphAnalytics} className="btn btn-primary">
                                  {buildingGraphAnalytics ? 'Building...' : 'Build Interview Analytics'}
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          (() => {
                            const g = graphAnalytics.graph!;
                            const exec = graphAnalytics.execution!;
                            const fu = graphAnalytics.followUps!;
                            const cov = graphAnalytics.coverage!;
                            const ar = graphAnalytics.adaptiveRouting!;
                            const diff = graphAnalytics.difficulty!;

                            return (
                              <div className="space-y-5">
                                {canManage && (
                                  <div>
                                    {buildGraphAnalyticsError && <p className="text-sm text-mentor-error mb-2">{buildGraphAnalyticsError}</p>}
                                    <button onClick={handleBuildGraphAnalytics} disabled={buildingGraphAnalytics} className="btn btn-secondary">
                                      {buildingGraphAnalytics ? 'Rebuilding...' : 'Rebuild Interview Analytics'}
                                    </button>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Competency Coverage</p>
                                    <p className="text-lg font-semibold text-mentor-text">
                                      {cov.available ? `${cov.coveragePercent}%` : 'N/A'}
                                    </p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Dynamic Follow-ups</p>
                                    <p className="text-lg font-semibold text-mentor-text">{g.dynamicFollowUpCount}</p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Adaptive Selections</p>
                                    <p className="text-lg font-semibold text-mentor-text">{ar.selectionCount}</p>
                                  </div>
                                  <div className="surface-muted p-3">
                                    <p className="text-xs text-mentor-text-muted">Questions Evaluated</p>
                                    <p className="text-lg font-semibold text-mentor-text">{exec.evaluatedQuestionCount}</p>
                                  </div>
                                </div>

                                <div>
                                  <p className="label mb-2">A. Graph Execution</p>
                                  <p className="text-xs text-mentor-text-secondary">
                                    Planned: {g.plannedQuestionCount} &middot; Current: {g.totalCurrentQuestionCount} &middot; Answered:{' '}
                                    {exec.answeredQuestionCount} &middot; Evaluated: {exec.evaluatedQuestionCount} &middot; Unanswered:{' '}
                                    {exec.unansweredQuestionCount}
                                  </p>
                                </div>

                                <div>
                                  <p className="label mb-2">B. Follow-up Routing</p>
                                  <p className="text-xs text-mentor-text-secondary">
                                    Analyzed: {fu.analyzedSourceQuestionCount} &middot; Generated: {fu.followUpGeneratedCount} &middot; Continue:{' '}
                                    {fu.continueDecisionCount} &middot; Follow-up Rate: {fu.followUpRatePercent}%
                                  </p>
                                </div>

                                <div>
                                  <p className="label mb-2">C. Coverage</p>
                                  {!cov.available ? (
                                    <p className="text-xs text-mentor-text-muted">Coverage not available.</p>
                                  ) : (
                                    <p className="text-xs text-mentor-text-secondary">
                                      Covered: {cov.coveredCount} &middot; Partial: {cov.partialCount} &middot; Not Started:{' '}
                                      {cov.notStartedCount}
                                    </p>
                                  )}
                                </div>

                                <div>
                                  <p className="label mb-2">D. Adaptive Routing</p>
                                  <p className="text-xs text-mentor-text-secondary">
                                    Uncovered competency: {ar.uncoveredCompetencySelections} &middot; Partial coverage:{' '}
                                    {ar.partialCoverageSelections} &middot; Follow-up priority: {ar.followUpPrioritySelections} &middot;
                                    Difficulty progression: {ar.difficultyProgressionSelections} &middot; Difficulty recovery:{' '}
                                    {ar.difficultyRecoverySelections} &middot; Remaining question: {ar.remainingQuestionSelections}
                                  </p>
                                </div>

                                <div>
                                  <p className="label mb-2">E. Difficulty Routing</p>
                                  <p className="text-xs text-mentor-text-secondary">
                                    Easy: {diff.selectedEasyCount} &middot; Medium: {diff.selectedMediumCount} &middot; Hard:{' '}
                                    {diff.selectedHardCount}
                                  </p>
                                  <p className="text-xs text-mentor-text-secondary mt-1">
                                    Transitions — easy→medium: {diff.transitions.easyToMedium} &middot; medium→hard:{' '}
                                    {diff.transitions.mediumToHard} &middot; hard→medium: {diff.transitions.hardToMedium} &middot;
                                    medium→easy: {diff.transitions.mediumToEasy} &middot; same: {diff.transitions.sameDifficulty} &middot;
                                    unknown: {diff.transitions.unknown}
                                  </p>
                                </div>
                              </div>
                            );
                          })()
                        )}
                      </div>
                    </div>
                  )}

                  {isEvaluated && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Employer Assessment Result</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">Employer Assessment Result — not visible to candidate.</p>

                      {assessmentResultLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : assessmentResultError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{assessmentResultError}</p>
                          <button onClick={fetchAssessmentResult} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : assessmentResult ? (
                        <div className="space-y-4">
                          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Overall Score</dt>
                              <dd className="text-sm text-mentor-text">{assessmentResult.result.overallScore} / 100</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Avg Rubric Score</dt>
                              <dd className="text-sm text-mentor-text">{assessmentResult.result.averageRubricScore} / 5</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Assessed JD Weight</dt>
                              <dd className="text-sm text-mentor-text">{assessmentResult.result.assessedWeight}%</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Competency Coverage</dt>
                              <dd className="text-sm text-mentor-text">{assessmentResult.result.competencyCoveragePercent}%</dd>
                            </div>
                          </dl>

                          {assessmentResult.result.competencies.length > 0 && (
                            <ul className="space-y-2">
                              {assessmentResult.result.competencies.map((c) => (
                                <li key={c.competencyName} className="surface-muted p-3">
                                  <p className="text-sm text-mentor-text">
                                    {c.competencyName} <span className="text-xs text-mentor-text-muted capitalize">({c.importance})</span>
                                  </p>
                                  <p className="text-xs text-mentor-text-secondary mt-1">
                                    JD Weight: {c.jdWeight}% &middot; Score: {c.score}/5 &middot; Questions: {c.questionCount}
                                  </p>
                                  {c.evidence.length > 0 && (
                                    <p className="text-xs text-mentor-success mt-1">Evidence: {c.evidence.join('; ')}</p>
                                  )}
                                  {c.missingEvidence.length > 0 && (
                                    <p className="text-xs text-mentor-warning mt-1">Missing: {c.missingEvidence.join('; ')}</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {assessmentResult.result.strengths.length > 0 && (
                            <p className="text-sm text-mentor-success">Strengths: {assessmentResult.result.strengths.join('; ')}</p>
                          )}
                          {assessmentResult.result.concerns.length > 0 && (
                            <p className="text-sm text-mentor-warning">Concerns: {assessmentResult.result.concerns.join('; ')}</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          {generateResultError && <p className="text-sm text-mentor-error mb-2">{generateResultError}</p>}
                          <button onClick={handleGenerateResult} disabled={generatingResult} className="btn btn-primary">
                            {generatingResult ? 'Generating...' : 'Generate Assessment Result'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isEvaluated && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Evidence Intelligence</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">Employer Evidence Analysis — not visible to candidate.</p>

                      {!assessmentResult ? (
                        <p className="text-sm text-mentor-text-secondary">Generate the assessment result first.</p>
                      ) : evidenceMatrixLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : evidenceMatrixError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{evidenceMatrixError}</p>
                          <button onClick={fetchEvidenceMatrix} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : evidenceMatrix ? (
                        <div className="space-y-4">
                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Strong</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.strongCount}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Sufficient</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.sufficientCount}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Partial</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.partialCount}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Insufficient</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.insufficientCount}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Needs Follow-up</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.followUpCompetencyCount}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Critical Follow-up</dt>
                              <dd className="text-sm text-mentor-text">{evidenceMatrix.matrix.summary.criticalFollowUpCount}</dd>
                            </div>
                          </dl>

                          <ul className="space-y-3">
                            {evidenceMatrix.matrix.competencies.map((c) => (
                              <li key={c.competencyName} className="surface-muted p-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <p className="text-sm text-mentor-text">
                                    {c.competencyName} <span className="text-xs text-mentor-text-muted capitalize">({c.importance})</span>
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="badge capitalize">{c.evidenceStatus}</span>
                                    {c.requiresFollowUp && <span className="badge">Follow-up required</span>}
                                  </div>
                                </div>
                                <p className="text-xs text-mentor-text-secondary mt-1">
                                  JD Weight: {c.jdWeight}% &middot; Score: {c.score}/5 &middot; Questions: {c.sourceQuestions.length}
                                </p>
                                {c.supportingEvidence.length > 0 && (
                                  <p className="text-xs text-mentor-success mt-1">Evidence: {c.supportingEvidence.join('; ')}</p>
                                )}
                                {c.missingEvidence.length > 0 && (
                                  <p className="text-xs text-mentor-warning mt-1">Missing: {c.missingEvidence.join('; ')}</p>
                                )}
                                {c.followUpReasons.length > 0 && (
                                  <p className="text-xs text-mentor-warning mt-1">Reasons: {c.followUpReasons.join('; ')}</p>
                                )}
                                {c.sourceQuestions.length > 0 && (
                                  <ul className="mt-2 pt-2 border-t border-mentor-border space-y-1">
                                    {c.sourceQuestions.map((sq) => (
                                      <li key={sq.questionIndex} className="text-xs text-mentor-text-muted">
                                        Q{sq.questionIndex + 1}: {sq.questionText} — {sq.rubricScore}/5
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div>
                          {generateEvidenceError && <p className="text-sm text-mentor-error mb-2">{generateEvidenceError}</p>}
                          <button onClick={handleGenerateEvidence} disabled={generatingEvidence} className="btn btn-primary">
                            {generatingEvidence ? 'Generating...' : 'Generate Evidence Analysis'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {evidenceMatrix && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Follow-up Questions</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">Employer Follow-up Plan — not visible to candidate.</p>

                      {!needsFollowUp ? (
                        <p className="text-sm text-mentor-text-secondary">No additional evidence follow-up is currently required.</p>
                      ) : followUpPlanLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : followUpPlanError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{followUpPlanError}</p>
                          <button onClick={fetchFollowUpPlan} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : followUpPlan?.status === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Generating follow-up questions...</p>
                      ) : followUpPlan?.status === 'failed' ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">Follow-up generation failed.</p>
                          {generateFollowUpError && <p className="text-sm text-mentor-error mb-2">{generateFollowUpError}</p>}
                          <button onClick={handleGenerateFollowUp} disabled={generatingFollowUp} className="btn btn-secondary">
                            {generatingFollowUp ? 'Retrying...' : 'Retry'}
                          </button>
                        </div>
                      ) : followUpPlan?.status === 'completed' && followUpPlan.plan ? (
                        <div className="space-y-3">
                          {followUpPlan.plan.competencies.length === 0 ? (
                            <p className="text-sm text-mentor-text-secondary">No additional evidence follow-up is currently required.</p>
                          ) : (
                            followUpPlan.plan.competencies.map((c) => (
                              <div key={c.competencyName} className="surface-muted p-3">
                                <p className="text-sm text-mentor-text">
                                  {c.competencyName} <span className="text-xs text-mentor-text-muted capitalize">({c.importance})</span>
                                </p>
                                <p className="text-xs text-mentor-text-secondary mt-1">
                                  Current score: {c.currentScore}/5 &middot; {c.evidenceStatus}
                                </p>
                                {c.reasons.length > 0 && (
                                  <p className="text-xs text-mentor-warning mt-1">Reasons: {c.reasons.join('; ')}</p>
                                )}
                                <ul className="mt-2 pt-2 border-t border-mentor-border space-y-2">
                                  {c.questions.map((q, idx) => (
                                    <li key={idx}>
                                      <p className="text-sm text-mentor-text">{q.question}</p>
                                      <p className="text-xs text-mentor-text-muted mt-0.5">
                                        Objective: {q.objective} &middot; Difficulty: {q.difficulty}
                                      </p>
                                      {q.evidenceToValidate.length > 0 && (
                                        <p className="text-xs text-mentor-text-muted mt-0.5">
                                          Validates: {q.evidenceToValidate.join('; ')}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div>
                          {generateFollowUpError && <p className="text-sm text-mentor-error mb-2">{generateFollowUpError}</p>}
                          <button onClick={handleGenerateFollowUp} disabled={generatingFollowUp} className="btn btn-primary">
                            {generatingFollowUp ? 'Generating...' : 'Generate Follow-up Questions'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isEvaluated && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Answer Consistency</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">
                        Consistency analysis compares observable statements across this assessment. It is not lie detection or
                        an honesty judgment.
                      </p>

                      {consistencyLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : !assessmentConsistency || !assessmentConsistency.generated ? (
                        assessmentConsistency?.status === 'processing' ? (
                          <p className="text-sm text-mentor-text-secondary">Analyzing answer consistency...</p>
                        ) : (
                          <div>
                            {(assessmentConsistency?.status === 'failed' || consistencyError) && (
                              <p className="text-sm text-mentor-error mb-2">
                                {assessmentConsistency?.errorMessage || consistencyError || 'Consistency analysis failed.'}
                              </p>
                            )}
                            {canManage && (
                              <button onClick={handleGenerateConsistency} disabled={generatingConsistency} className="btn btn-primary">
                                {generatingConsistency
                                  ? 'Analyzing...'
                                  : assessmentConsistency?.status === 'failed'
                                    ? 'Retry'
                                    : 'Analyze Answer Consistency'}
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-neutral">{labelizeCode(assessmentConsistency.overallConsistency)}</span>
                            <span className="text-xs text-mentor-text-muted">
                              {(assessmentConsistency.findings || []).length} finding
                              {(assessmentConsistency.findings || []).length === 1 ? '' : 's'}
                            </span>
                          </div>

                          {(assessmentConsistency.findings || []).length === 0 ? (
                            <p className="text-xs text-mentor-text-muted">No consistency findings.</p>
                          ) : (
                            <ul className="space-y-2">
                              {(assessmentConsistency.findings || []).map((f, idx) => (
                                <li key={idx} className="surface-muted p-3">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="badge badge-warning">{labelizeCode(f.type)}</span>
                                    <span className="badge badge-neutral capitalize">{f.severity}</span>
                                    <span className="text-xs text-mentor-text-muted">
                                      Questions: {f.questionIndexes.map((i) => i + 1).join(', ')}
                                    </span>
                                  </div>
                                  <p className="text-sm text-mentor-text">{f.summary}</p>
                                  {f.evidence.length > 0 && (
                                    <ul className="mt-1.5 space-y-0.5">
                                      {f.evidence.map((e, eIdx) => (
                                        <li key={eIdx} className="text-xs text-mentor-text-muted">
                                          Q{e.questionIndex + 1}: {e.answerExcerptOrSummary}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {(assessmentConsistency.consistentThemes || []).length > 0 && (
                            <p className="text-xs text-mentor-success">
                              Consistent themes: {(assessmentConsistency.consistentThemes || []).join('; ')}
                            </p>
                          )}
                          {(assessmentConsistency.limitations || []).length > 0 && (
                            <p className="text-xs text-mentor-text-muted">
                              Limitations: {(assessmentConsistency.limitations || []).join('; ')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {isEvaluated && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Claim Evidence Alignment</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">
                        Claim Evidence Alignment compares assessment claims with structured evidence available inside
                        EnterSkill. Lack of supporting evidence does not mean a claim is false, and this is not external
                        background verification.
                      </p>

                      {claimVerificationLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : !claimVerification || !claimVerification.generated ? (
                        claimVerification?.status === 'processing' ? (
                          <p className="text-sm text-mentor-text-secondary">Analyzing claim evidence alignment...</p>
                        ) : (
                          <div>
                            {(claimVerification?.status === 'failed' || claimVerificationError) && (
                              <p className="text-sm text-mentor-error mb-2">
                                {claimVerification?.errorMessage || claimVerificationError || 'Claim evidence alignment failed.'}
                              </p>
                            )}
                            {canManage && (
                              <button
                                onClick={handleGenerateClaimVerification}
                                disabled={generatingClaimVerification}
                                className="btn btn-primary"
                              >
                                {generatingClaimVerification
                                  ? 'Analyzing...'
                                  : claimVerification?.status === 'failed'
                                    ? 'Retry'
                                    : 'Analyze Claim Evidence Alignment'}
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        (() => {
                          const alignmentBadge: Record<string, string> = {
                            supported: 'badge-success',
                            partially_supported: 'badge-success',
                            unsupported: 'badge-warning',
                            conflicting: 'badge-warning',
                            unverifiable: 'badge-neutral',
                          };
                          const alignmentLabel: Record<string, string> = {
                            supported: 'Supported',
                            partially_supported: 'Partially Supported',
                            unsupported: 'Unsupported by available evidence',
                            conflicting: 'Conflicts with available structured evidence',
                            unverifiable: 'Unable to verify with available evidence',
                          };
                          const summary = claimVerification.summary!;
                          const claims = claimVerification.claims || [];

                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                <div className="surface-muted p-2.5">
                                  <p className="text-xs text-mentor-text-muted">Supported</p>
                                  <p className="text-lg font-semibold text-mentor-success">{summary.supported}</p>
                                </div>
                                <div className="surface-muted p-2.5">
                                  <p className="text-xs text-mentor-text-muted">Partially Supported</p>
                                  <p className="text-lg font-semibold text-mentor-text">{summary.partiallySupported}</p>
                                </div>
                                <div className="surface-muted p-2.5">
                                  <p className="text-xs text-mentor-text-muted">Unsupported</p>
                                  <p className="text-lg font-semibold text-mentor-warning">{summary.unsupported}</p>
                                </div>
                                <div className="surface-muted p-2.5">
                                  <p className="text-xs text-mentor-text-muted">Conflicting</p>
                                  <p className="text-lg font-semibold text-mentor-warning">{summary.conflicting}</p>
                                </div>
                                <div className="surface-muted p-2.5">
                                  <p className="text-xs text-mentor-text-muted">Unverifiable</p>
                                  <p className="text-lg font-semibold text-mentor-text">{summary.unverifiable}</p>
                                </div>
                              </div>

                              {claims.length === 0 ? (
                                <p className="text-xs text-mentor-text-muted">No claims were extracted.</p>
                              ) : (
                                <ul className="space-y-2">
                                  {claims.map((c) => (
                                    <li key={c.claimId} className="surface-muted p-3">
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className={`badge ${alignmentBadge[c.alignment] || 'badge-neutral'}`}>
                                          {alignmentLabel[c.alignment] || c.alignment}
                                        </span>
                                        <span className="badge badge-neutral capitalize">{c.category}</span>
                                        <span className="text-xs text-mentor-text-muted">Q{c.questionIndex + 1}</span>
                                      </div>
                                      <p className="text-sm text-mentor-text">{c.claimSummary}</p>
                                      {c.evidenceSources.length > 0 && (
                                        <ul className="mt-1.5 space-y-0.5">
                                          {c.evidenceSources.map((s, sIdx) => (
                                            <li key={sIdx} className="text-xs text-mentor-text-muted">
                                              {labelizeCode(s.type)}: {s.evidenceSummary}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {c.limitation && <p className="text-xs text-mentor-text-muted mt-1">{c.limitation}</p>}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {(claimVerification.limitations || []).length > 0 && (
                                <p className="text-xs text-mentor-text-muted">
                                  Limitations: {(claimVerification.limitations || []).join('; ')}
                                </p>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {isEvaluated && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Reasoning &amp; Confidence Overview</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">
                        This overview summarizes observable evidence from the assessment. It does not measure intelligence,
                        personality, honesty, or private thought processes, and it is not a hiring recommendation.
                      </p>

                      {aggregateLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : aggregateError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{aggregateError}</p>
                          <button onClick={fetchReasoningConfidenceAggregate} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : !reasoningConfidenceAggregate || !reasoningConfidenceAggregate.built ? (
                        <div>
                          <p className="text-sm text-mentor-text-secondary mb-3">
                            Overview not built yet. It deterministically aggregates whatever reasoning evidence, confidence
                            intelligence, consistency analysis, and claim evidence alignment already exist for this
                            assessment — no AI call is made to build it.
                          </p>
                          {canManage && (
                            <>
                              {buildAggregateError && <p className="text-sm text-mentor-error mb-2">{buildAggregateError}</p>}
                              <button onClick={handleBuildAggregate} disabled={buildingAggregate} className="btn btn-primary">
                                {buildingAggregate ? 'Building...' : 'Build Overview'}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        (() => {
                          const reasoning = reasoningConfidenceAggregate.reasoning!;
                          const confidence = reasoningConfidenceAggregate.confidence!;
                          const consistency = reasoningConfidenceAggregate.consistency!;
                          const claimAlignment = reasoningConfidenceAggregate.claimAlignment!;
                          const coverage = reasoningConfidenceAggregate.coverage!;

                          const signalRows = Object.entries(reasoning.signalCounts) as Array<
                            [string, { strong: number; present: number; limited: number; notObserved: number }]
                          >;

                          return (
                            <div className="space-y-5">
                              {canManage && (
                                <div>
                                  {buildAggregateError && <p className="text-sm text-mentor-error mb-2">{buildAggregateError}</p>}
                                  <button onClick={handleBuildAggregate} disabled={buildingAggregate} className="btn btn-secondary">
                                    {buildingAggregate ? 'Rebuilding...' : 'Rebuild Overview'}
                                  </button>
                                </div>
                              )}

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Reasoning Coverage</p>
                                  <p className="text-lg font-semibold text-mentor-text">{coverage.reasoningCoveragePercent}%</p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Confidence Coverage</p>
                                  <p className="text-lg font-semibold text-mentor-text">{coverage.confidenceCoveragePercent}%</p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Consistency</p>
                                  <p className="text-sm font-semibold text-mentor-text">
                                    {consistency.available ? labelizeCode(consistency.overallConsistency) : 'Not available'}
                                  </p>
                                </div>
                                <div className="surface-muted p-3">
                                  <p className="text-xs text-mentor-text-muted">Claim Alignment</p>
                                  <p className="text-sm font-semibold text-mentor-text">
                                    {claimAlignment.available ? `${claimAlignment.totalClaims} claims` : 'Not available'}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <p className="label mb-2">A. Reasoning Evidence</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                  <div className="surface-muted p-2.5">
                                    <p className="text-[11px] text-mentor-text-muted">Strong</p>
                                    <p className="text-sm font-semibold text-mentor-success">{reasoning.strongAnswerCount}</p>
                                  </div>
                                  <div className="surface-muted p-2.5">
                                    <p className="text-[11px] text-mentor-text-muted">Sufficient</p>
                                    <p className="text-sm font-semibold text-mentor-text">{reasoning.sufficientAnswerCount}</p>
                                  </div>
                                  <div className="surface-muted p-2.5">
                                    <p className="text-[11px] text-mentor-text-muted">Limited</p>
                                    <p className="text-sm font-semibold text-mentor-warning">{reasoning.limitedAnswerCount}</p>
                                  </div>
                                  <div className="surface-muted p-2.5">
                                    <p className="text-[11px] text-mentor-text-muted">Insufficient</p>
                                    <p className="text-sm font-semibold text-mentor-warning">{reasoning.insufficientAnswerCount}</p>
                                  </div>
                                </div>
                                <ul className="space-y-1">
                                  {signalRows.map(([type, counts]) => (
                                    <li key={type} className="text-xs text-mentor-text-secondary">
                                      <span className="text-mentor-text">{labelizeCode(type)}:</span> strong {counts.strong} &middot;
                                      present {counts.present} &middot; limited {counts.limited} &middot; not observed{' '}
                                      {counts.notObserved}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div>
                                <p className="label mb-2">B. Confidence &amp; Uncertainty</p>
                                <p className="text-xs text-mentor-text-secondary">
                                  Expression confidence — high {confidence.expressionConfidenceCounts.high} &middot; moderate{' '}
                                  {confidence.expressionConfidenceCounts.moderate} &middot; low{' '}
                                  {confidence.expressionConfidenceCounts.low} &middot; mixed{' '}
                                  {confidence.expressionConfidenceCounts.mixed}
                                </p>
                                <p className="text-xs text-mentor-text-secondary">
                                  Uncertainty awareness — strong {confidence.uncertaintyAwarenessCounts.strong} &middot; present{' '}
                                  {confidence.uncertaintyAwarenessCounts.present} &middot; limited{' '}
                                  {confidence.uncertaintyAwarenessCounts.limited} &middot; not observed{' '}
                                  {confidence.uncertaintyAwarenessCounts.notObserved}
                                </p>
                                <p className="text-xs text-mentor-text-secondary">
                                  Calibration — well calibrated {confidence.calibrationCounts.wellCalibrated} &middot; possibly
                                  overconfident {confidence.calibrationCounts.possiblyOverconfident} &middot; possibly
                                  underconfident {confidence.calibrationCounts.possiblyUnderconfident} &middot; insufficient
                                  evidence {confidence.calibrationCounts.insufficientEvidence}
                                </p>
                              </div>

                              <div>
                                <p className="label mb-2">C. Consistency</p>
                                {!consistency.available ? (
                                  <p className="text-xs text-mentor-text-muted">Consistency analysis not available.</p>
                                ) : (
                                  <p className="text-xs text-mentor-text-secondary">
                                    {labelizeCode(consistency.overallConsistency)} &middot; {consistency.findingCount} finding
                                    {consistency.findingCount === 1 ? '' : 's'} (high {consistency.highSeverityFindingCount}
                                    &middot; medium {consistency.mediumSeverityFindingCount} &middot; low{' '}
                                    {consistency.lowSeverityFindingCount})
                                  </p>
                                )}
                              </div>

                              <div>
                                <p className="label mb-2">D. Claim Evidence Alignment</p>
                                {!claimAlignment.available ? (
                                  <p className="text-xs text-mentor-text-muted">Claim evidence alignment not available.</p>
                                ) : (
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                    <div className="surface-muted p-2.5">
                                      <p className="text-[11px] text-mentor-text-muted">Supported</p>
                                      <p className="text-sm font-semibold text-mentor-success">{claimAlignment.supported}</p>
                                    </div>
                                    <div className="surface-muted p-2.5">
                                      <p className="text-[11px] text-mentor-text-muted">Partially Supported</p>
                                      <p className="text-sm font-semibold text-mentor-text">{claimAlignment.partiallySupported}</p>
                                    </div>
                                    <div className="surface-muted p-2.5">
                                      <p className="text-[11px] text-mentor-text-muted">Unsupported</p>
                                      <p className="text-sm font-semibold text-mentor-warning">{claimAlignment.unsupported}</p>
                                    </div>
                                    <div className="surface-muted p-2.5">
                                      <p className="text-[11px] text-mentor-text-muted">Conflicting</p>
                                      <p className="text-sm font-semibold text-mentor-warning">{claimAlignment.conflicting}</p>
                                    </div>
                                    <div className="surface-muted p-2.5">
                                      <p className="text-[11px] text-mentor-text-muted">Unverifiable</p>
                                      <p className="text-sm font-semibold text-mentor-text">{claimAlignment.unverifiable}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {reportPrerequisitesReady && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Hiring Assessment Report</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">
                        Employer Hiring Assessment Report — not visible to candidate.
                      </p>

                      {hiringReportLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : hiringReportError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{hiringReportError}</p>
                          <button onClick={fetchHiringReport} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : hiringReport?.status === 'processing' ? (
                        <p className="text-sm text-mentor-text-secondary">Generating hiring report...</p>
                      ) : hiringReport?.status === 'failed' ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">Report generation failed.</p>
                          {generateReportError && <p className="text-sm text-mentor-error mb-2">{generateReportError}</p>}
                          <button onClick={handleGenerateReport} disabled={generatingReport} className="btn btn-secondary">
                            {generatingReport ? 'Retrying...' : 'Retry'}
                          </button>
                        </div>
                      ) : hiringReport?.status === 'completed' && hiringReport.report ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-sm text-mentor-text whitespace-pre-wrap flex-1">{hiringReport.report.executiveSummary}</p>
                            <button onClick={handleDownloadReport} disabled={downloadingReport} className="btn btn-secondary shrink-0">
                              {downloadingReport ? 'Downloading...' : 'Download Report'}
                            </button>
                          </div>
                          {downloadReportError && <p className="text-sm text-mentor-error">{downloadReportError}</p>}

                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Overall Score</dt>
                              <dd className="text-sm text-mentor-text">{hiringReport.report.overallScore} / 100</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Avg Rubric Score</dt>
                              <dd className="text-sm text-mentor-text">{hiringReport.report.averageRubricScore} / 5</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Competency Coverage</dt>
                              <dd className="text-sm text-mentor-text">{hiringReport.report.competencyCoveragePercent}%</dd>
                            </div>
                          </dl>

                          {hiringReport.report.competencySummary.length > 0 && (
                            <ul className="space-y-2">
                              {hiringReport.report.competencySummary.map((c) => (
                                <li key={c.competencyName} className="surface-muted p-3">
                                  <p className="text-sm text-mentor-text">
                                    {c.competencyName} <span className="text-xs text-mentor-text-muted capitalize">({c.importance})</span>
                                  </p>
                                  <p className="text-xs text-mentor-text-secondary mt-1 capitalize">
                                    Score: {c.score}/5 &middot; {c.evidenceStatus}
                                  </p>
                                  {c.summary && <p className="text-xs text-mentor-text-secondary mt-1">{c.summary}</p>}
                                </li>
                              ))}
                            </ul>
                          )}

                          {hiringReport.report.demonstratedStrengths.length > 0 && (
                            <p className="text-sm text-mentor-success">
                              Demonstrated Strengths: {hiringReport.report.demonstratedStrengths.join('; ')}
                            </p>
                          )}
                          {hiringReport.report.evidenceGaps.length > 0 && (
                            <p className="text-sm text-mentor-warning">Evidence Gaps: {hiringReport.report.evidenceGaps.join('; ')}</p>
                          )}
                          {hiringReport.report.followUpPriorities.length > 0 && (
                            <p className="text-sm text-mentor-text-secondary">
                              Follow-up Priorities: {hiringReport.report.followUpPriorities.join('; ')}
                            </p>
                          )}
                          {hiringReport.report.interviewerNotes.length > 0 && (
                            <p className="text-sm text-mentor-text-secondary">
                              Interviewer Notes: {hiringReport.report.interviewerNotes.join('; ')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div>
                          {generateReportError && <p className="text-sm text-mentor-error mb-2">{generateReportError}</p>}
                          <button onClick={handleGenerateReport} disabled={generatingReport} className="btn btn-primary">
                            {generatingReport ? 'Generating...' : 'Generate Hiring Report'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {isReportCompleted && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-3">Employer Review</h3>

                      {reviewSummaryLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : reviewSummaryError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{reviewSummaryError}</p>
                          <button onClick={fetchReviewSummary} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : reviewSummary ? (
                        <div className="space-y-3">
                          <p className="text-sm text-mentor-text-secondary">
                            {reviewSummary.reviewedCount} reviewed &middot; {reviewSummary.pendingCount} pending &middot;{' '}
                            {reviewSummary.totalReviewers} total reviewers
                          </p>

                          {reviewSummary.reviews.length > 0 && (
                            <ul className="space-y-1.5">
                              {reviewSummary.reviews.map((r) => (
                                <li key={r.reviewerMembershipId} className="text-xs text-mentor-text-secondary">
                                  {r.reviewerName || r.reviewerEmail || 'Reviewer'} &middot; <span className="capitalize">{r.status}</span>
                                  {r.reviewedAt ? ` · ${formatDateTime(r.reviewedAt)}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}

                          <div>
                            <label className="label">Your review notes (internal only)</label>
                            <textarea
                              value={reviewNotesDraft}
                              onChange={(e) => setReviewNotesDraft(e.target.value)}
                              rows={3}
                              maxLength={2000}
                              className="input w-full"
                              placeholder="Internal notes about this assessment..."
                            />
                          </div>
                          {saveReviewError && <p className="text-sm text-mentor-error">{saveReviewError}</p>}
                          <button onClick={handleSaveReview} disabled={savingReview} className="btn btn-primary">
                            {savingReview
                              ? 'Saving...'
                              : reviewSummary.currentUserReview?.status === 'reviewed'
                              ? 'Update Review'
                              : 'Mark as Reviewed'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {isReportCompleted && (
                    <div className="mt-5 pt-5 border-t border-mentor-border">
                      <h3 className="text-sm font-medium text-mentor-text mb-1">Assessment Finalization</h3>
                      <p className="text-xs text-mentor-text-muted mb-3">Finalized Assessment Package — employer only.</p>

                      {finalizationLoading ? (
                        <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                      ) : finalizationError ? (
                        <div>
                          <p className="text-sm text-mentor-error mb-2">{finalizationError}</p>
                          <button onClick={fetchFinalization} className="btn btn-secondary">
                            Try Again
                          </button>
                        </div>
                      ) : finalization ? (
                        <div className="space-y-3">
                          <p className="text-sm text-mentor-success font-medium">Finalized {formatDateTime(finalization.finalizedAt)}</p>
                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Overall Score</dt>
                              <dd className="text-sm text-mentor-text">{finalization.snapshot.overallScore} / 100</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Competency Coverage</dt>
                              <dd className="text-sm text-mentor-text">{finalization.snapshot.competencyCoveragePercent}%</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium text-mentor-text-muted mb-1">Follow-up Questions</dt>
                              <dd className="text-sm text-mentor-text">{finalization.snapshot.followUpQuestionCount}</dd>
                            </div>
                          </dl>
                          <p className="text-xs text-mentor-text-secondary">
                            Evidence: {finalization.snapshot.evidenceSummary.strongCount} strong &middot;{' '}
                            {finalization.snapshot.evidenceSummary.sufficientCount} sufficient &middot;{' '}
                            {finalization.snapshot.evidenceSummary.partialCount} partial &middot;{' '}
                            {finalization.snapshot.evidenceSummary.insufficientCount} insufficient
                          </p>
                          <p className="text-xs text-mentor-text-secondary">
                            Reviewed: {finalization.snapshot.reviewSummary.reviewedCount} / {finalization.snapshot.reviewSummary.eligibleReviewerCount}
                          </p>
                        </div>
                      ) : finalizationChecklist ? (
                        <div className="space-y-2">
                          <ul className="text-sm text-mentor-text-secondary space-y-1">
                            <li>{finalizationChecklist.assessmentEvaluated ? '✓' : '○'} Assessment evaluated</li>
                            <li>{finalizationChecklist.assessmentResultReady ? '✓' : '○'} Assessment result generated</li>
                            <li>{finalizationChecklist.evidenceReady ? '✓' : '○'} Evidence analysis generated</li>
                            <li>{finalizationChecklist.followUpReadyOrNotRequired ? '✓' : '○'} Follow-up plan ready / not required</li>
                            <li>{finalizationChecklist.reportReady ? '✓' : '○'} Hiring report generated</li>
                            <li>{finalizationChecklist.currentUserReviewed ? '✓' : '○'} Your review completed</li>
                          </ul>
                          {finalizeError && <p className="text-sm text-mentor-error">{finalizeError}</p>}
                          <button
                            onClick={handleFinalize}
                            disabled={!finalizationChecklist.canFinalize || finalizing}
                            className="btn btn-primary"
                          >
                            {finalizing ? 'Finalizing...' : 'Finalize Assessment Package'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              ) : invitation?.status === 'accepted' ? (
                <p className="text-sm text-mentor-text-secondary">Candidate has accepted; session not prepared yet.</p>
              ) : (
                <p className="text-sm text-mentor-text-secondary">Waiting for the candidate to accept the interview invitation.</p>
              )}
            </div>

            {sessionAnswers?.hiringEvaluationStatus === 'completed' && (
              <div className="card mt-6">
                <h2 className="section-title flex items-center gap-2 mb-1">Knowledge Grounding Analytics</h2>
                <p className="text-xs text-mentor-text-muted mb-4">
                  Deterministic (no AI) rollup of completed Organization Knowledge Alignment checks for this interview.
                  Evaluation coverage only — not a performance score, not a hiring recommendation.
                </p>

                {knowledgeAnalyticsLoading ? (
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                ) : knowledgeAnalyticsError ? (
                  <div>
                    <p className="text-sm text-mentor-error mb-2">{knowledgeAnalyticsError}</p>
                    <button onClick={fetchKnowledgeAnalytics} className="btn btn-secondary">
                      Try Again
                    </button>
                  </div>
                ) : !knowledgeAnalytics || !knowledgeAnalytics.built ? (
                  <div>
                    <p className="text-sm text-mentor-text-secondary mb-3">Not built yet.</p>
                    {canManage && (
                      <>
                        {buildKnowledgeAnalyticsError && <p className="text-sm text-mentor-error mb-2">{buildKnowledgeAnalyticsError}</p>}
                        <button onClick={handleBuildKnowledgeAnalytics} disabled={buildingKnowledgeAnalytics} className="btn btn-primary">
                          {buildingKnowledgeAnalytics ? 'Building...' : 'Build Knowledge Analytics'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  (() => {
                    const ret = knowledgeAnalytics.retrieval!;
                    const align = knowledgeAnalytics.alignment!;
                    const claimsAgg = knowledgeAnalytics.claims!;
                    const signalsAgg = knowledgeAnalytics.knowledgeSignals!;
                    const cov = knowledgeAnalytics.coverage!;
                    const barMax = Math.max(
                      align.alignedCount,
                      align.partiallyAlignedCount,
                      align.conflictingCount,
                      align.insufficientEvidenceCount,
                      align.notApplicableCount,
                      1
                    );
                    const claimBarMax = Math.max(
                      claimsAgg.supportedCount,
                      claimsAgg.partiallySupportedCount,
                      claimsAgg.conflictingCount,
                      claimsAgg.notSupportedCount,
                      claimsAgg.unverifiableCount,
                      1
                    );
                    const bar = (value: number, max: number, colorClass: string) => (
                      <div className="h-1.5 w-full bg-mentor-border rounded-full overflow-hidden">
                        <div className={`h-full ${colorClass}`} style={{ width: `${Math.round((value / max) * 100)}%` }} />
                      </div>
                    );

                    return (
                      <div className="space-y-5">
                        {canManage && (
                          <div>
                            {buildKnowledgeAnalyticsError && <p className="text-sm text-mentor-error mb-2">{buildKnowledgeAnalyticsError}</p>}
                            <button onClick={handleBuildKnowledgeAnalytics} disabled={buildingKnowledgeAnalytics} className="btn btn-secondary">
                              {buildingKnowledgeAnalytics ? 'Rebuilding...' : 'Rebuild Knowledge Analytics'}
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Evaluation Coverage</p>
                            <p className="text-lg font-semibold text-mentor-text">{cov.coveragePercent}%</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Grounded Questions</p>
                            <p className="text-lg font-semibold text-mentor-text">{ret.groundedQuestionCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Knowledge Sources Used</p>
                            <p className="text-lg font-semibold text-mentor-text">
                              {ret.uniqueKnowledgeBaseCount} KB · {ret.uniqueDocumentCount} doc{ret.uniqueDocumentCount === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Conflicting Responses</p>
                            <p className="text-lg font-semibold text-mentor-warning">{align.conflictingCount}</p>
                          </div>
                        </div>

                        <div>
                          <p className="label mb-2">A. Alignment</p>
                          <div className="space-y-1.5">
                            {[
                              ['Aligned', align.alignedCount, 'bg-mentor-success'],
                              ['Partially Aligned', align.partiallyAlignedCount, 'bg-mentor-warning'],
                              ['Conflicting', align.conflictingCount, 'bg-mentor-warning'],
                              ['Insufficient Evidence', align.insufficientEvidenceCount, 'bg-mentor-border'],
                              ['Not Applicable', align.notApplicableCount, 'bg-mentor-border'],
                            ].map(([label, value, color]) => (
                              <div key={label as string} className="flex items-center gap-2 text-xs">
                                <span className="w-36 text-mentor-text-secondary">{label}</span>
                                {bar(value as number, barMax, color as string)}
                                <span className="w-6 text-right text-mentor-text">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="label mb-2">B. Claim Alignment</p>
                          <div className="space-y-1.5">
                            {[
                              ['Supported', claimsAgg.supportedCount, 'bg-mentor-success'],
                              ['Partially Supported', claimsAgg.partiallySupportedCount, 'bg-mentor-warning'],
                              ['Conflicting', claimsAgg.conflictingCount, 'bg-mentor-warning'],
                              ['Not Supported', claimsAgg.notSupportedCount, 'bg-mentor-border'],
                              ['Unverifiable', claimsAgg.unverifiableCount, 'bg-mentor-border'],
                            ].map(([label, value, color]) => (
                              <div key={label as string} className="flex items-center gap-2 text-xs">
                                <span className="w-36 text-mentor-text-secondary">{label}</span>
                                {bar(value as number, claimBarMax, color as string)}
                                <span className="w-6 text-right text-mentor-text">{value}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-mentor-text-muted mt-1">{claimsAgg.totalClaimCount} total claims assessed.</p>
                        </div>

                        <div>
                          <p className="label mb-2">C. Knowledge Usage</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Knowledge Bases</p>
                              <p className="text-lg font-semibold text-mentor-text">{ret.uniqueKnowledgeBaseCount}</p>
                            </div>
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Documents</p>
                              <p className="text-lg font-semibold text-mentor-text">{ret.uniqueDocumentCount}</p>
                            </div>
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Chunks</p>
                              <p className="text-lg font-semibold text-mentor-text">{ret.uniqueChunkCount}</p>
                            </div>
                          </div>
                        </div>

                        <div>
                          <p className="label mb-2">D. Observable Knowledge Signals</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Demonstrates Knowledge</p>
                              <p className="text-lg font-semibold text-mentor-text">{signalsAgg.demonstratesKnowledgeCount}</p>
                            </div>
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Uses Relevant Terminology</p>
                              <p className="text-lg font-semibold text-mentor-text">{signalsAgg.usesRelevantTerminologyCount}</p>
                            </div>
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted">Respects Known Constraints</p>
                              <p className="text-lg font-semibold text-mentor-text">{signalsAgg.respectsKnownConstraintsCount}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {interviewSession && (
              <div className="card mt-6">
                <h2 className="section-title flex items-center gap-2 mb-1">Coding Assessment</h2>
                <p className="text-xs text-mentor-text-muted mb-4">
                  Optional coding problems for this hiring interview. No execution yet — candidate code is saved for later review.
                </p>

                {codingSessionLoading ? (
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                ) : codingSessionError ? (
                  <div>
                    <p className="text-sm text-mentor-error mb-2">{codingSessionError}</p>
                    <button onClick={fetchCodingSession} className="btn btn-secondary">
                      Try Again
                    </button>
                  </div>
                ) : !codingSession || !codingSession.configured ? (
                  <div>
                    {canManage ? (
                      <>
                        <p className="text-sm text-mentor-text-secondary mb-3">No coding assessment configured yet.</p>
                        {readyCodingQuestions.length === 0 ? (
                          <p className="text-xs text-mentor-text-muted">
                            No READY coding questions available.{' '}
                            <Link to={`/organizations/${organizationId}/employer/coding-questions`} className="underline">
                              Create one
                            </Link>
                            .
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {readyCodingQuestions.map((q) => (
                              <label key={q.id} className="flex items-center gap-2 text-sm text-mentor-text">
                                <input
                                  type="checkbox"
                                  checked={selectedCodingQuestionIds.includes(q.id)}
                                  onChange={(e) =>
                                    setSelectedCodingQuestionIds((prev) =>
                                      e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id)
                                    )
                                  }
                                />
                                {q.title}
                                <span className="text-xs text-mentor-text-muted capitalize">({q.difficulty})</span>
                              </label>
                            ))}
                            {saveCodingSessionError && <p className="text-sm text-mentor-error">{saveCodingSessionError}</p>}
                            <div>
                              <button
                                onClick={handleSaveCodingSession}
                                disabled={savingCodingSession || selectedCodingQuestionIds.length === 0}
                                className="btn btn-primary px-3 py-1.5 text-xs"
                              >
                                {savingCodingSession ? 'Creating...' : 'Create Coding Assessment'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-mentor-text-secondary">No coding assessment configured for this interview.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 flex-wrap text-sm">
                      <span className="badge badge-neutral capitalize">{codingSession.status?.replace(/_/g, ' ')}</span>
                      <span className="text-mentor-text-secondary">
                        {codingSession.totalQuestions} question{codingSession.totalQuestions === 1 ? '' : 's'}
                      </span>
                    </div>
                    {(codingSession.questions ?? []).map((q) => (
                      <div key={q.codingQuestionId} className="surface-muted p-3">
                        <p className="text-sm font-medium text-mentor-text">
                          {q.title} <span className="text-xs text-mentor-text-muted capitalize">({q.difficulty})</span>
                        </p>
                        {q.submissions.length === 0 ? (
                          <p className="text-xs text-mentor-text-muted mt-1">No submissions yet.</p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {q.submissions.map((s) => (
                              <div key={s.attemptNumber} className="text-xs">
                                <p className="text-mentor-text-secondary">
                                  Attempt {s.attemptNumber} &middot; {s.language} &middot;{' '}
                                  {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : ''}
                                </p>
                                <pre className="surface-muted p-2 mt-1 font-mono whitespace-pre-wrap text-[11px] text-mentor-text max-h-48 overflow-y-auto">
                                  {s.sourceCode}
                                </pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <History size={18} className="text-mentor-text-muted" />
                Activity Timeline
              </h2>

              {timelineLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : timelineError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{timelineError}</p>
                  <button onClick={fetchTimeline} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : !timeline || timeline.timeline.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No activity recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {timeline.timeline.map((item, index) => (
                    <li key={index} className="surface-muted p-3">
                      <p className="text-sm text-mentor-text">
                        {item.type === 'application_created'
                          ? 'Application created'
                          : item.type === 'status_changed'
                          ? `Stage changed: ${capitalizeStatus(item.fromStatus)} → ${capitalizeStatus(item.toStatus)}`
                          : item.type === 'assessment_finalized'
                          ? 'Assessment package finalized'
                          : item.type === 'employer_decision'
                          ? 'Employer decision recorded'
                          : item.type === 'internal_note_added'
                          ? 'Internal note added'
                          : 'Candidate communication logged'}
                      </p>
                      <p className="text-xs text-mentor-text-muted mt-0.5">
                        {formatDateTime(item.occurredAt)} &middot; {item.actor.type === 'member' ? item.actor.displayName || 'Member' : 'System'}
                      </p>
                      {item.type === 'assessment_finalized' && item.metadata && (
                        <p className="text-xs text-mentor-text-secondary mt-1">
                          Overall score: {item.metadata.overallScore}/100 &middot; Coverage: {item.metadata.competencyCoveragePercent}%
                        </p>
                      )}
                      {item.type === 'employer_decision' && item.metadata && (
                        <p className="text-xs text-mentor-text-secondary mt-1">
                          {labelizeCode(item.metadata.decisionType)} &middot; {labelizeCode(item.metadata.reasonCode)}
                          {item.metadata.notes ? ` — ${item.metadata.notes}` : ''}
                        </p>
                      )}
                      {item.type === 'candidate_communication' && item.metadata && (
                        <p className="text-xs text-mentor-text-secondary mt-1">
                          {item.metadata.direction === 'outbound' ? 'Employer → Candidate' : 'Candidate → Employer'} &middot;{' '}
                          {labelizeCode(item.metadata.channel)} &middot; {labelizeCode(item.metadata.communicationType)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <ClipboardList size={18} className="text-mentor-text-muted" />
                Decision Log
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">Employer Decision Log — internal only.</p>

              {canManage && (
                <div className="mb-4">
                  {!showDecisionForm ? (
                    <button onClick={() => setShowDecisionForm(true)} className="btn btn-secondary">
                      Record Decision
                    </button>
                  ) : (
                    <form onSubmit={handleRecordDecision} className="surface-muted p-3 space-y-3">
                      <p className="text-xs text-mentor-text-secondary">
                        This records an internal employer decision note. It does not change the candidate's pipeline stage.
                      </p>
                      <div>
                        <label className="label mb-1 block">Decision</label>
                        <select
                          value={decisionTypeInput}
                          onChange={(e) => setDecisionTypeInput(e.target.value as EmployerJobApplicationDecisionType)}
                          className="input w-full"
                        >
                          {EMPLOYER_JOB_APPLICATION_DECISION_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {labelizeCode(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label mb-1 block">Reason</label>
                        <select
                          value={reasonCodeInput}
                          onChange={(e) => setReasonCodeInput(e.target.value as EmployerJobApplicationDecisionReasonCode)}
                          className="input w-full"
                        >
                          {EMPLOYER_JOB_APPLICATION_DECISION_REASON_CODES.map((r) => (
                            <option key={r} value={r}>
                              {labelizeCode(r)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label mb-1 block">Internal notes</label>
                        <textarea
                          value={decisionNotesInput}
                          onChange={(e) => setDecisionNotesInput(e.target.value)}
                          rows={3}
                          maxLength={2000}
                          className="input w-full"
                          placeholder="Internal notes (optional)..."
                        />
                      </div>
                      {saveDecisionError && <p className="text-sm text-mentor-error">{saveDecisionError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingDecision} className="btn btn-primary">
                          {savingDecision ? 'Saving...' : 'Save Decision'}
                        </button>
                        <button type="button" onClick={() => setShowDecisionForm(false)} className="btn btn-secondary">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {decisionsLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : decisionsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{decisionsError}</p>
                  <button onClick={fetchDecisions} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : decisions.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No decisions recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {decisions.map((d) => (
                    <li key={d.id} className="surface-muted p-3">
                      <p className="text-sm text-mentor-text">
                        {labelizeCode(d.decisionType)} &middot; {labelizeCode(d.reasonCode)}
                      </p>
                      <p className="text-xs text-mentor-text-muted mt-0.5">
                        {formatDateTime(d.createdAt)} &middot; {d.createdBy.displayName || 'Member'} &middot; Status at decision:{' '}
                        {capitalizeStatus(d.applicationStatusAtDecision)}
                      </p>
                      {d.notes && <p className="text-xs text-mentor-text-secondary mt-1">{d.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <Send size={18} className="text-mentor-text-muted" />
                Internal Notes
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">Internal employer notes — not visible to candidate.</p>

              {canManage && (
                <form onSubmit={handleAddNote} className="mb-4 space-y-2">
                  <textarea
                    value={newNoteBody}
                    onChange={(e) => setNewNoteBody(e.target.value)}
                    rows={3}
                    maxLength={3000}
                    className="input w-full"
                    placeholder="Add an internal note..."
                  />
                  {availableMembers.length > 0 && (
                    <div>
                      <label className="label mb-1 block">Mention teammates (max 10)</label>
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) toggleNoteMention(e.target.value);
                          e.target.value = '';
                        }}
                        className="input w-full"
                      >
                        <option value="">Select a teammate to mention...</option>
                        {availableMembers
                          .filter((m) => !newNoteMentionIds.includes(m.membershipId))
                          .map((m) => (
                            <option key={m.membershipId} value={m.membershipId}>
                              {m.displayName || 'Member'}
                            </option>
                          ))}
                      </select>
                      {newNoteMentionIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {newNoteMentionIds.map((id) => {
                            const member = availableMembers.find((m) => m.membershipId === id);
                            return (
                              <span key={id} className="badge badge-info flex items-center gap-1">
                                @{member?.displayName || 'Member'}
                                <button type="button" onClick={() => toggleNoteMention(id)} aria-label="Remove mention">
                                  <X size={12} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {saveNoteError && <p className="text-sm text-mentor-error">{saveNoteError}</p>}
                  <button type="submit" disabled={savingNote || !newNoteBody.trim()} className="btn btn-primary">
                    {savingNote ? 'Saving...' : 'Add Note'}
                  </button>
                </form>
              )}

              {notesLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : notesError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{notesError}</p>
                  <button onClick={fetchNotes} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : internalNotes.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No internal notes yet.</p>
              ) : (
                <ul className="space-y-3">
                  {internalNotes.map((n) => (
                    <li key={n.id} className="surface-muted p-3">
                      <p className="text-xs text-mentor-text-muted mb-1">
                        {n.author.displayName || 'Member'} &middot; {formatDateTime(n.createdAt)}
                      </p>
                      <p className="text-sm text-mentor-text whitespace-pre-wrap">{n.body}</p>
                      {n.mentions.length > 0 && (
                        <p className="text-xs text-mentor-text-muted mt-1">
                          Mentioned: {n.mentions.map((m) => `@${m.displayName || 'Member'}`).join(', ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <UserPlus size={18} className="text-mentor-text-muted" />
                Collaboration Team
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">Internal collaboration metadata — not visible to candidate.</p>

              {canManage && (
                <form onSubmit={handleAssignCollaborator} className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="label mb-1 block">Teammate</label>
                    <select
                      value={newCollaboratorMembershipId}
                      onChange={(e) => setNewCollaboratorMembershipId(e.target.value)}
                      className="input"
                    >
                      <option value="">Select member...</option>
                      {availableMembers.map((m) => (
                        <option key={m.membershipId} value={m.membershipId}>
                          {m.displayName || 'Member'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label mb-1 block">Role</label>
                    <select
                      value={newCollaboratorRole}
                      onChange={(e) => setNewCollaboratorRole(e.target.value as EmployerJobApplicationCollaborationRole)}
                      className="input"
                    >
                      {EMPLOYER_JOB_APPLICATION_COLLABORATION_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {capitalizeStatus(r)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" disabled={savingCollaborator || !newCollaboratorMembershipId} className="btn btn-primary">
                    {savingCollaborator ? 'Saving...' : 'Add Collaborator'}
                  </button>
                </form>
              )}

              {saveCollaboratorError && <p className="text-sm text-mentor-error mb-3">{saveCollaboratorError}</p>}

              {collaboratorsLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : collaboratorsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{collaboratorsError}</p>
                  <button onClick={fetchCollaborators} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : collaborators.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No collaborators assigned yet.</p>
              ) : (
                <ul className="divide-y divide-mentor-border">
                  {collaborators.map((c) => (
                    <li key={c.membershipId} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-mentor-text">{c.displayName || 'Member'}</p>
                        <p className="text-xs text-mentor-text-muted capitalize">{c.collaborationRole}</p>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => handleRemoveCollaborator(c.membershipId)}
                          disabled={removingCollaboratorId === c.membershipId}
                          className="btn btn-secondary px-3 py-1.5 text-xs"
                        >
                          {removingCollaboratorId === c.membershipId ? 'Removing...' : 'Remove'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <MessageSquare size={18} className="text-mentor-text-muted" />
                Candidate Communication
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">Internal communication history — the candidate cannot see this.</p>

              {canManage && (
                <div className="mb-4">
                  {!showCommunicationForm ? (
                    <button onClick={() => setShowCommunicationForm(true)} className="btn btn-secondary">
                      Log Communication
                    </button>
                  ) : (
                    <form onSubmit={handleLogCommunication} className="surface-muted p-3 space-y-3">
                      <p className="text-xs text-mentor-text-secondary">
                        This records communication history only. EnterSkill will not send a message.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="label mb-1 block">Direction</label>
                          <select
                            value={commDirection}
                            onChange={(e) => setCommDirection(e.target.value as EmployerCandidateCommunicationDirection)}
                            className="input w-full"
                          >
                            {EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS.map((d) => (
                              <option key={d} value={d}>
                                {d === 'outbound' ? 'Employer → Candidate' : 'Candidate → Employer'}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label mb-1 block">Channel</label>
                          <select
                            value={commChannel}
                            onChange={(e) => setCommChannel(e.target.value as EmployerCandidateCommunicationChannel)}
                            className="input w-full"
                          >
                            {EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS.map((c) => (
                              <option key={c} value={c}>
                                {labelizeCode(c)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label mb-1 block">Type</label>
                          <select
                            value={commType}
                            onChange={(e) => setCommType(e.target.value as EmployerCandidateCommunicationType)}
                            className="input w-full"
                          >
                            {EMPLOYER_CANDIDATE_COMMUNICATION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {labelizeCode(t)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="label mb-1 block">Subject (optional)</label>
                        <input
                          type="text"
                          value={commSubject}
                          onChange={(e) => setCommSubject(e.target.value)}
                          maxLength={300}
                          className="input w-full"
                          placeholder="Subject..."
                        />
                      </div>
                      <div>
                        <label className="label mb-1 block">Summary</label>
                        <textarea
                          value={commSummary}
                          onChange={(e) => setCommSummary(e.target.value)}
                          rows={3}
                          maxLength={3000}
                          className="input w-full"
                          placeholder="What was discussed..."
                        />
                      </div>
                      <div>
                        <label className="label mb-1 block">Date/time (optional)</label>
                        <input
                          type="datetime-local"
                          value={commOccurredAt}
                          onChange={(e) => setCommOccurredAt(e.target.value)}
                          className="input w-full"
                        />
                      </div>
                      {saveCommunicationError && <p className="text-sm text-mentor-error">{saveCommunicationError}</p>}
                      <div className="flex gap-2">
                        <button type="submit" disabled={savingCommunication || !commSummary.trim()} className="btn btn-primary">
                          {savingCommunication ? 'Saving...' : 'Save'}
                        </button>
                        <button type="button" onClick={() => setShowCommunicationForm(false)} className="btn btn-secondary">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {communicationsLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : communicationsError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{communicationsError}</p>
                  <button onClick={fetchCommunications} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : communications.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-6">No communication recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {communications.map((c) => (
                    <li key={c.id} className="surface-muted p-3">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`badge ${c.direction === 'outbound' ? 'badge-info' : 'badge-neutral'}`}>
                          {c.direction === 'outbound' ? 'Employer → Candidate' : 'Candidate → Employer'}
                        </span>
                        <span className="text-xs text-mentor-text-muted">
                          {labelizeCode(c.channel)} &middot; {labelizeCode(c.communicationType)}
                        </span>
                      </div>
                      {c.subject && <p className="text-sm font-medium text-mentor-text">{c.subject}</p>}
                      <p className="text-sm text-mentor-text whitespace-pre-wrap">{c.summary}</p>
                      <p className="text-xs text-mentor-text-muted mt-1">
                        {formatDateTime(c.occurredAt)} &middot; Recorded by {c.recordedBy.displayName || 'Member'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card mt-6">
              <h2 className="section-title flex items-center gap-2 mb-1">
                <Network size={18} className="text-mentor-text-muted" />
                Skill Graph
              </h2>
              <p className="text-xs text-mentor-text-muted mb-4">Structured skill graph — deterministic, no AI, no fake proficiency scores.</p>

              {skillGraphLoading ? (
                <div className="p-6 text-center">
                  <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                </div>
              ) : skillGraphError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                  <p className="text-sm text-mentor-text-secondary mb-4">{skillGraphError}</p>
                  <button onClick={fetchSkillGraph} className="btn btn-primary">
                    Try Again
                  </button>
                </div>
              ) : !skillGraph || !skillGraph.built ? (
                <div>
                  <p className="text-sm text-mentor-text-secondary mb-3">
                    Skill graph not built yet — this deterministically unifies structured skills already extracted from the job and
                    candidate artifacts.
                  </p>
                  {canManage && (
                    <>
                      {buildSkillGraphError && <p className="text-sm text-mentor-error mb-2">{buildSkillGraphError}</p>}
                      <button onClick={handleBuildSkillGraph} disabled={buildingSkillGraph} className="btn btn-primary">
                        {buildingSkillGraph ? 'Building...' : 'Build Skill Graph'}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                (() => {
                  const jobSkillIds = new Set(skillGraph.jobSkills.map((s) => s.skillNodeId));
                  const candidateSkillIds = new Set(skillGraph.candidateSkills.map((s) => s.skillNodeId));
                  const matchedSkills = skillGraph.jobSkills.filter((s) => candidateSkillIds.has(s.skillNodeId));
                  const missingJobSkills = skillGraph.jobSkills.filter((s) => !candidateSkillIds.has(s.skillNodeId));
                  const additionalCandidateSkills = skillGraph.candidateSkills.filter((s) => !jobSkillIds.has(s.skillNodeId));

                  const evidenceBadgeLabel: Record<string, string> = {
                    resume: 'Resume',
                    screening: 'Screening',
                    assessment: 'Assessment',
                    evidence: 'Evidence',
                  };

                  return (
                    <div className="space-y-6">
                      {canManage && (
                        <div>
                          {buildSkillGraphError && <p className="text-sm text-mentor-error mb-2">{buildSkillGraphError}</p>}
                          <button onClick={handleBuildSkillGraph} disabled={buildingSkillGraph} className="btn btn-secondary">
                            {buildingSkillGraph ? 'Rebuilding...' : 'Rebuild Skill Graph'}
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="surface-muted p-3">
                          <p className="text-xs text-mentor-text-muted">Job Skills</p>
                          <p className="text-lg font-semibold text-mentor-text">{skillGraph.coverage.jobSkillCount}</p>
                        </div>
                        <div className="surface-muted p-3">
                          <p className="text-xs text-mentor-text-muted">Candidate Evidence Skills</p>
                          <p className="text-lg font-semibold text-mentor-text">{skillGraph.coverage.candidateEvidenceSkillCount}</p>
                        </div>
                        <div className="surface-muted p-3">
                          <p className="text-xs text-mentor-text-muted">Matched</p>
                          <p className="text-lg font-semibold text-mentor-success">{skillGraph.coverage.matchedSkillCount}</p>
                        </div>
                        <div className="surface-muted p-3">
                          <p className="text-xs text-mentor-text-muted">Missing Job Skills</p>
                          <p className="text-lg font-semibold text-mentor-warning">{skillGraph.coverage.missingJobSkillCount}</p>
                        </div>
                      </div>

                      <div>
                        <p className="label mb-2">Matched Skills</p>
                        {matchedSkills.length === 0 ? (
                          <p className="text-xs text-mentor-text-muted">No matched skill evidence yet.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {matchedSkills.map((s) => (
                              <span key={s.skillNodeId} className="badge badge-success">
                                {s.canonicalName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="label mb-2">Missing Job Skills</p>
                        {missingJobSkills.length === 0 ? (
                          <p className="text-xs text-mentor-text-muted">No missing job skills.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {missingJobSkills.map((s) => (
                              <span key={s.skillNodeId} className="badge badge-warning">
                                {s.canonicalName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="label mb-2">Additional Candidate Skills</p>
                        {additionalCandidateSkills.length === 0 ? (
                          <p className="text-xs text-mentor-text-muted">No additional candidate skill evidence.</p>
                        ) : (
                          <ul className="space-y-2">
                            {additionalCandidateSkills.map((s) => (
                              <li key={s.skillNodeId} className="surface-muted p-2.5">
                                <p className="text-sm text-mentor-text mb-1">{s.canonicalName}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {s.evidenceSources.map((src, idx) => (
                                    <span key={idx} className="badge badge-neutral">
                                      {evidenceBadgeLabel[src.type] || src.type}
                                      {src.evidenceLevel ? `: ${labelizeCode(src.evidenceLevel)}` : ''}
                                      {src.score !== undefined ? ` (${src.score})` : ''}
                                    </span>
                                  ))}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              <div className="mt-6 pt-6 border-t border-mentor-border">
                <h3 className="section-title mb-1">Skill Evidence Intelligence</h3>
                <p className="text-xs text-mentor-text-muted mb-4">
                  Evidence strength reflects the amount and quality of structured evidence currently available. It is not a
                  proficiency or hiring score.
                </p>

                {skillIntelligenceLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                  </div>
                ) : skillIntelligenceError ? (
                  <div className="p-6 text-center">
                    <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
                    <p className="text-sm text-mentor-text-secondary mb-4">{skillIntelligenceError}</p>
                    <button onClick={fetchSkillIntelligence} className="btn btn-primary">
                      Try Again
                    </button>
                  </div>
                ) : !skillIntelligence || !skillIntelligence.built ? (
                  <div>
                    <p className="text-sm text-mentor-text-secondary mb-3">
                      Skill evidence intelligence not built yet. Build the skill graph above first, then build evidence
                      intelligence from it.
                    </p>
                    {canManage && (
                      <>
                        {buildSkillIntelligenceError && <p className="text-sm text-mentor-error mb-2">{buildSkillIntelligenceError}</p>}
                        <button
                          onClick={handleBuildSkillIntelligence}
                          disabled={buildingSkillIntelligence || !skillGraph?.built}
                          className="btn btn-primary"
                        >
                          {buildingSkillIntelligence ? 'Building...' : 'Build Skill Evidence Intelligence'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  (() => {
                    const classificationBadge: Record<string, string> = {
                      strong_evidence: 'badge-success',
                      supported: 'badge-success',
                      limited_evidence: 'badge-warning',
                      missing: 'badge-warning',
                      additional_candidate_skill: 'badge-neutral',
                    };
                    const classificationLabel: Record<string, string> = {
                      strong_evidence: 'Strong Evidence',
                      supported: 'Supported',
                      limited_evidence: 'Limited Evidence',
                      missing: 'Missing',
                      additional_candidate_skill: 'Additional Candidate Skill',
                    };
                    const summary = skillIntelligence.summary!;
                    const skills = skillIntelligence.skills || [];

                    return (
                      <div className="space-y-6">
                        {canManage && (
                          <div>
                            {buildSkillIntelligenceError && (
                              <p className="text-sm text-mentor-error mb-2">{buildSkillIntelligenceError}</p>
                            )}
                            <button onClick={handleBuildSkillIntelligence} disabled={buildingSkillIntelligence} className="btn btn-secondary">
                              {buildingSkillIntelligence ? 'Rebuilding...' : 'Rebuild Skill Evidence Intelligence'}
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Strong Evidence</p>
                            <p className="text-lg font-semibold text-mentor-success">{summary.strongEvidenceCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Supported</p>
                            <p className="text-lg font-semibold text-mentor-text">{summary.supportedCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Limited Evidence</p>
                            <p className="text-lg font-semibold text-mentor-warning">{summary.limitedEvidenceCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Missing</p>
                            <p className="text-lg font-semibold text-mentor-warning">{summary.missingCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Additional Skills</p>
                            <p className="text-lg font-semibold text-mentor-text">{summary.additionalCandidateSkillCount}</p>
                          </div>
                          <div className="surface-muted p-3">
                            <p className="text-xs text-mentor-text-muted">Coverage</p>
                            <p className="text-lg font-semibold text-mentor-text">{summary.coveragePercent}%</p>
                          </div>
                        </div>

                        <div>
                          <p className="label mb-2">Skills</p>
                          {skills.length === 0 ? (
                            <p className="text-xs text-mentor-text-muted">No skill evidence intelligence available.</p>
                          ) : (
                            <ul className="space-y-2">
                              {skills.map((s) => (
                                <li key={s.skillNodeId} className="surface-muted p-2.5">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <p className="text-sm text-mentor-text">{s.canonicalName}</p>
                                    <span className={`badge ${classificationBadge[s.classification] || 'badge-neutral'}`}>
                                      {classificationLabel[s.classification] || s.classification}
                                    </span>
                                  </div>
                                  {s.evidenceStrengthScore !== undefined && (
                                    <p className="text-xs text-mentor-text-muted">Evidence strength: {s.evidenceStrengthScore}/100</p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>

            {isSessionCompleted && (
              <div className="card mt-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <h2 className="section-title">Scenario Assessments</h2>
                  {canManage && !showScenarioForm && (
                    <button onClick={handleOpenCreateScenario} className="btn btn-primary px-3 py-1.5 text-xs">
                      <Plus size={14} />
                      New Scenario
                    </button>
                  )}
                </div>
                <p className="text-xs text-mentor-text-muted mb-4">
                  Structured, job-relevant workplace scenarios for this assessment — definitions only, no candidate execution
                  yet.
                </p>

                {showScenarioForm && (
                  <form onSubmit={handleSubmitScenario} className="surface-muted p-4 mb-4 space-y-3">
                    <h3 className="text-sm font-semibold text-mentor-text">{editingScenarioId ? 'Edit Scenario' : 'New Scenario'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Title</label>
                        <input value={scenarioTitle} onChange={(e) => setScenarioTitle(e.target.value)} className="input" maxLength={200} />
                      </div>
                      <div>
                        <label className="label">Category</label>
                        <select
                          value={scenarioCategory}
                          onChange={(e) => setScenarioCategory(e.target.value as EmployerInterviewScenarioCategory)}
                          className="input"
                        >
                          {[
                            'technical',
                            'system_design',
                            'debugging',
                            'incident',
                            'architecture',
                            'leadership',
                            'stakeholder',
                            'prioritization',
                            'communication',
                            'domain',
                            'other',
                          ].map((c) => (
                            <option key={c} value={c}>
                              {labelizeCode(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="label">Description</label>
                      <textarea
                        value={scenarioDescription}
                        onChange={(e) => setScenarioDescription(e.target.value)}
                        className="input"
                        rows={2}
                        maxLength={2000}
                      />
                    </div>

                    <div>
                      <label className="label">Situation</label>
                      <textarea
                        value={scenarioSituation}
                        onChange={(e) => setScenarioSituation(e.target.value)}
                        className="input"
                        rows={2}
                        maxLength={2000}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Candidate Role</label>
                        <input
                          value={scenarioCandidateRole}
                          onChange={(e) => setScenarioCandidateRole(e.target.value)}
                          className="input"
                          maxLength={300}
                        />
                      </div>
                      <div>
                        <label className="label">Difficulty</label>
                        <select
                          value={scenarioDifficulty}
                          onChange={(e) => setScenarioDifficulty(e.target.value as EmployerInterviewScenarioDifficulty)}
                          className="input"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">Constraints (comma-separated)</label>
                        <input value={scenarioConstraints} onChange={(e) => setScenarioConstraints(e.target.value)} className="input" />
                      </div>
                      <div>
                        <label className="label">Available Information (comma-separated)</label>
                        <input
                          value={scenarioAvailableInformation}
                          onChange={(e) => setScenarioAvailableInformation(e.target.value)}
                          className="input"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label mb-1.5">Target Competencies</label>
                      {(rubric?.rubric.competencies.length ?? 0) === 0 ? (
                        <p className="text-xs text-mentor-text-muted">No rubric competencies available.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {rubric!.rubric.competencies.map((c) => (
                            <button
                              type="button"
                              key={c.competencyName}
                              onClick={() => handleToggleTargetCompetency(c.competencyName)}
                              className={`badge ${scenarioTargetCompetencies.includes(c.competencyName) ? 'badge-info' : 'badge-neutral'}`}
                            >
                              {c.competencyName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="label">Objectives (comma-separated)</label>
                        <input value={scenarioObjectives} onChange={(e) => setScenarioObjectives(e.target.value)} className="input" />
                      </div>
                      <div>
                        <label className="label">Success Evidence (comma-separated)</label>
                        <input value={scenarioSuccessEvidence} onChange={(e) => setScenarioSuccessEvidence(e.target.value)} className="input" />
                      </div>
                      <div>
                        <label className="label">Failure Signals (comma-separated)</label>
                        <input value={scenarioFailureSignals} onChange={(e) => setScenarioFailureSignals(e.target.value)} className="input" />
                      </div>
                    </div>

                    {saveScenarioError && <p className="text-sm text-mentor-error">{saveScenarioError}</p>}
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={savingScenario} className="btn btn-primary">
                        {savingScenario ? 'Saving...' : editingScenarioId ? 'Save Changes' : 'Create Scenario'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowScenarioForm(false);
                          resetScenarioForm();
                        }}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {scenariosLoading ? (
                  <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
                ) : scenariosError ? (
                  <div>
                    <p className="text-sm text-mentor-error mb-2">{scenariosError}</p>
                    <button onClick={fetchScenarios} className="btn btn-secondary">
                      Try Again
                    </button>
                  </div>
                ) : scenarios.length === 0 ? (
                  <p className="text-sm text-mentor-text-secondary">No scenarios yet.</p>
                ) : (
                  <div className="space-y-3">
                    {scenarios.map((s) => {
                      const statusBadge: Record<string, string> = { draft: 'badge-neutral', ready: 'badge-success', archived: 'badge-warning' };
                      const isExpanded = expandedScenarioId === s.id;
                      const questionSet = scenarioQuestionsById[s.id];
                      return (
                        <div key={s.id} className="surface-muted p-4">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                            <div>
                              <p className="text-sm font-semibold text-mentor-text">{s.title}</p>
                              <p className="text-xs text-mentor-text-muted">
                                {labelizeCode(s.category)} &middot; {labelizeCode(s.difficulty)}
                              </p>
                            </div>
                            <span className={`badge ${statusBadge[s.status] || 'badge-neutral'}`}>{labelizeCode(s.status)}</span>
                          </div>
                          {s.targetCompetencies.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                              {s.targetCompetencies.map((c) => (
                                <span key={c} className="badge badge-neutral">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                          {scenarioActionErrorById[s.id] && <p className="text-xs text-mentor-error mb-1.5">{scenarioActionErrorById[s.id]}</p>}
                          {canManage && (
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              {s.status === 'draft' && (
                                <>
                                  <button onClick={() => handleOpenEditScenario(s)} className="btn btn-secondary px-2 py-1 text-xs">
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleMarkScenarioReady(s.id)}
                                    disabled={scenarioActionPendingId === s.id}
                                    className="btn btn-secondary px-2 py-1 text-xs"
                                  >
                                    Mark Ready
                                  </button>
                                </>
                              )}
                              {s.status !== 'archived' && (
                                <button
                                  onClick={() => handleArchiveScenario(s.id)}
                                  disabled={scenarioActionPendingId === s.id}
                                  className="btn btn-secondary px-2 py-1 text-xs"
                                >
                                  Archive
                                </button>
                              )}
                            </div>
                          )}

                          <button
                            onClick={() => handleToggleScenarioExpanded(s.id)}
                            className="text-xs text-primary-600 hover:underline"
                          >
                            {isExpanded ? 'Hide Scenario Questions' : 'Scenario Questions'}
                          </button>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-mentor-border">
                              <div className="mb-3">
                                <p className="text-xs font-medium text-mentor-text-muted mb-1">Scenario Session</p>
                                {scenarioSessionLoadingById[s.id] ? (
                                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                ) : scenarioSessionErrorById[s.id] ? (
                                  <p className="text-xs text-mentor-error">{scenarioSessionErrorById[s.id]}</p>
                                ) : !scenarioSessionById[s.id] || !scenarioSessionById[s.id].started ? (
                                  <span className="badge badge-neutral">Not started</span>
                                ) : scenarioSessionById[s.id].status === 'completed' ? (
                                  <span className="badge badge-success">Completed</span>
                                ) : (
                                  <span className="badge badge-warning">
                                    In progress {scenarioSessionById[s.id].progress.current}/{scenarioSessionById[s.id].progress.total}
                                  </span>
                                )}
                              </div>

                              {scenarioQuestionsLoadingById[s.id] ? (
                                <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                              ) : !questionSet || !questionSet.generated ? (
                                <div>
                                  {(questionSet?.status === 'failed' || scenarioQuestionsErrorById[s.id]) && (
                                    <p className="text-xs text-mentor-error mb-1">
                                      {questionSet?.errorMessage || scenarioQuestionsErrorById[s.id] || 'Question generation failed.'}
                                    </p>
                                  )}
                                  {questionSet?.status === 'processing' ? (
                                    <p className="text-xs text-mentor-text-secondary">Generating questions...</p>
                                  ) : (
                                    <>
                                      <p className="text-xs text-mentor-text-secondary mb-2">
                                        {s.status === 'ready'
                                          ? 'No question plan generated yet.'
                                          : 'Mark this scenario ready before generating questions.'}
                                      </p>
                                      {canManage && s.status === 'ready' && (
                                        <button
                                          onClick={() => handleGenerateScenarioQuestions(s.id)}
                                          disabled={generatingScenarioQuestionsId === s.id}
                                          className="btn btn-secondary px-2 py-1 text-xs"
                                        >
                                          {generatingScenarioQuestionsId === s.id
                                            ? 'Generating...'
                                            : questionSet?.status === 'failed'
                                              ? 'Retry'
                                              : 'Generate Questions'}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              ) : (
                                <ul className="space-y-2">
                                  {(questionSet.questions || []).map((q) => (
                                    <li key={q.sequence} className="p-2.5 bg-white dark:bg-future-elevated rounded-lg border border-mentor-border">
                                      <p className="text-xs font-medium text-mentor-text-muted mb-1">
                                        Step {q.sequence} — {labelizeCode(q.type)}
                                      </p>
                                      <p className="text-sm text-mentor-text mb-1.5">{q.questionText}</p>
                                      <div className="flex flex-wrap gap-1.5 mb-1">
                                        <span className="badge badge-neutral capitalize">{q.difficulty}</span>
                                        {q.targetCompetencies.map((c) => (
                                          <span key={c} className="badge badge-info">
                                            {c}
                                          </span>
                                        ))}
                                      </div>
                                      {q.evidenceExpected.length > 0 && (
                                        <p className="text-xs text-mentor-text-muted">
                                          Expected evidence: {q.evidenceExpected.join('; ')}
                                        </p>
                                      )}
                                      {q.scenarioUpdate && (
                                        <p className="text-xs text-mentor-warning mt-1">Scenario update: {q.scenarioUpdate}</p>
                                      )}

                                      {(() => {
                                        const session = scenarioSessionById[s.id];
                                        const response = session?.responses.find((r) => r.questionSequence === q.sequence);
                                        if (!response) {
                                          return <p className="text-xs text-mentor-text-muted mt-2">Not answered yet.</p>;
                                        }
                                        const stepKey = `${s.id}:${q.sequence}`;
                                        const evaluation = evaluationByStepKey[stepKey];
                                        return (
                                          <div className="mt-2 pt-2 border-t border-mentor-border">
                                            <p className="text-xs text-mentor-text-muted mb-1">
                                              Response: {response.answerText}
                                            </p>
                                            <p className="text-xs font-medium text-mentor-text-muted mb-1">Response Evaluation</p>
                                            {evaluationLoadingByStepKey[stepKey] ? (
                                              <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                            ) : !evaluation || !evaluation.evaluated ? (
                                              <div>
                                                {(evaluation?.status === 'failed' || evaluationErrorByStepKey[stepKey]) && (
                                                  <p className="text-xs text-mentor-error mb-1">
                                                    {evaluation?.errorMessage || evaluationErrorByStepKey[stepKey] || 'Evaluation failed.'}
                                                  </p>
                                                )}
                                                {evaluation?.status === 'processing' ? (
                                                  <p className="text-xs text-mentor-text-secondary">Evaluating...</p>
                                                ) : (
                                                  canManage && (
                                                    <button
                                                      onClick={() => handleGenerateScenarioResponseEvaluation(s.id, q.sequence)}
                                                      disabled={evaluatingStepKey === stepKey}
                                                      className="btn btn-secondary px-2 py-1 text-xs"
                                                    >
                                                      {evaluatingStepKey === stepKey
                                                        ? 'Evaluating...'
                                                        : evaluation?.status === 'failed'
                                                          ? 'Retry'
                                                          : 'Evaluate Response'}
                                                    </button>
                                                  )
                                                )}
                                              </div>
                                            ) : (
                                              <div className="space-y-1">
                                                <div className="flex flex-wrap gap-1.5">
                                                  <span className="badge badge-neutral">
                                                    Relevance: {labelizeCode(evaluation.responseAssessment?.relevance)}
                                                  </span>
                                                  <span className="badge badge-neutral">
                                                    Reasoning: {labelizeCode(evaluation.responseAssessment?.reasoningQuality)}
                                                  </span>
                                                  <span className="badge badge-neutral">
                                                    Decision: {labelizeCode(evaluation.responseAssessment?.decisionClarity)}
                                                  </span>
                                                  <span className="badge badge-neutral">
                                                    Constraints: {labelizeCode(evaluation.responseAssessment?.constraintAwareness)}
                                                  </span>
                                                </div>
                                                {(evaluation.competencyEvidence || []).map((ce) => (
                                                  <p key={ce.competencyName} className="text-xs text-mentor-text-secondary">
                                                    {ce.competencyName}: {labelizeCode(ce.evidenceState)}
                                                    {ce.evidence.length > 0 && ` — ${ce.evidence.join('; ')}`}
                                                    {ce.missingEvidence.length > 0 && ` (missing: ${ce.missingEvidence.join('; ')})`}
                                                  </p>
                                                ))}
                                                {evaluation.evidenceSummary && (
                                                  <p className="text-xs text-mentor-text-muted">{evaluation.evidenceSummary}</p>
                                                )}
                                                {evaluation.followUpUseful && (
                                                  <p className="text-xs text-mentor-warning">
                                                    Follow-up may be useful{evaluation.followUpReason ? `: ${evaluation.followUpReason}` : ''}
                                                  </p>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <div className="mt-3 pt-3 border-t border-mentor-border">
                                <p className="text-xs font-medium text-mentor-text-muted mb-1">Scenario Performance Report</p>
                                <p className="text-[11px] text-mentor-text-muted mb-2">
                                  Deterministic evidence coverage aggregate — not a hiring recommendation, ranking, or
                                  performance score.
                                </p>

                                {scenarioReportLoadingById[s.id] ? (
                                  <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
                                ) : scenarioReportErrorById[s.id] ? (
                                  <div>
                                    <p className="text-xs text-mentor-error mb-1">{scenarioReportErrorById[s.id]}</p>
                                    <button onClick={() => fetchScenarioReport(s.id)} className="btn btn-secondary px-2 py-1 text-xs">
                                      Try Again
                                    </button>
                                  </div>
                                ) : !scenarioReportById[s.id] || !scenarioReportById[s.id].built ? (
                                  <div>
                                    <p className="text-xs text-mentor-text-secondary mb-2">Not available.</p>
                                    {canManage && (
                                      <>
                                        {buildScenarioReportErrorById[s.id] && (
                                          <p className="text-xs text-mentor-error mb-1">{buildScenarioReportErrorById[s.id]}</p>
                                        )}
                                        <button
                                          onClick={() => handleBuildScenarioReport(s.id)}
                                          disabled={buildingScenarioReportId === s.id}
                                          className="btn btn-secondary px-2 py-1 text-xs"
                                        >
                                          {buildingScenarioReportId === s.id ? 'Building...' : 'Build Report'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  (() => {
                                    const report = scenarioReportById[s.id];
                                    const exec = report.execution!;
                                    const cov = report.coverage!;
                                    const signals = report.responseSignals!;
                                    const followUp = report.followUp!;
                                    const summary = report.summary!;
                                    const signalRows: Array<[string, { strong: number; sufficient: number; limited: number; insufficient: number }]> = [
                                      ['Relevance', signals.relevance],
                                      ['Reasoning Quality', signals.reasoningQuality],
                                      ['Decision Clarity', signals.decisionClarity],
                                      ['Constraint Awareness', signals.constraintAwareness],
                                    ];

                                    return (
                                      <div className="space-y-3">
                                        {canManage && (
                                          <div>
                                            {buildScenarioReportErrorById[s.id] && (
                                              <p className="text-xs text-mentor-error mb-1">{buildScenarioReportErrorById[s.id]}</p>
                                            )}
                                            <button
                                              onClick={() => handleBuildScenarioReport(s.id)}
                                              disabled={buildingScenarioReportId === s.id}
                                              className="btn btn-secondary px-2 py-1 text-xs"
                                            >
                                              {buildingScenarioReportId === s.id ? 'Rebuilding...' : 'Rebuild Report'}
                                            </button>
                                          </div>
                                        )}

                                        <p className="text-xs text-mentor-text-secondary">
                                          {exec.answeredSteps} of {exec.totalSteps} steps answered &middot; {exec.evaluatedSteps} of{' '}
                                          {exec.answeredSteps} responses evaluated &middot; {exec.completed ? 'Completed' : 'In progress'}
                                          {exec.durationSeconds !== undefined && ` · ${Math.round(exec.durationSeconds / 60)} min`}
                                        </p>

                                        <p className="text-xs text-mentor-text-secondary">
                                          Evidence Coverage: {cov.observedCompetencyCount}/{cov.targetCompetencyCount} competencies (
                                          {cov.coveragePercent}%) &middot; {cov.missingCompetencyCount} missing
                                        </p>

                                        <div>
                                          <p className="text-[11px] font-medium text-mentor-text-muted mb-1">Competency Evidence</p>
                                          <ul className="space-y-1">
                                            {(report.competencyEvidence || []).map((c) => (
                                              <li key={c.competencyName} className="text-xs text-mentor-text-secondary">
                                                <span className="font-medium text-mentor-text">{c.competencyName}</span>:{' '}
                                                {labelizeCode(c.overallEvidenceState)} ({c.evaluatedStepCount} evaluated)
                                                {c.evidence.length > 0 && <span className="block text-mentor-text-muted">Evidence: {c.evidence.join('; ')}</span>}
                                                {c.missingEvidence.length > 0 && (
                                                  <span className="block text-mentor-text-muted">Missing: {c.missingEvidence.join('; ')}</span>
                                                )}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>

                                        <div>
                                          <p className="text-[11px] font-medium text-mentor-text-muted mb-1">Response Signals</p>
                                          <ul className="space-y-0.5">
                                            {signalRows.map(([label, counts]) => (
                                              <li key={label} className="text-xs text-mentor-text-secondary">
                                                {label}: strong {counts.strong} &middot; sufficient {counts.sufficient} &middot; limited{' '}
                                                {counts.limited} &middot; insufficient {counts.insufficient}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>

                                        <p className="text-xs text-mentor-text-secondary">
                                          Follow-up Need: {followUp.usefulCount} useful &middot; {followUp.notUsefulCount} not useful
                                          {followUp.reasons.length > 0 && ` — ${followUp.reasons.join('; ')}`}
                                        </p>

                                        {summary.strengths.length > 0 && (
                                          <p className="text-xs text-mentor-success">{summary.strengths.join(' ')}</p>
                                        )}
                                        {summary.evidenceGaps.length > 0 && (
                                          <p className="text-xs text-mentor-warning">{summary.evidenceGaps.join(' ')}</p>
                                        )}
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerApplicationDetailPage;
