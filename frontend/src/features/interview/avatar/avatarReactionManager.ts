import { useEffect, useRef, useState } from 'react';
import { PresentationState } from '../../../hooks/useInterviewPresentationState';
import type { MicroBehaviorType } from '../../../utils/microBehaviorScheduler';
import {
  AvatarVideoState,
  QuestionVisualIntent,
  AvatarClip,
  getPoolForState,
  LOOPING_STATES,
  ONE_SHOT_STATES,
  ONE_SHOT_FALLBACK_DURATION_MS,
} from './avatarVideoConfig';

/**
 * Avatar Reaction Manager — the ONE place that turns the EXISTING interview
 * lifecycle signals (presentation state machine, mic-listening flag, the
 * current turn's presentation type, and the existing micro-behavior
 * scheduler's output) into a video selection. Visual-only: never reads from
 * or writes to anything AI/scoring-related, never calls a backend endpoint,
 * never classifies anything the backend hasn't already told the frontend.
 *
 * `currentPresentationType` is EXACTLY `ConversationPresentationPlan.
 * presentationType` (set by InterviewScreen.tsx right before a question's
 * audio starts) — already computed server-side per PR-CONVO-HUMANIZER from
 * the real decision-engine move, so no new classification/LLM call is
 * needed here at all:
 *   'probe'                      -> followUp (FOLLOW_UP/DEEPEN/SCENARIO/CLAIM_PROBE moves)
 *   'clarify'                    -> clarification
 *   'challenge'                  -> challenge
 *   'contradiction_clarification'-> callback (references an earlier answer)
 *   'callback'                   -> callback
 *   'transition'                 -> topicChange (SWITCH_COMPETENCY)
 *   anything else / undefined    -> normal
 */
function deriveQuestionVisualIntent(presentationType: string | undefined): QuestionVisualIntent {
  switch (presentationType) {
    case 'probe':
      return 'followUp';
    case 'clarify':
      return 'clarification';
    case 'challenge':
      return 'challenge';
    case 'contradiction_clarification':
    case 'callback':
      return 'callback';
    case 'transition':
      return 'topicChange';
    default:
      return 'normal';
  }
}

function deriveVideoState(input: {
  presentationState: PresentationState;
  isActivelyListening: boolean;
  questionVisualIntent: QuestionVisualIntent;
}): AvatarVideoState {
  switch (input.presentationState) {
    case PresentationState.PRE_START:
    case PresentationState.ERROR_RECOVERY:
      return 'idle';
    case PresentationState.WELCOME:
      return 'welcome';
    case PresentationState.ASKING_QUESTION: {
      switch (input.questionVisualIntent) {
        case 'followUp':
          return 'probe';
        case 'topicChange':
          return 'transition';
        case 'clarification':
          return 'clarify';
        case 'challenge':
          return 'challenge';
        case 'callback':
          return 'callback';
        default:
          return 'normalQuestion';
      }
    }
    case PresentationState.LISTENING:
      return input.isActivelyListening ? 'listening' : 'waiting';
    case PresentationState.ANSWER_FINALIZING:
    case PresentationState.ACKNOWLEDGING:
      return 'acknowledge';
    case PresentationState.THINKING_SHORT:
    case PresentationState.THINKING_LONG:
    case PresentationState.PREPARING_QUESTION:
    case PresentationState.QUESTION_READY:
      return 'thinking';
    case PresentationState.CLOSING:
      return 'closing';
    case PresentationState.COMPLETED:
      return 'closingNod';
    default:
      return 'idle';
  }
}

/** Avoids repeating the immediately-previous clip for a given state when an alternative exists — one `lastId` tracked per state, never globally. */
function pickClip(pool: AvatarClip[], lastIdForState: string | undefined): AvatarClip | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const candidates = pool.filter((c) => c.id !== lastIdForState);
  const choices = candidates.length > 0 ? candidates : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

export interface AvatarReactionInput {
  presentationState: PresentationState;
  /** Real mic-recording flag — same signal `useAvatarPresentationController` already uses. */
  isActivelyListening: boolean;
  /** `ConversationPresentationPlan.presentationType` for the CURRENT turn, set by InterviewScreen right before that turn's audio plays. */
  currentPresentationType?: string;
  /** The EXISTING micro-behavior scheduler's output — SMALL_NOD is reused here as the "occasional subtle reaction while listening" trigger (reuses its own randomized cooldown/safety gating entirely; no second timer is created). */
  currentMicroBehavior: MicroBehaviorType | null;
  /** Bumped only on a genuinely new interview session — resets clip-repeat memory, matching `sessionGeneration` elsewhere in the presentation layer. */
  sessionGeneration: number;
}

export interface AvatarReactionOutput {
  videoState: AvatarVideoState;
  clip: AvatarClip | null;
  loop: boolean;
  /** True for acknowledge/nod/smile/closingNod — caller should treat this as transient and not expect a stable long-running clip. */
  isOneShot: boolean;
}

/**
 * React hook — picks (and stably holds) a clip for the current derived
 * video state, re-picking only when the STATE itself changes (never on
 * every render), and auto-reverts one-shot states back to a resting state
 * after a short duration, exactly mirroring how `currentMicroBehavior`
 * already auto-clears itself in `useAvatarPresentationController`.
 */
export function useAvatarReactionManager(input: AvatarReactionInput): AvatarReactionOutput {
  const questionVisualIntent = deriveQuestionVisualIntent(input.currentPresentationType);

  const microNodActive = input.currentMicroBehavior === 'SMALL_NOD' && input.presentationState === PresentationState.LISTENING;
  const baseVideoState = deriveVideoState({
    presentationState: input.presentationState,
    isActivelyListening: input.isActivelyListening,
    questionVisualIntent,
  });
  // The micro-behavior scheduler's own SMALL_NOD overlay takes priority over
  // the plain listening/waiting visual for its own short lifetime — it
  // already self-clears (see useAvatarPresentationController), so no
  // additional timer is needed here for this one.
  const videoState: AvatarVideoState = microNodActive ? 'nod' : baseVideoState;

  const [settledClosingNod, setSettledClosingNod] = useState(false);
  const lastClipIdByStateRef = useRef<Partial<Record<AvatarVideoState, string>>>({});
  const [selectedClip, setSelectedClip] = useState<AvatarClip | null>(null);
  const previousStateRef = useRef<AvatarVideoState | null>(null);
  const previousSessionRef = useRef(input.sessionGeneration);

  // New interview session — forget all clip-repeat memory.
  if (previousSessionRef.current !== input.sessionGeneration) {
    previousSessionRef.current = input.sessionGeneration;
    lastClipIdByStateRef.current = {};
    previousStateRef.current = null;
  }

  useEffect(() => {
    if (videoState === 'idle') {
      setSelectedClip(null);
      previousStateRef.current = videoState;
      return;
    }
    // Only re-pick when the STATE actually changed — a stable state (e.g.
    // several seconds of LISTENING) must keep showing the SAME looped clip
    // rather than restarting/reselecting on every re-render.
    if (previousStateRef.current === videoState && selectedClip) return;

    const pool = getPoolForState(videoState);
    const picked = pickClip(pool, lastClipIdByStateRef.current[videoState]);
    if (picked) {
      lastClipIdByStateRef.current[videoState] = picked.id;
    }
    setSelectedClip(picked);
    previousStateRef.current = videoState;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoState]);

  // One-shot auto-revert (acknowledge/nod/smile/closingNod) — mirrors the
  // EXISTING `currentMicroBehavior` self-clear timing pattern. `acknowledge`
  // is driven by `presentationState` itself (the state machine moves on to
  // THINKING_* on its own shortly after), so only the PURELY-local one-shots
  // (`nod` from the micro-behavior overlay, `closingNod`) need a timer here.
  useEffect(() => {
    if (videoState !== 'closingNod') {
      setSettledClosingNod(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettledClosingNod(true), ONE_SHOT_FALLBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [videoState]);

  const effectiveVideoState: AvatarVideoState = videoState === 'closingNod' && settledClosingNod ? 'idle' : videoState;
  const effectiveClip = effectiveVideoState === 'idle' ? null : selectedClip;

  return {
    videoState: effectiveVideoState,
    clip: effectiveClip,
    loop: LOOPING_STATES.has(effectiveVideoState),
    isOneShot: ONE_SHOT_STATES.has(effectiveVideoState),
  };
}

// Re-exported for tests — avoids a second intent-mapping copy.
export { deriveQuestionVisualIntent, deriveVideoState };
