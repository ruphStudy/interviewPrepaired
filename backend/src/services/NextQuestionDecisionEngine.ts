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
          remainingBudget
        );
      }

      const coverageOnly = this.buildCoverageCandidates(context, remainingBudget, history, config);
      const fallbackWinner: Candidate = coverageOnly[0] || { moveType: 'CONTINUE_BLUEPRINT', score: 0, reasonCode: 'blueprint_progression' };
      return this.finalizeMove(fallbackWinner, context, remainingBudget);
    }

    // ------------------------------------------------------------------
    // General candidate collection
    // ------------------------------------------------------------------
    const candidates: Candidate[] = [];
    if (signal) {
      candidates.push(...this.buildFollowUpCandidates(context, signal, history, currentSourceIndex, config));
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

    return this.finalizeMove(winner, context, remainingBudget);
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
      let score = BASE_SCORE[moveType] + opp.priority;
      if (repeated) score -= config.repetitionPenalty;
      out.push({
        moveType,
        score,
        reasonCode: deriveFollowUpReasonCode(signal.quality, repeated),
        targetCompetency: opp.relatedCompetency || context.currentQuestionCompetency,
        targetConcept: opp.topic,
        followUpType: opp.type,
        sourceQuestionIndex: currentSourceIndex,
      });
    }
    return out;
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

  private finalizeMove(candidate: Candidate, context: DecisionContext, remainingBudget: number): INextInterviewMove {
    return {
      moveType: candidate.moveType,
      targetCompetency: candidate.targetCompetency,
      targetConcept: candidate.targetConcept,
      sourceQuestionIndex: candidate.sourceQuestionIndex,
      reasonCode: candidate.reasonCode,
      priority: Math.round(candidate.score),
      difficultyIntent: deriveDifficultyIntent(context.answerSignal),
      followUpType: candidate.followUpType,
      candidateClaimReference: candidate.candidateClaimReference,
      contradictionReference: candidate.contradictionReference,
      memoryReference: candidate.memoryReference,
      remainingBudget,
      questionSource: questionSourceForMoveType(candidate.moveType),
    };
  }
}

export const nextQuestionDecisionEngine = new NextQuestionDecisionEngine();

// ============================================================================
// Integration glue shared by both call sites (InterviewService.submitAnswer
// and InterviewAnswerOrchestratorService.generateRecoveryQuestion) — kept
// here so the "decide -> constrain prompt -> validate -> tag" sequence is
// defined exactly once.
// ============================================================================

const MOVE_DIRECTIVE_BUILDERS: Partial<Record<NextInterviewMoveType, (move: INextInterviewMove) => string>> = {
  DEEPEN: (m) =>
    `Ask a deeper follow-up question specifically about "${m.targetConcept}"${m.targetCompetency ? ` within ${m.targetCompetency}` : ''}, building directly on the candidate's previous answer. Do not repeat the previous question.`,
  CLARIFY: (m) =>
    m.reasonCode === 'no_answer'
      ? `The candidate did not answer the previous question. Ask a single, clear, more approachable clarifying question on the SAME topic — do not move to a new topic yet.`
      : m.reasonCode === 'off_topic'
        ? `The candidate's previous answer did not address the question asked. Politely redirect with a clearer, more specific version of the same question.`
        : `Ask the candidate to clarify or elaborate on: "${m.targetConcept}". Be specific about what is unclear.`,
  FOLLOW_UP: (m) =>
    `Ask a direct follow-up question about "${m.targetConcept}"${m.targetCompetency ? ` within ${m.targetCompetency}` : ''}, building on the candidate's previous answer.`,
  SCENARIO: (m) =>
    `Pose a realistic scenario/edge-case question that explores "${m.targetConcept}" in more practical depth${m.targetCompetency ? ` within ${m.targetCompetency}` : ''}.`,
  CHALLENGE_ASSUMPTION: (m) =>
    `Respectfully challenge a tradeoff or assumption in the candidate's previous answer about "${m.targetConcept}" — ask them to justify their choice or consider an alternative.`,
  CLAIM_PROBE: (m) =>
    `Ask the candidate to elaborate on and substantiate this claim with specifics (numbers, their exact role, concrete outcome): "${m.candidateClaimReference}".`,
  CONTRADICTION_PROBE: (m) =>
    `Neutrally and non-accusatorially ask the candidate to clarify this apparent inconsistency in their answers: ${m.contradictionReference}.`,
  MEMORY_CALLBACK: (m) =>
    `Reference the candidate's earlier answer ("${m.memoryReference}") and connect it to the current topic${m.targetCompetency ? ` (${m.targetCompetency})` : ''} in a natural follow-up.`,
  // SWITCH_COMPETENCY / CONTINUE_BLUEPRINT deliberately have no directive —
  // they keep using the existing priorityCompetency-based soft prompt
  // (OpenAIService.getQuestionUserPrompt), unchanged from pre-Phase-3.
};

export function buildMoveDirective(move: INextInterviewMove, options?: { forceful?: boolean }): string | undefined {
  const builder = MOVE_DIRECTIVE_BUILDERS[move.moveType];
  if (!builder) return undefined;
  const base = builder(move);
  if (!options?.forceful) return base;
  return `${base} This is critical: the question MUST explicitly and unambiguously address the above in this exact turn.`;
}

function significantWords(text: string | undefined): Set<string> {
  return new Set((text || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
}

/**
 * Cheap, deterministic output validation — never a second AI "judge" call.
 * Returns true whenever there's nothing specific to validate (e.g.
 * CONTINUE_BLUEPRINT/SWITCH_COMPETENCY with no concept/claim/contradiction
 * reference), or when the generated question shares a significant word or a
 * canonical concept-registry key with the move's reference text.
 */
export function questionPlausiblyTargetsMove(questionText: string, move: INextInterviewMove): boolean {
  const reference = move.targetConcept || move.candidateClaimReference || move.contradictionReference || move.memoryReference;
  if (!reference) return true;

  const refWords = significantWords(reference);
  if (refWords.size === 0) return true;

  const qWords = significantWords(questionText);
  for (const w of refWords) {
    if (qWords.has(w)) return true;
  }

  if (move.targetConcept) {
    const qConcepts = new Set(detectConcepts(questionText || ''));
    const refConcepts = detectConcepts(move.targetConcept);
    if (refConcepts.some((c) => qConcepts.has(c))) return true;
  }

  return false;
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

  let result = await aiService.generateQuestion(firstRequest, requestContext);
  let questionText = result?.data?.question || '';

  if (directive && !questionPlausiblyTargetsMove(questionText, move)) {
    const retryRequest: QuestionRequest = { ...firstRequest, moveDirective: buildMoveDirective(move, { forceful: true }) };
    result = await aiService.generateQuestion(retryRequest, requestContext);
    questionText = result?.data?.question || '';

    if (!questionPlausiblyTargetsMove(questionText, move)) {
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
