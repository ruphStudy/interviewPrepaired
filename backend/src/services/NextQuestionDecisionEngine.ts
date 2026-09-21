/**
 * Phase 3 ("Next Question Decision Engine") of the answer-aware-interviewer
 * effort — decides WHAT KIND of question should come next (follow up on
 * this answer? probe a claim? clarify a contradiction? switch competency?
 * just continue the blueprint?) so the existing AI question generator
 * (OpenAIService.generateQuestion) can be given an explicit, constrained
 * target instead of a loose "priority competency" hint.
 *
 * `decideNextMove` is PURE, SYNCHRONOUS and DETERMINISTIC — it makes no AI
 * calls and has no randomness; identical input always produces identical
 * output. It reuses, rather than reimplements, everything that already
 * exists: Phase 2's `IAnswerSignal` (already computed before this runs),
 * the real `claimVerification`/`contradictionTracking` records,
 * `CoverageTrackerService` (coverage math), and `DifficultyManagerService`
 * (level adjustment — this engine only expresses a soft *intent*, it never
 * touches `difficultyTracking.currentLevel` itself).
 *
 * This module also hosts the integration glue used by both call sites
 * (`InterviewService.submitAnswer` and
 * `InterviewAnswerOrchestratorService.generateRecoveryQuestion`):
 * `buildMoveDirective`, `questionPlausiblyTargetsMove`,
 * `generateQuestionForMove`, and `buildQuestionTaggingFromMove` — so the
 * "decide -> constrain the prompt -> validate -> tag" sequence lives in one
 * place instead of being duplicated at each call site.
 */

import { IQuestion } from '../models/interview.model';
import { IVerifiableClaim, ClaimType } from '../models/ClaimVerification.model';
import { IContradiction } from '../models/ContradictionTracking.model';
import { ICompetencyCoverage, ICompetencyCoverageItem } from '../models/CompetencyCoverage.model';
import { ICompetency } from '../models/InterviewBlueprint.model';
import { IDifficultyTracking } from '../models/DifficultyTracking.model';
import { IAnswerSignal, AnswerQuality, FollowUpOpportunityType } from '../constants/answerSignal';
import { detectConcepts } from '../constants/conceptRegistry';
import { QuestionSource } from '../constants/interview';
import {
  INextInterviewMove,
  NextInterviewMoveType,
  DifficultyIntent,
  DecisionReasonCode,
  FOLLOW_UP_FAMILY_MOVE_TYPES,
  questionSourceForMoveType,
} from '../constants/nextQuestionDecision';
import { nextQuestionDecisionConfig, NextQuestionDecisionConfig } from '../config/nextQuestionDecisionConfig';
import { QuestionRequest, QuestionResponse } from './OpenAIService';

// ============================================================================
// Decision context — only what the engine needs, bundled by the caller from
// data that's already computed/persisted-in-flight by the time this runs.
// ============================================================================

export interface DecisionContext {
  /** 1-based number of the question that was JUST answered (interview.currentQuestion at call time, before increment). */
  currentQuestionNumber: number;
  totalQuestions: number;
  competencyCoverage?: ICompetencyCoverage;
  /** Blueprint competencies (for weight-aware target selection) — optional; falls back to equal weighting when absent. */
  blueprintCompetencies?: ICompetency[];
  /** This turn's already-computed Phase 2 answer signal. Undefined for the very first question / a legacy question with none — the engine degrades safely, never throws. */
  answerSignal?: IAnswerSignal;
  /** The competencyName tag (Phase 1) of the question that was just answered. */
  currentQuestionCompetency?: string;
  /** ALL claims on the interview (not pre-filtered) — the engine does its own meaningful/unresolved filtering so callers don't duplicate that logic. */
  claims?: IVerifiableClaim[];
  /** ALL contradictions on the interview (not pre-filtered), same reasoning. */
  contradictions?: IContradiction[];
  difficultyTracking?: IDifficultyTracking;
  /** interview.questions as persisted so far (includes the just-answered one) — used for repetition/history scanning. */
  questionHistory: IQuestion[];
  interviewMode?: 'ai-generated' | 'uploaded';
}

interface Candidate {
  moveType: NextInterviewMoveType;
  score: number;
  reasonCode: DecisionReasonCode;
  targetCompetency?: string;
  targetConcept?: string;
  sourceQuestionIndex?: number;
  followUpType?: FollowUpOpportunityType;
  candidateClaimReference?: string;
  contradictionReference?: string;
  memoryReference?: string;
  sourcePhraseReference?: string;
}

// ============================================================================
// Coverage bands (3C) — pure derivation from coveragePercentage, no new
// persisted state.
// ============================================================================

export type CoverageBand = 'UNTOUCHED' | 'LOW' | 'PARTIAL' | 'SUFFICIENT' | 'DEEP';

export function deriveCoverageBand(coveragePercentage: number, config: NextQuestionDecisionConfig = nextQuestionDecisionConfig): CoverageBand {
  if (coveragePercentage <= 0) return 'UNTOUCHED';
  if (coveragePercentage < config.coverageLowThreshold) return 'LOW';
  if (coveragePercentage < config.coverageSufficientThreshold) return 'PARTIAL';
  if (coveragePercentage < config.coverageDeepThreshold) return 'SUFFICIENT';
  return 'DEEP';
}

// ============================================================================
// Scoring weights — documented base scores per move type. Tiers are chosen
// so that, in the common case with no penalties/bonuses applied, the
// natural priority order is: contradiction > claim > direct follow-up >
// clarify > scenario/challenge > memory-callback > switch/continue-
// blueprint. Fine-grained modifiers (opportunity priority, severity,
// confidence, coverage gap, repetition, budget pressure) then adjust within
// and across tiers — see decideNextMove.
// ============================================================================

const BASE_SCORE: Record<NextInterviewMoveType, number> = {
  CONTRADICTION_PROBE: 1000,
  CLAIM_PROBE: 900,
  FOLLOW_UP: 700,
  DEEPEN: 680,
  CLARIFY: 650,
  SCENARIO: 600,
  CHALLENGE_ASSUMPTION: 600,
  MEMORY_CALLBACK: 250, // deliberately low so novelty alone never wins
  SWITCH_COMPETENCY: 500,
  CONTINUE_BLUEPRINT: 400,
};

const OPPORTUNITY_TYPE_TO_MOVE_TYPE: Partial<Record<FollowUpOpportunityType, NextInterviewMoveType>> = {
  deepen: 'DEEPEN',
  clarify: 'CLARIFY',
  practical_example: 'SCENARIO',
  edge_case: 'SCENARIO',
  failure_scenario: 'SCENARIO',
  tradeoff: 'CHALLENGE_ASSUMPTION',
  // claim_verification / contradiction_clarification opportunity hints are
  // intentionally NOT mapped here — the richer claimVerification/
  // contradictionTracking records (severity, verificationStatus,
  // followUpAsked/clarificationAsked) drive CLAIM_PROBE/CONTRADICTION_PROBE
  // directly below, so the compressed opportunity hint is never
  // double-counted.
};

const SOFT_PROBE_MOVE_TYPES: NextInterviewMoveType[] = ['FOLLOW_UP', 'DEEPEN', 'CLARIFY', 'SCENARIO', 'CHALLENGE_ASSUMPTION', 'MEMORY_CALLBACK'];

const MEANINGFUL_CLAIM_TYPES = new Set<ClaimType>(['achievement', 'leadership', 'technical', 'quantitative']);

function truncate(value: string | undefined, max = 160): string | undefined {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function deriveFollowUpReasonCode(quality: AnswerQuality, repeated: boolean): DecisionReasonCode {
  if (repeated) return 'repetition_penalty';
  if (quality === 'weak' || quality === 'unusable') return 'answer_vague';
  if (quality === 'partial') return 'answer_shallow';
  return 'strong_followup_opportunity';
}

function deriveDifficultyIntent(signal?: IAnswerSignal): DifficultyIntent {
  if (!signal) return 'same';
  if (signal.isNoAnswer || signal.isOffTopic) return 'easier';
  if (signal.quality === 'weak' || signal.quality === 'unusable') return 'easier';
  if (signal.quality === 'strong' && signal.depth === 'deep') return 'harder';
  return 'same';
}

/**
 * Trailing streak (from the end of history) of consecutive questions that
 * were THEMSELVES generated as FOLLOW_UP-family moves — i.e. how many
 * follow-ups deep the current line of questioning already is. Each
 * follow-up's own `sourceQuestionIndex` always points at the single
 * question immediately preceding it (the one it reacted to), so a chain of
 * N follow-ups has N different sourceQuestionIndex values; the CAP is
 * therefore enforced on this consecutive-streak, not on a single shared
 * index — "no more than maxFollowUpsPerQuestion follow-ups in a row before
 * forcing blueprint/coverage progression".
 */
function countConsecutiveFollowUpFamilyMoves(history: IQuestion[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const decision = history[i].decision;
    if (decision && FOLLOW_UP_FAMILY_MOVE_TYPES.includes(decision.moveType)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/** Trailing streak of consecutive questions (from the end of history) sharing the same competencyName. */
function countConsecutiveSameCompetency(history: IQuestion[]): { competency?: string; streak: number } {
  let streak = 0;
  let competency: string | undefined;
  for (let i = history.length - 1; i >= 0; i--) {
    const name = history[i].competencyName;
    if (!name) break;
    if (competency === undefined) {
      competency = name;
      streak = 1;
    } else if (name === competency) {
      streak++;
    } else {
      break;
    }
  }
  return { competency, streak };
}

/** Canonical concept-registry keys mentioned across the last `window` questions' own answer signals. */
function getRecentConcepts(history: IQuestion[], window: number): string[] {
  const recent = history.slice(-window);
  const concepts: string[] = [];
  for (const q of recent) {
    concepts.push(...(q.answerSignal?.concepts || []));
  }
  return concepts;
}

/** Whether the opportunity's topic text mentions a concept that already showed up >=2 times recently. */
function opportunityRepetitionPenalty(topic: string, recentConcepts: string[]): boolean {
  const oppConcepts = detectConcepts(topic || '');
  if (oppConcepts.length === 0) return false;
  return oppConcepts.some((concept) => recentConcepts.filter((c) => c === concept).length >= 2);
}

function questionsSinceLastMemoryCallback(history: IQuestion[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].decision?.moveType === 'MEMORY_CALLBACK') return history.length - 1 - i;
  }
  return Infinity;
}

/**
 * Trailing streak (from the end of history) of consecutive persisted
 * `decision.difficultyIntent` values — used by anti-oscillation smoothing
 * (4C) to avoid an immediate harder-after-easier (or vice versa) flip.
 * Reuses the SAME persisted field `buildQuestionTaggingFromMove` already
 * writes on every question — no second/parallel tracking state.
 */
function lastPersistedDifficultyIntent(history: IQuestion[]): DifficultyIntent | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const intent = history[i].decision?.difficultyIntent;
    if (intent) return intent;
  }
  return undefined;
}

// ============================================================================
// Phase 4 (4B) — lightweight "production dimension" hints for SCENARIO
// content variation. Keyed by the SAME canonical concept-registry keys
// AnswerSignalService/detectConcepts already use — never a rigid
// per-technology hardcode, just a small applied-per-topic lookup. Falls back
// to a generic production-edge-case framing when the concept/competency
// isn't recognized.
// ============================================================================
const PRODUCTION_DIMENSION_HINTS: Record<string, string> = {
  redis: 'what happens when the cache becomes stale or briefly unavailable',
  caching: 'what happens when the cache becomes stale or briefly unavailable',
  cdn: 'stale content being served right after a deploy',
  kafka: 'a message being delivered twice or out of order',
  rabbitmq: 'a message being delivered twice or out of order',
  queues: 'a message being delivered twice or out of order',
  eventDriven: 'a message being delivered twice or out of order',
  asyncProcessing: 'a background job failing partway through and needing retry',
  mongodb: 'a data-consistency issue or race condition under concurrent writes',
  postgresql: 'a data-consistency issue or race condition under concurrent writes',
  mysql: 'a data-consistency issue or race condition under concurrent writes',
  transactions: 'a data-consistency issue or race condition under concurrent writes',
  sharding: 'one shard/partition receiving uneven load in production',
  replication: 'replica lag or a failover between primary and replica',
  scaling: 'a sudden spike in traffic and how the system holds up',
  loadBalancing: 'one backend node failing while traffic keeps flowing',
  microservices: 'one downstream service being slow or unavailable',
  circuitBreaker: 'a downstream dependency failing repeatedly',
  authentication: 'a compromised credential or an authentication outage',
  authorization: 'a permission being wrongly granted or denied',
  observability: 'a production incident with little visibility into the cause',
  rateLimiting: 'a burst of traffic that needs to be throttled',
  kubernetes: 'a pod being evicted or restarted mid-request',
  docker: 'a container running out of memory under load',
};

function deriveProductionDimensionHint(targetConcept?: string, targetCompetency?: string): string {
  const candidates = [...detectConcepts(targetConcept || ''), ...detectConcepts(targetCompetency || '')];
  for (const key of candidates) {
    if (PRODUCTION_DIMENSION_HINTS[key]) return PRODUCTION_DIMENSION_HINTS[key];
  }
  return 'one realistic production edge case relevant to what they just described';
}

// ============================================================================
// The engine
// ============================================================================

export class NextQuestionDecisionEngine {
  /**
   * PURE, SYNCHRONOUS, DETERMINISTIC. Never throws on missing/legacy data —
   * an undefined `answerSignal`/`competencyCoverage`/empty `questionHistory`
   * degrades to "no strong opportunity, continue the blueprint" rather than
   * erroring.
   */
  decideNextMove(context: DecisionContext, config: NextQuestionDecisionConfig = nextQuestionDecisionConfig): INextInterviewMove {
    const history = context.questionHistory || [];
    const remainingBudget = Math.max(0, context.totalQuestions - context.currentQuestionNumber);
    const currentSourceIndex = context.currentQuestionNumber - 1;
    const signal = context.answerSignal;

    // ------------------------------------------------------------------
    // NO_ANSWER / OFF_TOPIC — safe-progression guard. Redirect ONCE (a
    // single CLARIFY), never twice in a row: if the question just answered
    // was ITSELF a clarify issued for the same reason and the candidate
    // still didn't engage, fall through to plain coverage/blueprint
    // progression instead of trapping them in a clarify loop.
    // ------------------------------------------------------------------
    if (signal?.isNoAnswer || signal?.isOffTopic) {
      const reasonCode: DecisionReasonCode = signal.isNoAnswer ? 'no_answer' : 'off_topic';
      const currentQ = history[currentSourceIndex];
      const alreadyRedirected = currentQ?.decision?.moveType === 'CLARIFY' && currentQ?.decision?.reasonCode === reasonCode;

      if (!alreadyRedirected) {
        return this.finalizeMove(
          {
            moveType: 'CLARIFY',
            score: 0,
            reasonCode,
            targetCompetency: context.currentQuestionCompetency,
            sourceQuestionIndex: currentSourceIndex,
          },
          context,
          remainingBudget,
          history
        );
      }

      const coverageOnly = this.buildCoverageCandidates(context, remainingBudget, history, config);
      const fallbackWinner: Candidate = coverageOnly[0] || { moveType: 'CONTINUE_BLUEPRINT', score: 0, reasonCode: 'blueprint_progression' };
      return this.finalizeMove(fallbackWinner, context, remainingBudget, history);
    }

    // ------------------------------------------------------------------
    // General candidate collection
    // ------------------------------------------------------------------
    const candidates: Candidate[] = [];
    if (signal) {
      candidates.push(...this.buildFollowUpCandidates(context, signal, history, currentSourceIndex, config));
      candidates.push(...this.buildScenarioCandidates(context, signal, history, currentSourceIndex, remainingBudget, config));
      candidates.push(...this.buildClaimCandidates(context, history, config));
      candidates.push(...this.buildContradictionCandidates(context, history));
      candidates.push(...this.buildMemoryCallbackCandidates(signal, history, currentSourceIndex, config));
    }
    candidates.push(...this.buildCoverageCandidates(context, remainingBudget, history, config));

    // Budget pressure: as the interview runs low on remaining questions,
    // discount "nice to have" probing and favor guaranteed blueprint
    // coverage. Claims/contradictions are NOT discounted — verification
    // integrity matters regardless of how many questions remain.
    if (remainingBudget <= config.lowBudgetThreshold) {
      for (const c of candidates) this.applyBudgetPressure(c, config);
    }

    let winner: Candidate | undefined;
    for (const c of candidates) {
      if (!winner || c.score > winner.score) winner = c;
    }
    if (!winner) winner = { moveType: 'CONTINUE_BLUEPRINT', score: 0, reasonCode: 'blueprint_progression' };

    return this.finalizeMove(winner, context, remainingBudget, history);
  }

  private buildFollowUpCandidates(
    context: DecisionContext,
    signal: IAnswerSignal,
    history: IQuestion[],
    currentSourceIndex: number,
    config: NextQuestionDecisionConfig
  ): Candidate[] {
    // Hard cap — once the current line of questioning already has
    // maxFollowUpsPerQuestion consecutive follow-ups, it is fully
    // disqualified from getting another one, not merely penalized.
    if (countConsecutiveFollowUpFamilyMoves(history) >= config.maxFollowUpsPerQuestion) return [];

    const recentConcepts = getRecentConcepts(history, config.recentConceptWindow);
    const out: Candidate[] = [];
    for (const opp of signal.followUpOpportunities) {
      const moveType = OPPORTUNITY_TYPE_TO_MOVE_TYPE[opp.type];
      if (!moveType) continue;
      const repeated = opportunityRepetitionPenalty(opp.topic, recentConcepts);
      const targetCompetency = opp.relatedCompetency || context.currentQuestionCompetency;
      let score = BASE_SCORE[moveType] + opp.priority;
      if (repeated) score -= config.repetitionPenalty;
      score -= this.overCoveragePenalty(targetCompetency, context, config);
      out.push({
        moveType,
        score,
        reasonCode: deriveFollowUpReasonCode(signal.quality, repeated),
        targetCompetency,
        targetConcept: opp.topic,
        followUpType: opp.type,
        sourceQuestionIndex: currentSourceIndex,
        sourcePhraseReference: opp.sourcePhrase,
      });
    }
    return out;
  }

  /**
   * Phase 4 (4B) — SCENARIO/CHALLENGE_ASSUMPTION (production/tradeoff)
   * probing, driven directly by this turn's signal + coverage/budget context
   * rather than by a pre-extracted follow-up opportunity (AnswerSignalService
   * never emits practical_example/edge_case/failure_scenario/tradeoff
   * opportunities today — see the module comment). Folded into the SAME
   * candidate-array/highest-score-wins comparison `decideNextMove` already
   * runs, never a second scoring path.
   *
   * Eligibility (per the master prompt): quality strong/adequate AND (a
   * claim hint suggests production experience OR the competency is
   * high-priority/high-weight) AND budget allows it AND the competency isn't
   * already over-covered. Weak/unusable answers and low-budget-with-gaps are
   * both hard-excluded, not merely penalized.
   */
  private buildScenarioCandidates(
    context: DecisionContext,
    signal: IAnswerSignal,
    history: IQuestion[],
    currentSourceIndex: number,
    remainingBudget: number,
    config: NextQuestionDecisionConfig
  ): Candidate[] {
    if (countConsecutiveFollowUpFamilyMoves(history) >= config.maxFollowUpsPerQuestion) return [];
    if (signal.quality !== 'strong' && signal.quality !== 'adequate') return [];
    if (remainingBudget <= config.lowBudgetThreshold) return [];

    const targetCompetency = context.currentQuestionCompetency;
    const coverageItem = targetCompetency
      ? context.competencyCoverage?.items.find((i) => i.competencyName === targetCompetency)
      : undefined;
    const band = coverageItem ? deriveCoverageBand(coverageItem.coveragePercentage, config) : undefined;
    if (band === 'SUFFICIENT' || band === 'DEEP') return []; // already well-covered — not low-value to probe further here

    const weight = targetCompetency
      ? (context.blueprintCompetencies || []).find((c) => c.name === targetCompetency)?.weight
      : undefined;
    const isHighPriorityCompetency = weight !== undefined && weight >= config.scenarioHighPriorityWeightThreshold;
    const hasProductionClaimHint = signal.claimHints.length > 0;
    if (!hasProductionClaimHint && !isHighPriorityCompetency) return [];

    const bonus =
      (signal.quality === 'strong' ? config.scenarioStrongQualityBonus : 0) +
      (hasProductionClaimHint ? config.scenarioProductionClaimBonus : 0) +
      (isHighPriorityCompetency ? config.scenarioHighPriorityCompetencyBonus : 0);

    const targetConcept = signal.concepts[0];
    const out: Candidate[] = [
      {
        moveType: 'SCENARIO',
        score: BASE_SCORE.SCENARIO + bonus,
        reasonCode: 'strong_followup_opportunity',
        targetCompetency,
        targetConcept,
        // 'deep' answers earn the heavier production-failure framing; a
        // merely-adequate one gets the lighter single-edge-condition ask —
        // still content-variation within the SAME SCENARIO move type.
        followUpType: signal.depth === 'deep' ? 'failure_scenario' : 'edge_case',
        sourceQuestionIndex: currentSourceIndex,
      },
    ];

    // Tradeoff/assumption-challenge is only worth also offering when the
    // answer was genuinely deep (there's an actual design choice to
    // interrogate) — scored a notch below SCENARIO so SCENARIO is the
    // default production probe when both are eligible.
    if (signal.depth === 'deep') {
      out.push({
        moveType: 'CHALLENGE_ASSUMPTION',
        score: BASE_SCORE.CHALLENGE_ASSUMPTION + bonus - 10,
        reasonCode: 'strong_followup_opportunity',
        targetCompetency,
        targetConcept,
        followUpType: 'tradeoff',
        sourceQuestionIndex: currentSourceIndex,
      });
    }

    return out;
  }

  /** Shared by every follow-up-family candidate builder — see `competencyOverCoveragePenalty`'s doc comment. */
  private overCoveragePenalty(targetCompetency: string | undefined, context: DecisionContext, config: NextQuestionDecisionConfig): number {
    if (!targetCompetency) return 0;
    const item = context.competencyCoverage?.items.find((i) => i.competencyName === targetCompetency);
    if (!item) return 0;
    const band = deriveCoverageBand(item.coveragePercentage, config);
    if (band === 'DEEP') return config.competencyOverCoveragePenalty * 1.5;
    if (band === 'SUFFICIENT') return config.competencyOverCoveragePenalty;
    return 0;
  }

  private buildClaimCandidates(context: DecisionContext, history: IQuestion[], config: NextQuestionDecisionConfig): Candidate[] {
    const out: Candidate[] = [];
    for (const claim of context.claims || []) {
      // followUpAsked is the existing (Phase-pre-3) idempotency flag on the
      // claim record itself — reused here, never re-derived. Callers set it
      // once this engine's CLAIM_PROBE move is actually acted on.
      if (claim.followUpAsked) continue;
      if (!MEANINGFUL_CLAIM_TYPES.has(claim.claimType)) continue; // skip trivial timeline/responsibility wording
      if (claim.confidence < config.minClaimConfidenceToProbe) continue;

      const claimSourceIndex = claim.questionNumber - 1;
      out.push({
        moveType: 'CLAIM_PROBE',
        score: BASE_SCORE.CLAIM_PROBE + (claim.confidence - config.minClaimConfidenceToProbe),
        reasonCode: 'unresolved_claim',
        targetCompetency: history[claimSourceIndex]?.competencyName || context.currentQuestionCompetency,
        candidateClaimReference: truncate(claim.claim),
        sourceQuestionIndex: claimSourceIndex,
      });
    }
    return out;
  }

  private buildContradictionCandidates(context: DecisionContext, history: IQuestion[]): Candidate[] {
    const out: Candidate[] = [];
    for (const c of context.contradictions || []) {
      if (c.resolved || c.clarificationAsked) continue;
      if (c.severity === 'minor') continue; // only moderate|major|critical — confidence must be sufficiently strong
      const severityBonus = c.severity === 'critical' ? 60 : c.severity === 'major' ? 30 : 0;
      const contradictionSourceIndex = c.questionNumber2 - 1;
      out.push({
        moveType: 'CONTRADICTION_PROBE',
        score: BASE_SCORE.CONTRADICTION_PROBE + severityBonus,
        reasonCode: 'contradiction_detected',
        targetCompetency: history[contradictionSourceIndex]?.competencyName || context.currentQuestionCompetency,
        contradictionReference: truncate(c.contradiction),
        sourceQuestionIndex: contradictionSourceIndex,
      });
    }
    return out;
  }

  private buildMemoryCallbackCandidates(
    signal: IAnswerSignal,
    history: IQuestion[],
    currentSourceIndex: number,
    config: NextQuestionDecisionConfig
  ): Candidate[] {
    if (!signal.concepts || signal.concepts.length === 0) return [];
    if (questionsSinceLastMemoryCallback(history) < config.memoryCallbackMinGap) return []; // frequency cap — novelty never dominates

    const conceptSet = new Set(signal.concepts);
    const currentCompetency = history[currentSourceIndex]?.competencyName;
    // Look only at genuinely OLDER questions (skip the one just answered) so
    // this is a real callback, not a restatement of what was just discussed.
    for (let i = 0; i < currentSourceIndex; i++) {
      const q = history[i];
      // Defensive — `history` is caller-supplied and, per this module's
      // "never throws on missing/legacy data" contract, must degrade safely
      // even if it's ever shorter than `currentSourceIndex` implies.
      if (!q) continue;
      const overlap = (q.answerSignal?.concepts || []).find((c) => conceptSet.has(c));
      if (overlap && q.competencyName && q.competencyName !== currentCompetency) {
        return [
          {
            moveType: 'MEMORY_CALLBACK',
            score: BASE_SCORE.MEMORY_CALLBACK,
            reasonCode: 'strong_followup_opportunity',
            targetCompetency: q.competencyName,
            targetConcept: overlap,
            memoryReference: truncate(q.questionText),
            sourceQuestionIndex: i,
          },
        ];
      }
    }
    return [];
  }

  private buildCoverageCandidates(
    context: DecisionContext,
    remainingBudget: number,
    history: IQuestion[],
    config: NextQuestionDecisionConfig
  ): Candidate[] {
    const coverage = context.competencyCoverage;
    if (!coverage || coverage.items.length === 0) {
      return [{ moveType: 'CONTINUE_BLUEPRINT', score: BASE_SCORE.CONTINUE_BLUEPRINT, reasonCode: 'blueprint_progression' }];
    }

    const { competency: repeatedCompetency, streak } = countConsecutiveSameCompetency(history);
    const repetitionForcesSwitch = streak >= config.maxConsecutiveSameCompetency;

    const maxPerCompetency = Math.max(2, Math.ceil((context.totalQuestions / coverage.items.length) * config.maxQuestionsPerCompetencyMultiplier));
    let eligible = coverage.items.filter((item) => item.questionCount < maxPerCompetency);
    if (eligible.length === 0) eligible = coverage.items;
    if (repetitionForcesSwitch && repeatedCompetency) {
      const filtered = eligible.filter((item) => item.competencyName !== repeatedCompetency);
      if (filtered.length > 0) eligible = filtered;
    }

    const target = this.pickCoverageTarget(eligible, context.blueprintCompetencies);
    if (!target) return [];

    const band = deriveCoverageBand(target.coveragePercentage, config);
    const gapBonus = Math.round((100 - target.coveragePercentage) * 0.6);
    const isSwitch =
      !!context.currentQuestionCompetency &&
      context.currentQuestionCompetency !== target.competencyName &&
      (band === 'UNTOUCHED' || band === 'LOW' || repetitionForcesSwitch);
    const moveType: NextInterviewMoveType = isSwitch ? 'SWITCH_COMPETENCY' : 'CONTINUE_BLUEPRINT';

    const currentItem = context.currentQuestionCompetency
      ? coverage.items.find((i) => i.competencyName === context.currentQuestionCompetency)
      : undefined;
    const currentBand = currentItem ? deriveCoverageBand(currentItem.coveragePercentage, config) : undefined;

    let reasonCode: DecisionReasonCode;
    if (repetitionForcesSwitch) {
      reasonCode = 'repetition_penalty';
    } else if (isSwitch && (currentBand === 'SUFFICIENT' || currentBand === 'DEEP')) {
      reasonCode = 'competency_sufficiently_covered';
    } else if (isSwitch) {
      reasonCode = 'uncovered_high_priority_competency';
    } else if (remainingBudget <= config.lowBudgetThreshold) {
      reasonCode = 'question_budget_low';
    } else {
      const intent = deriveDifficultyIntent(context.answerSignal);
      reasonCode = intent === 'harder' ? 'difficulty_escalation' : intent === 'easier' ? 'difficulty_recovery' : 'blueprint_progression';
    }

    return [{ moveType, score: BASE_SCORE[moveType] + gapBonus, reasonCode, targetCompetency: target.competencyName }];
  }

  /**
   * Weight-aware refinement of CoverageTrackerService.getNextCompetencyToPrioritize:
   * when blueprint weights are unavailable, every item is weighted equally
   * and this reduces to the exact same "least covered, tie-break by
   * staleness" ordering that helper already implements — no behavioral
   * duplication, just an optional richer signal layered on top.
   */
  private pickCoverageTarget(items: ICompetencyCoverageItem[], competencies?: ICompetency[]): ICompetencyCoverageItem | undefined {
    if (items.length === 0) return undefined;
    const weightByName = new Map((competencies || []).map((c) => [c.name, c.weight]));
    const scored = items.map((item) => {
      const weight = weightByName.get(item.competencyName) ?? 100 / items.length;
      const gapScore = (100 - item.coveragePercentage) * (weight / 100);
      return { item, gapScore };
    });
    scored.sort((a, b) => {
      if (b.gapScore !== a.gapScore) return b.gapScore - a.gapScore;
      return (a.item.lastAssessed || 0) - (b.item.lastAssessed || 0);
    });
    return scored[0].item;
  }

  private applyBudgetPressure(candidate: Candidate, config: NextQuestionDecisionConfig): void {
    if (SOFT_PROBE_MOVE_TYPES.includes(candidate.moveType)) {
      candidate.score *= config.lowBudgetProbeDiscount;
    } else if (candidate.moveType === 'SWITCH_COMPETENCY' || candidate.moveType === 'CONTINUE_BLUEPRINT') {
      candidate.score += config.lowBudgetCoverageBonus;
    }
  }

  private finalizeMove(
    candidate: Candidate,
    context: DecisionContext,
    remainingBudget: number,
    history: IQuestion[] = context.questionHistory || []
  ): INextInterviewMove {
    return {
      moveType: candidate.moveType,
      targetCompetency: candidate.targetCompetency,
      targetConcept: candidate.targetConcept,
      sourceQuestionIndex: candidate.sourceQuestionIndex,
      reasonCode: candidate.reasonCode,
      priority: Math.round(candidate.score),
      difficultyIntent: this.resolveDifficultyIntent(candidate, context, history),
      followUpType: candidate.followUpType,
      candidateClaimReference: candidate.candidateClaimReference,
      contradictionReference: candidate.contradictionReference,
      memoryReference: candidate.memoryReference,
      sourcePhraseReference: candidate.sourcePhraseReference,
      remainingBudget,
      questionSource: questionSourceForMoveType(candidate.moveType),
    };
  }

  /**
   * Phase 4 (4C) — wraps the pure per-signal `deriveDifficultyIntent` with
   * three additional guardrails the master prompt requires, none of which
   * duplicate DifficultyManagerService's own (separate) currentLevel
   * tracking — this only ever expresses a soft per-turn INTENT:
   *  1. Never ramp difficulty across a competency switch — a strong answer
   *     in the competency being left behind says nothing about the next one.
   *  2. Anti-oscillation — don't flip straight from 'easier' to 'harder' (or
   *     vice versa) turn-to-turn; require a settling turn first. Reuses the
   *     already-persisted `decision.difficultyIntent` history, no second
   *     counter.
   *  3. Ceiling — never suggest 'harder' once difficultyTracking is already
   *     at the max level; there's nothing higher to ask for. The REAL
   *     interview-tier ceiling (relative to the configured starting
   *     difficulty) is enforced where `currentLevel` itself is computed —
   *     see DifficultyManagerService.calculateNewLevel.
   */
  private resolveDifficultyIntent(candidate: Candidate, context: DecisionContext, history: IQuestion[]): DifficultyIntent {
    let intent = deriveDifficultyIntent(context.answerSignal);
    if (intent === 'harder') {
      const isCompetencySwitch = candidate.moveType === 'SWITCH_COMPETENCY' || (!!context.currentQuestionCompetency && !!candidate.targetCompetency && candidate.targetCompetency !== context.currentQuestionCompetency);
      if (isCompetencySwitch) intent = 'same';
    }

    if (intent !== 'same') {
      const lastIntent = lastPersistedDifficultyIntent(history);
      const opposite: DifficultyIntent = intent === 'harder' ? 'easier' : 'harder';
      if (lastIntent === opposite) intent = 'same';
    }

    if (intent === 'harder' && context.difficultyTracking && context.difficultyTracking.currentLevel >= 5) {
      intent = 'same';
    }

    return intent;
  }
}

export const nextQuestionDecisionEngine = new NextQuestionDecisionEngine();

// ============================================================================
// Integration glue shared by both call sites (InterviewService.submitAnswer
// and InterviewAnswerOrchestratorService.generateRecoveryQuestion) — kept
// here so the "decide -> constrain prompt -> validate -> tag" sequence is
// defined exactly once.
// ============================================================================

// Phase 4 (4A/4B) — every builder below (a) grounds in the move's own
// reference field(s) instead of a generic template, (b) explicitly asks for
// ONE focused question (never a compound one), and (c) branches on
// `followUpType`/`reasonCode` where the SAME move type covers more than one
// sub-behavior — content variation within the existing taxonomy, never a
// new move type.
const MOVE_DIRECTIVE_BUILDERS: Partial<Record<NextInterviewMoveType, (move: INextInterviewMove) => string>> = {
  DEEPEN: (m) =>
    `Ask ONE focused follow-up question that probes deeper into how the candidate specifically structured/implemented "${m.targetConcept}"${m.targetCompetency ? ` within ${m.targetCompetency}` : ''}${m.sourcePhraseReference ? `, grounded in their own words: "${m.sourcePhraseReference}"` : ''}. Build directly on their previous answer — do not repeat the previous question, and ask only one question.`,
  CLARIFY: (m) =>
    m.reasonCode === 'no_answer'
      ? `The candidate did not answer the previous question. Ask a single, clear, more approachable clarifying question on the SAME topic — do not move to a new topic yet.`
      : m.reasonCode === 'off_topic'
        ? `The candidate's previous answer did not address the question asked. Politely redirect with a clearer, more specific version of the same question.`
        : `Ask the candidate what SPECIFICALLY they mean by "${m.targetConcept}"${m.sourcePhraseReference ? ` (they said: "${m.sourcePhraseReference}")` : ''}. Ask ONE clear, focused clarifying question — be specific about what is unclear, not multiple questions.`,
  FOLLOW_UP: (m) =>
    `Ask ONE direct follow-up question about "${m.targetConcept}"${m.targetCompetency ? ` within ${m.targetCompetency}` : ''}, building on the candidate's previous answer${m.sourcePhraseReference ? ` (they said: "${m.sourcePhraseReference}")` : ''}.`,
  SCENARIO: (m) => {
    if (m.followUpType === 'practical_example') {
      return `Ask the candidate for ONE concrete example of "${m.targetConcept || m.targetCompetency}" from their own real experience — not a hypothetical, something they actually did. Ask ONE focused question.`;
    }
    const dimension = deriveProductionDimensionHint(m.targetConcept, m.targetCompetency);
    return `Pose ONE concise, realistic production scenario question${m.targetConcept ? ` about "${m.targetConcept}"` : m.targetCompetency ? ` within ${m.targetCompetency}` : ''} — focus specifically on ${dimension}, and ask how their system would behave or what they would check first. Do NOT ask them to enumerate every possible failure — keep it to ONE specific situation, phrased as a single focused question.`;
  },
  CHALLENGE_ASSUMPTION: (m) =>
    m.followUpType === 'tradeoff'
      ? `Ask the candidate ONE focused question about what trade-off they made by choosing "${m.targetConcept}"${m.targetCompetency ? ` for ${m.targetCompetency}` : ''} — what did they give up, and would they choose differently under different constraints?`
      : `Respectfully ask the candidate ONE focused question about what would happen if a key assumption in their previous answer${m.targetConcept ? ` about "${m.targetConcept}"` : ''} no longer held.`,
  CLAIM_PROBE: (m) =>
    `Ask ONE focused question that asks the candidate to substantiate this specific claim with concrete specifics — the scale/bottleneck involved, their exact individual role, and a measurable outcome: "${m.candidateClaimReference}".`,
  CONTRADICTION_PROBE: (m) =>
    `Ask ONE neutral, non-accusatory clarifying question about this apparent inconsistency between two of the candidate's answers: ${m.contradictionReference}. Phrase it in the spirit of "Earlier you mentioned X, and here you mentioned Y — can you help me understand how those fit together?" — NEVER say "you contradicted yourself" or imply dishonesty.`,
  MEMORY_CALLBACK: (m) =>
    `Reference the candidate's earlier mention of "${m.targetConcept || m.memoryReference}" (they said: "${m.memoryReference}") and ask ONE new, focused question connecting it to the current topic${m.targetCompetency ? ` (${m.targetCompetency})` : ''} — do not repeat a question already asked.`,
  // SWITCH_COMPETENCY / CONTINUE_BLUEPRINT deliberately have no directive —
  // they keep using the existing priorityCompetency-based soft prompt
  // (OpenAIService.getQuestionUserPrompt), unchanged from pre-Phase-3.
};

// Phase 4 (4C) — feeds the engine's already-computed `difficultyIntent` into
// the actual generation constraint instead of leaving it computed-but-unused
// metadata. Appended uniformly to every move that has a directive, rather
// than duplicated per-move-type.
const DIFFICULTY_INTENT_CLAUSE: Partial<Record<DifficultyIntent, string>> = {
  harder: 'Raise the technical bar slightly versus the previous question — introduce an edge case, a trade-off, or deeper architectural reasoning.',
  easier: 'Keep this question approachable and focused on fundamentals — do not increase the technical bar.',
};

export function buildMoveDirective(move: INextInterviewMove, options?: { forceful?: boolean }): string | undefined {
  const builder = MOVE_DIRECTIVE_BUILDERS[move.moveType];
  if (!builder) return undefined;
  let text = builder(move);
  const difficultyClause = DIFFICULTY_INTENT_CLAUSE[move.difficultyIntent];
  if (difficultyClause) text += ` ${difficultyClause}`;
  if (!options?.forceful) return text;
  return `${text} This is critical: the question MUST explicitly and unambiguously address the above in this exact turn.`;
}

function significantWords(text: string | undefined): Set<string> {
  return new Set((text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

// Phase 4 — cheap, deterministic quality guards folded into the SAME
// validator/retry-then-degrade flow (never a second validator/retry loop).
const MIN_QUESTION_TEXT_LENGTH = 12;
const SCORING_LEAKAGE_PHRASES = [
  'good answer',
  'great answer',
  'bad answer',
  "that's wrong",
  'that is wrong',
  'you scored',
  'your score',
  'weak on this',
  'weak answer',
  'strong answer',
  'correct answer',
  'incorrect answer',
  'well done',
  "you're wrong",
  'you are wrong',
];
const NEAR_DUPLICATE_WINDOW = 5;
const NEAR_DUPLICATE_WORD_OVERLAP_RATIO = 0.85;

function containsScoringLeakage(questionText: string): boolean {
  const normalized = questionText.toLowerCase();
  return SCORING_LEAKAGE_PHRASES.some((phrase) => normalized.includes(phrase));
}

/** Soft heuristic (not a hard NLP parse): flags an obviously compound/multi-part question. */
function looksCompound(questionText: string): boolean {
  const questionMarks = (questionText.match(/\?/g) || []).length;
  if (questionMarks > 1) return true;
  if (questionMarks >= 1 && /\band also\b/i.test(questionText)) return true;
  return false;
}

/** Cheap normalized-text comparison against the last few questions — never semantic embeddings. */
function isNearDuplicateOfRecent(questionText: string, recentQuestionTexts: string[]): boolean {
  const normalized = questionText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;

  return recentQuestionTexts.slice(-NEAR_DUPLICATE_WINDOW).some((other) => {
    const otherNormalized = (other || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!otherNormalized) return false;
    if (otherNormalized === normalized) return true;

    const wordsA = new Set(normalized.split(' ').filter((w) => w.length >= 4));
    const wordsB = new Set(otherNormalized.split(' ').filter((w) => w.length >= 4));
    if (wordsA.size === 0 || wordsB.size === 0) return false;
    const shared = [...wordsA].filter((w) => wordsB.has(w)).length;
    return shared / Math.min(wordsA.size, wordsB.size) >= NEAR_DUPLICATE_WORD_OVERLAP_RATIO;
  });
}

/**
 * Cheap, deterministic output validation — never a second AI "judge" call.
 * ALWAYS checks basic generation-quality guards (non-trivially short,
 * no scoring/feedback leakage, not an obviously compound question, not a
 * near-duplicate of a recently-asked question); then, when the move has a
 * specific target, ALSO checks that the question plausibly hits it —
 * concept-level (a shared significant word or concept-registry key with
 * `targetConcept`/`candidateClaimReference`/`contradictionReference`/
 * `memoryReference`) when one is set, or competency-level (the question
 * plausibly relates to `targetCompetency`'s own words/concepts) when only a
 * competency is set and the move isn't an open SWITCH_COMPETENCY/
 * CONTINUE_BLUEPRINT progression move. Returns true whenever there's
 * nothing specific to validate beyond the basic guards.
 */
export function questionPlausiblyTargetsMove(questionText: string, move: INextInterviewMove, recentQuestionTexts: string[] = []): boolean {
  const trimmed = (questionText || '').trim();
  if (trimmed.length < MIN_QUESTION_TEXT_LENGTH) return false;
  if (containsScoringLeakage(trimmed)) return false;
  if (looksCompound(trimmed)) return false;
  if (isNearDuplicateOfRecent(trimmed, recentQuestionTexts)) return false;

  const reference = move.targetConcept || move.candidateClaimReference || move.contradictionReference || move.memoryReference;

  if (reference) {
    const refWords = significantWords(reference);
    if (refWords.size === 0) return true;

    const qWords = significantWords(trimmed);
    for (const w of refWords) {
      if (qWords.has(w)) return true;
    }

    if (move.targetConcept) {
      const qConcepts = new Set(detectConcepts(trimmed));
      const refConcepts = detectConcepts(move.targetConcept);
      if (refConcepts.some((c) => qConcepts.has(c))) return true;
    }

    return false;
  }

  // No concept/claim/contradiction/memory reference to anchor on. For an
  // open progression move (SWITCH_COMPETENCY/CONTINUE_BLUEPRINT) there is
  // nothing further to validate. SCENARIO/CHALLENGE_ASSUMPTION are also
  // exempted here — their directive already anchors on a production-
  // dimension/trade-off framing rather than literal concept wording, so
  // requiring a literal word/concept match would false-reject good,
  // naturally-phrased scenario questions. For any OTHER move that still
  // names a specific `targetCompetency` (e.g. a follow-up-family
  // opportunity whose topic text happened to be empty), require the
  // question to at least plausibly relate to that competency so it can't
  // silently wander onto an unrelated topic.
  if (
    move.targetCompetency &&
    move.moveType !== 'SWITCH_COMPETENCY' &&
    move.moveType !== 'CONTINUE_BLUEPRINT' &&
    move.moveType !== 'SCENARIO' &&
    move.moveType !== 'CHALLENGE_ASSUMPTION'
  ) {
    const compWords = significantWords(move.targetCompetency);
    if (compWords.size === 0) return true;

    const qWords = significantWords(trimmed);
    for (const w of compWords) {
      if (qWords.has(w)) return true;
    }

    const qConcepts = new Set(detectConcepts(trimmed));
    const compConcepts = detectConcepts(move.targetCompetency);
    if (compConcepts.some((c) => qConcepts.has(c))) return true;

    return false;
  }

  return true;
}

export interface QuestionTaggingFromMove {
  competencyName?: string;
  questionSource: QuestionSource;
  sourceReasonCode?: string;
  difficultyAtGeneration?: string;
  decision: {
    moveType: NextInterviewMoveType;
    reasonCode: DecisionReasonCode;
    priority: number;
    difficultyIntent: DifficultyIntent;
    targetConcept?: string;
    sourceQuestionIndex?: number;
  };
}

/**
 * Locates the exact claim/contradiction record a finalized CLAIM_PROBE /
 * CONTRADICTION_PROBE move referenced, so the caller can mark it
 * followUpAsked/clarificationAsked (via the existing
 * ClaimVerificationService.markFollowUpAsked /
 * ContradictionDetectorService.markClarificationAsked — reused, not
 * reimplemented) once the probe question is actually persisted. Matching is
 * done against the SAME truncated text the engine put on the move, so it
 * stays correct even when the source text exceeds the 160-char bound.
 */
export function findClaimForMove(claims: IVerifiableClaim[], move: INextInterviewMove): IVerifiableClaim | undefined {
  if (move.moveType !== 'CLAIM_PROBE' || !move.candidateClaimReference) return undefined;
  return claims.find(
    (c) => truncate(c.claim) === move.candidateClaimReference && (move.sourceQuestionIndex === undefined || c.questionNumber === move.sourceQuestionIndex + 1)
  );
}

export function findContradictionIndexForMove(contradictions: IContradiction[], move: INextInterviewMove): number {
  if (move.moveType !== 'CONTRADICTION_PROBE' || !move.contradictionReference) return -1;
  return contradictions.findIndex(
    (c) => truncate(c.contradiction) === move.contradictionReference && (move.sourceQuestionIndex === undefined || c.questionNumber2 === move.sourceQuestionIndex + 1)
  );
}

/** Converts a finalized move into the same tagging shape `buildQuestionTagging` (Phase 1) produces, plus the additive `decision` metadata group. */
export function buildQuestionTaggingFromMove(move: INextInterviewMove, extra: { difficultyAtGeneration?: string }): QuestionTaggingFromMove {
  return {
    competencyName: move.targetCompetency,
    questionSource: move.questionSource,
    sourceReasonCode: move.reasonCode,
    difficultyAtGeneration: extra.difficultyAtGeneration,
    decision: {
      moveType: move.moveType,
      reasonCode: move.reasonCode,
      priority: move.priority,
      difficultyIntent: move.difficultyIntent,
      targetConcept: move.targetConcept,
      sourceQuestionIndex: move.sourceQuestionIndex,
    },
  };
}

interface MoveAwareAIService {
  // Method-shorthand syntax deliberately (not a property arrow type) so
  // this stays bivariantly compatible with AIService.generateQuestion's
  // real, narrower `context?: AIRequestContext` signature under
  // strictFunctionTypes.
  generateQuestion(request: QuestionRequest, context?: unknown): Promise<{ data: QuestionResponse }>;
}

/**
 * Shared "decide -> constrain -> generate -> validate -> (retry once /
 * degrade)" glue used by both call sites. Never blocks progression on a
 * validation failure: if the question still doesn't plausibly hit the
 * target after one forceful retry, the (already-generated, still usable)
 * question is kept, but `finalMove` is honestly degraded to
 * CONTINUE_BLUEPRINT/blueprint_progression rather than falsely tagging a
 * targeted probe that didn't land. Exactly one extra AI call in the worst
 * case — never a second AI "judge" call.
 */
export async function generateQuestionForMove(
  aiService: MoveAwareAIService,
  baseRequest: QuestionRequest,
  move: INextInterviewMove,
  requestContext?: unknown
): Promise<{ response: QuestionResponse; finalMove: INextInterviewMove }> {
  const directive = buildMoveDirective(move);
  const firstRequest: QuestionRequest = {
    ...baseRequest,
    targetCompetency: move.targetCompetency ?? baseRequest.priorityCompetency,
    targetConcept: move.targetConcept,
    moveType: move.moveType,
    moveDirective: directive,
  };

  // Phase 4: basic generation-quality guards (length/leakage/compound/near-
  // duplicate) apply to EVERY move, not just ones with a specific target —
  // reuses this SAME recentQuestionTexts list (already available as
  // baseRequest.previousQuestions, never a second lookup).
  const recentQuestionTexts = baseRequest.previousQuestions || [];

  let result = await aiService.generateQuestion(firstRequest, requestContext);
  let questionText = result?.data?.question || '';

  if (!questionPlausiblyTargetsMove(questionText, move, recentQuestionTexts)) {
    const retryRequest: QuestionRequest = { ...firstRequest, moveDirective: buildMoveDirective(move, { forceful: true }) };
    result = await aiService.generateQuestion(retryRequest, requestContext);
    questionText = result?.data?.question || '';

    if (!questionPlausiblyTargetsMove(questionText, move, recentQuestionTexts)) {
      const degradedMove: INextInterviewMove = {
        ...move,
        moveType: 'CONTINUE_BLUEPRINT',
        reasonCode: 'blueprint_progression',
        questionSource: questionSourceForMoveType('CONTINUE_BLUEPRINT'),
        targetConcept: undefined,
        candidateClaimReference: undefined,
        contradictionReference: undefined,
        memoryReference: undefined,
      };
      return { response: result.data, finalMove: degradedMove };
    }
  }

  return { response: result.data, finalMove: move };
}
