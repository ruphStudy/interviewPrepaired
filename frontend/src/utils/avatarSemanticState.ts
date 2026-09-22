/**
 * Phase 10A — the deterministic state-priority ordering the master spec
 * asks for: ERROR_RECOVERY > CLOSING > ASKING_QUESTION >
 * ACKNOWLEDGING/TRANSITION > THINKING > LISTENING > IDLE.
 *
 * This is NOT a second state machine and never drives a
 * `PresentationState` transition itself — `presentationReducer`
 * (useInterviewPresentationState.ts) remains the one authority for that.
 * This module is consulted only by the Phase 10C micro-behavior scheduler,
 * to decide whether "right now" is a low-enough-priority moment for a
 * purely cosmetic overlay (a nod/blink/rare distracted look) to be
 * eligible at all.
 *
 * Why a real transition always wins "immediately" without this module
 * doing anything active: `InterviewScreen.tsx` renders
 * `presentationStateToAvatarState(presentationState, isListening)` fresh on
 * every render, synchronously, from the reducer's current state — there is
 * no queued/delayed/buffered application of a presentation-state change
 * anywhere in this codebase. A micro-behavior never writes to
 * `presentationState`, so the instant a real event (e.g. `beginAsking()`)
 * moves the reducer to `ASKING_QUESTION`, the very next render reflects
 * that — a micro-behavior scheduled a moment earlier cannot delay, queue
 * behind, or override it. The priority ordering below exists purely to
 * gate the SCHEDULER's own eligibility check, not to arbitrate a race that
 * structurally cannot occur.
 */

import { PresentationState } from '../hooks/useInterviewPresentationState';

const PRIORITY: Record<PresentationState, number> = {
  [PresentationState.ERROR_RECOVERY]: 100,
  [PresentationState.CLOSING]: 90,
  [PresentationState.ASKING_QUESTION]: 80,
  // Same "actively speaking" tier as ASKING_QUESTION — the welcome sequence
  // is presentation-only narration, exactly like asking a question.
  [PresentationState.WELCOME]: 80,
  [PresentationState.ANSWER_FINALIZING]: 70,
  [PresentationState.ACKNOWLEDGING]: 70,
  [PresentationState.THINKING_SHORT]: 60,
  [PresentationState.THINKING_LONG]: 60,
  [PresentationState.PREPARING_QUESTION]: 60,
  [PresentationState.LISTENING]: 50,
  [PresentationState.QUESTION_READY]: 40,
  [PresentationState.PRE_START]: 10,
  [PresentationState.COMPLETED]: 10,
};

/** Numeric priority for one `PresentationState` — higher always outranks lower. Unknown/future values fail safe to 0 (lowest, never treated as urgent). */
export function getPresentationStatePriority(state: PresentationState): number {
  return PRIORITY[state] ?? 0;
}

/** True when `a`'s priority is >= `b`'s — a small, directly-testable comparator over the ordering above (never used to gate a real transition, only asserted against in tests). */
export function outranksOrTies(a: PresentationState, b: PresentationState): boolean {
  return getPresentationStatePriority(a) >= getPresentationStatePriority(b);
}

/** Cosmetic overlays are eligible only at LISTENING priority or below (LISTENING, QUESTION_READY, PRE_START, COMPLETED) — never ASKING_QUESTION/WELCOME/CLOSING/ACKNOWLEDGING/THINKING/ERROR_RECOVERY. */
const SAFE_FOR_MICRO_BEHAVIOR_MAX_PRIORITY = getPresentationStatePriority(PresentationState.LISTENING);

/** DISTRACTED_LOOK is stricter still — only in a genuinely idle/waiting moment (QUESTION_READY or below), never merely "it's your turn to start answering". */
const SAFE_FOR_DISTRACTED_LOOK_MAX_PRIORITY = getPresentationStatePriority(PresentationState.QUESTION_READY);

/**
 * Presentation types (`ConversationPresentationPlan.presentationType`,
 * api/interviewApi.ts) that must read as fully attentive — no cosmetic
 * overlay may be scheduled while the CURRENT question's turn carries one of
 * these flavours, even during the subsequent LISTENING for that same
 * question (not just the instant it is asked). `InterviewScreen.tsx` sets
 * this from `presentation.presentationType` right before playing a turn's
 * lead-in/question audio and leaves it set until the next turn's plan
 * arrives — see useAvatarPresentationController.ts.
 */
const SUPPRESSED_PRESENTATION_TYPES = new Set(['probe', 'challenge', 'contradiction_clarification', 'closing']);

export interface MicroBehaviorSafetyInput {
  presentationState: PresentationState;
  /** Actual mic-recording flag (Phase 2/pre-existing `isListening` from useSpeechInterview) — distinct from the coarser LISTENING presentation state, which also covers "your turn, not recording yet". */
  isActivelyListening: boolean;
  /** The CURRENT question turn's `ConversationPresentationPlan.presentationType`, if known — purely presentation-only, never a decision/scoring signal. */
  presentationType?: string;
}

/**
 * General micro-behavior (SMALL_NOD/BLINK) eligibility — a pure function,
 * never a reducer transition, so it can never get "stuck": every call
 * re-evaluates the CURRENT inputs from scratch.
 */
export function isSafeForMicroBehavior(input: MicroBehaviorSafetyInput): boolean {
  if (getPresentationStatePriority(input.presentationState) > SAFE_FOR_MICRO_BEHAVIOR_MAX_PRIORITY) return false;
  if (input.isActivelyListening) return false; // candidate is genuinely mid-speech
  if (input.presentationType && SUPPRESSED_PRESENTATION_TYPES.has(input.presentationType)) return false;
  return true;
}

/** DISTRACTED_LOOK's own, stricter safety check — always a superset restriction of `isSafeForMicroBehavior`. */
export function isSafeForDistractedLook(input: MicroBehaviorSafetyInput): boolean {
  if (!isSafeForMicroBehavior(input)) return false;
  return getPresentationStatePriority(input.presentationState) <= SAFE_FOR_DISTRACTED_LOOK_MAX_PRIORITY;
}
