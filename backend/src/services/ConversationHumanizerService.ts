/**
 * Phase 8 ("Conversation Humanizer") — server-side, deterministic
 * presentation-plan builder.
 *
 * Runs RIGHT AFTER the decision engine picks `move` and the next question
 * is generated (see InterviewService.submitAnswer /
 * InterviewAnswerOrchestratorService.generateRecoveryQuestion), reusing the
 * `move`/`answerSignal`/`interview` context ALREADY in scope at that point.
 * No new DB reads, no new AI calls, no new latency.
 *
 * PURE + deterministic given a fixed `rng`: identical input always produces
 * identical output. It only READS its inputs — nothing here ever mutates
 * `move`/`answerSignal`/`interview`/any Mongoose document, and nothing here
 * calls an AI provider. On ANY internal failure it degrades to a trivial
 * safe plan rather than throwing, so a humanizer bug can never block/fail
 * answer submission (callers should ALSO wrap their call site in try/catch
 * per the same non-critical-enrichment pattern used everywhere else in this
 * codebase — this internal guard is defense in depth, not a substitute).
 */

import { IQuestion } from '../models/interview.model';
import { INextInterviewMove, NextInterviewMoveType } from '../constants/nextQuestionDecision';
import { IAnswerSignal } from '../constants/answerSignal';
import { ConversationPresentationPlan, PresentationType } from '../constants/conversationHumanizer';
import { HumanizerInterviewMode, PhraseCategory } from '../constants/phraseLibrary';
import { selectPhrase, SelectedPhrase } from '../utils/phraseSelector';
import { rewriteToSpokenForm } from '../utils/spokenQuestionRewriter';

export interface BuildPresentationPlanParams {
  move: INextInterviewMove;
  question: { text: string };
  answerSignal?: IAnswerSignal;
  interviewMode: HumanizerInterviewMode;
  /** Phrase ids used in the last N turns, oldest-first — see `deriveRecentPhraseHistory` below. Position-based, never wall-clock-based. */
  recentPhraseHistory: string[];
  /** Injectable random source (default `Math.random`) — inject a deterministic sequence/mock in tests for exactly-repeatable phrase selection. */
  rng?: () => number;
}

// A move type's transition-family phrase category, if it has one at all.
// CONTINUE_BLUEPRINT deliberately has no entry — it falls back to the
// acknowledgement-based presentationType only (direct/acknowledge_then_ask/
// think_then_ask), mirroring how NextQuestionDecisionEngine.buildMoveDirective
// already treats SWITCH_COMPETENCY/CONTINUE_BLUEPRINT as the "open
// progression" moves with no specific directive of their own.
const TRANSITION_CATEGORY_BY_MOVE: Partial<Record<NextInterviewMoveType, PhraseCategory>> = {
  FOLLOW_UP: 'PROBE',
  DEEPEN: 'PROBE',
  SCENARIO: 'PROBE',
  CLAIM_PROBE: 'PROBE',
  CLARIFY: 'CLARIFY',
  CHALLENGE_ASSUMPTION: 'CHALLENGE',
  CONTRADICTION_PROBE: 'CONTRADICTION_NEUTRAL',
  MEMORY_CALLBACK: 'CALLBACK',
  SWITCH_COMPETENCY: 'TRANSITION',
};

// The presentationType a move type maps to directly. CONTINUE_BLUEPRINT is
// the one moveType with no fixed entry — see derivePresentationType below.
const PRESENTATION_TYPE_BY_MOVE: Partial<Record<NextInterviewMoveType, PresentationType>> = {
  FOLLOW_UP: 'probe',
  DEEPEN: 'probe',
  SCENARIO: 'probe',
  CLAIM_PROBE: 'probe',
  CLARIFY: 'clarify',
  CHALLENGE_ASSUMPTION: 'challenge',
  CONTRADICTION_PROBE: 'contradiction_clarification',
  MEMORY_CALLBACK: 'callback',
  SWITCH_COMPETENCY: 'transition',
};

const TONE_HINT_BY_PRESENTATION_TYPE: Partial<Record<PresentationType, string>> = {
  probe: 'curious',
  clarify: 'curious',
  callback: 'curious',
  challenge: 'measured',
  contradiction_clarification: 'measured',
  think_then_ask: 'reflective',
};

/**
 * Picks WHICH acknowledgement-family category best fits this turn's answer
 * signal — never a quality/score judgment, purely a neutral "what kind of
 * brief reaction fits" choice (a no-answer gets a no-answer bridge, a
 * verbose answer gets a "thanks for the detail" beat, a harder/high-probe
 * turn gets a "let me think" beat, everything else gets a plain neutral
 * acknowledgement).
 */
function pickAckCategory(answerSignal: IAnswerSignal | undefined, move: INextInterviewMove): PhraseCategory {
  if (!answerSignal) return 'NEUTRAL_ACK';
  if (answerSignal.isNoAnswer) return 'NO_ANSWER';
  if (answerSignal.verbosityClass === 'verbose') return 'LONG_ANSWER';
  if (move.difficultyIntent === 'harder' || answerSignal.probeWorthiness === 'high') return 'THINKING';
  return 'NEUTRAL_ACK';
}

function derivePresentationType(moveType: NextInterviewMoveType, ackCategory: PhraseCategory, hasAck: boolean): PresentationType {
  const fromMove = PRESENTATION_TYPE_BY_MOVE[moveType];
  if (fromMove) return fromMove;
  // Only CONTINUE_BLUEPRINT reaches here.
  if (!hasAck) return 'direct';
  return ackCategory === 'THINKING' ? 'think_then_ask' : 'acknowledge_then_ask';
}

function safeFallbackPlan(canonicalText: string): ConversationPresentationPlan {
  return {
    presentationType: 'direct',
    spokenQuestionText: canonicalText,
    prePauseMs: 0,
    betweenPauseMs: 0,
    avatarStateHint: 'ASKING_QUESTION',
    silenceOnly: true,
  };
}

function buildPlanInternal(params: BuildPresentationPlanParams): ConversationPresentationPlan {
  const { move, question, answerSignal, interviewMode, recentPhraseHistory, rng = Math.random } = params;
  const canonicalText = question?.text ?? '';
  if (!canonicalText.trim()) return safeFallbackPlan(canonicalText);

  const ackCategory = pickAckCategory(answerSignal, move);
  const ack: SelectedPhrase | null = selectPhrase(ackCategory, interviewMode, recentPhraseHistory, rng);

  const transitionCategory = TRANSITION_CATEGORY_BY_MOVE[move.moveType];
  const transition: SelectedPhrase | null = transitionCategory
    ? selectPhrase(transitionCategory, interviewMode, recentPhraseHistory, rng)
    : null;

  const spokenQuestionText = rewriteToSpokenForm(canonicalText, {
    targetConcept: move.targetConcept,
    sourcePhraseReference: move.sourcePhraseReference,
  });

  const presentationType = derivePresentationType(move.moveType, ackCategory, !!ack);
  const silenceOnly = !ack && !transition;

  const plan: ConversationPresentationPlan = {
    presentationType,
    spokenQuestionText,
    prePauseMs: ack ? 200 : 0,
    betweenPauseMs: transition ? 250 : 0,
    // Every plan collapses into ONE continuous ASKING_QUESTION span on the
    // frontend (Phase 7's established vocabulary/state machine) — this
    // service never asks the frontend to introduce a second/parallel state.
    avatarStateHint: 'ASKING_QUESTION',
    silenceOnly,
  };
  if (ack) {
    plan.acknowledgementPhraseId = ack.phraseId;
    plan.acknowledgementText = ack.text;
  }
  if (transition) {
    plan.transitionPhraseId = transition.phraseId;
    plan.transitionText = transition.text;
  }
  const toneHint = TONE_HINT_BY_PRESENTATION_TYPE[presentationType];
  if (toneHint) plan.toneHint = toneHint;

  return plan;
}

/**
 * Scans the tail of the (already-persisted) question array for this turn's
 * repetition-avoidance context — the SAME "derive from already-persisted
 * question history" pattern Phase 4's follow-up-cap/Phase 5's
 * memory-callback-cooldown logic already use. Never a new parallel field on
 * `Interview`. Ordered oldest-first to match `phraseSelector`'s
 * position-based cooldown window.
 */
export function deriveRecentPhraseHistory(questions: IQuestion[] | undefined, windowSize = 8): string[] {
  if (!questions || questions.length === 0) return [];
  const recent = questions.slice(-windowSize);
  const ids: string[] = [];
  for (const q of recent) {
    if (q.presentation?.acknowledgementPhraseId) ids.push(q.presentation.acknowledgementPhraseId);
    if (q.presentation?.transitionPhraseId) ids.push(q.presentation.transitionPhraseId);
  }
  return ids;
}

// ============================================================================
// Phase 11 — WELCOME (before the first question) and CLOSING (after the
// final answer) presentation plans. Both reuse the EXACT SAME
// `ConversationPresentationPlan` shape `buildPlanInternal` above already
// produces for every mid-interview turn — no parallel type. Both are pure,
// deterministic-given-`rng`, and never throw (mirroring
// `buildPresentationPlan`'s own try/catch discipline) — a failure here must
// never block interview start/completion.
// ============================================================================

/**
 * The interview's opening greeting, attached to the FIRST question's own
 * `presentation` field (never a separate endpoint/turn) — `acknowledgementText`
 * carries the whole scripted opening beat (see the WELCOME category's own
 * doc comment in phraseLibrary.ts for why it's one combined phrase rather
 * than split across ack/transition), `spokenQuestionText` is the first
 * question verbatim. `presentationType: 'acknowledge_then_ask'` is the
 * SAME existing enum value a mid-interview NEUTRAL_ACK-led turn already
 * uses — no new PresentationType needed.
 */
function buildWelcomePlanInternal(params: {
  questionText: string;
  interviewMode: HumanizerInterviewMode;
  rng?: () => number;
}): ConversationPresentationPlan {
  const { questionText, interviewMode, rng = Math.random } = params;
  const canonicalText = questionText ?? '';
  if (!canonicalText.trim()) return safeFallbackPlan(canonicalText);

  const greeting = selectPhrase('WELCOME', interviewMode, [], rng);
  if (!greeting) return safeFallbackPlan(canonicalText);

  return {
    presentationType: 'acknowledge_then_ask',
    acknowledgementPhraseId: greeting.phraseId,
    acknowledgementText: greeting.text,
    spokenQuestionText: canonicalText,
    prePauseMs: 250,
    betweenPauseMs: 0,
    avatarStateHint: 'ASKING_QUESTION',
    silenceOnly: false,
  };
}

/**
 * The interview's closing sign-off, returned on the SAME response that
 * carries `isCompleted: true` (there is no next question to attach it to,
 * unlike WELCOME). `spokenQuestionText` here holds the closing sentence
 * itself (not a literal question) — the frontend already treats this field
 * generically as "the primary line to speak for this turn"; reusing it here
 * avoids inventing a parallel closing-specific type for a single string of
 * text. `presentationType: 'closing'` is Phase 9's own reserved-but-
 * previously-unused enum value, finally wired up here.
 */
function buildClosingPlanInternal(params: {
  interviewMode: HumanizerInterviewMode;
  recentPhraseHistory?: string[];
  rng?: () => number;
}): ConversationPresentationPlan {
  const { interviewMode, recentPhraseHistory = [], rng = Math.random } = params;
  const closing = selectPhrase('CLOSING', interviewMode, recentPhraseHistory, rng);
  if (!closing) return safeFallbackPlan('');

  return {
    presentationType: 'closing',
    spokenQuestionText: closing.text,
    prePauseMs: 0,
    betweenPauseMs: 0,
    avatarStateHint: 'ACKNOWLEDGING',
    silenceOnly: false,
  };
}

export class ConversationHumanizerService {
  /**
   * Builds the presentation plan for the question that's about to be shown
   * next. Never throws — any internal error degrades to
   * `safeFallbackPlan(question.text)` (direct/silenceOnly, canonical text
   * unchanged) rather than propagating.
   */
  buildPresentationPlan(params: BuildPresentationPlanParams): ConversationPresentationPlan {
    // Captured defensively, separately from the main attempt below: even a
    // `question.text` ACCESSOR that itself throws must never prevent the
    // safe fallback from being built (the fallback's own text access is
    // guarded independently, so a single flaky input can't escape both).
    let canonicalTextForFallback = '';
    try {
      canonicalTextForFallback = params?.question?.text ?? '';
    } catch {
      canonicalTextForFallback = '';
    }
    try {
      return buildPlanInternal(params);
    } catch (error) {
      console.error('[ConversationHumanizerService] Failed to build presentation plan (non-critical):', error);
      return safeFallbackPlan(canonicalTextForFallback);
    }
  }

  deriveRecentPhraseHistory(questions: IQuestion[] | undefined, windowSize = 8): string[] {
    return deriveRecentPhraseHistory(questions, windowSize);
  }

  /** Phase 11 — see `buildWelcomePlanInternal`. Never throws. */
  buildWelcomePresentationPlan(params: { questionText: string; interviewMode: HumanizerInterviewMode; rng?: () => number }): ConversationPresentationPlan {
    let canonicalTextForFallback = '';
    try {
      canonicalTextForFallback = params?.questionText ?? '';
    } catch {
      canonicalTextForFallback = '';
    }
    try {
      return buildWelcomePlanInternal(params);
    } catch (error) {
      console.error('[ConversationHumanizerService] Failed to build welcome plan (non-critical):', error);
      return safeFallbackPlan(canonicalTextForFallback);
    }
  }

  /** Phase 11 — see `buildClosingPlanInternal`. Never throws. */
  buildClosingPresentationPlan(params: { interviewMode: HumanizerInterviewMode; recentPhraseHistory?: string[]; rng?: () => number }): ConversationPresentationPlan {
    try {
      return buildClosingPlanInternal(params);
    } catch (error) {
      console.error('[ConversationHumanizerService] Failed to build closing plan (non-critical):', error);
      return safeFallbackPlan('');
    }
  }
}

export const conversationHumanizerService = new ConversationHumanizerService();
