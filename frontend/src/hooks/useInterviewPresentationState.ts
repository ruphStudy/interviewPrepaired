import { useCallback, useEffect, useReducer, useRef } from 'react';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { getLatencyTier } from '../config/latencyTiers';

/**
 * Phase 7A — presentation/thinking-time state machine.
 *
 * This is a purely client-side, transient "what is the avatar/UI doing
 * right now" state machine. It is never persisted to MongoDB and never
 * changes which backend call happens or what it is sent — it only decides
 * how the wait is PRESENTED while the real `POST /interview/answer` call
 * (the sole authority for what happens next, per Phases 1-6) is in flight.
 *
 * Naming is deliberately neutral/semantic only — no state ever encodes an
 * evaluation/quality signal (e.g. never "STRONG_ANSWER_ACKNOWLEDGED").
 *
 * State chain (happy path):
 *   PRE_START -> WELCOME -> ASKING_QUESTION -> LISTENING -> ANSWER_FINALIZING
 *   -> ACKNOWLEDGING -> [THINKING_SHORT] -> [THINKING_LONG] -> PREPARING_QUESTION
 *   -> QUESTION_READY -> ASKING_QUESTION -> LISTENING -> ... -> COMPLETED
 * ERROR_RECOVERY is reachable from any waiting/preparing state.
 *
 * Staleness guard: every event that resumes after an async gap (a TTS
 * onEnd, an HTTP response, a timer tick) carries the request/question
 * "generation" id that was current when the async work began. The reducer
 * silently no-ops (returns the same state reference) when that id no
 * longer matches the CURRENT generation — this is what stops a slow
 * response for an abandoned question, or a cancelled utterance, from ever
 * moving the state machine. Generation ids are minted by the hook (a
 * monotonic ref counter, not persisted, not sent to the backend).
 */

export enum PresentationState {
  PRE_START = 'PRE_START',
  WELCOME = 'WELCOME',
  ASKING_QUESTION = 'ASKING_QUESTION',
  LISTENING = 'LISTENING',
  ANSWER_FINALIZING = 'ANSWER_FINALIZING',
  ACKNOWLEDGING = 'ACKNOWLEDGING',
  THINKING_SHORT = 'THINKING_SHORT',
  THINKING_LONG = 'THINKING_LONG',
  PREPARING_QUESTION = 'PREPARING_QUESTION',
  QUESTION_READY = 'QUESTION_READY',
  ERROR_RECOVERY = 'ERROR_RECOVERY',
  COMPLETED = 'COMPLETED',
}

/**
 * The legacy phase union `InterviewScreen.tsx` has used since before this
 * phase. Kept verbatim (not renamed) so the richer `PresentationState`
 * machine can be a drop-in replacement for the old ad-hoc `useState<phase>`
 * without touching a single JSX conditional that already branches on it.
 */
export type LegacyInterviewPhase =
  | 'READY'
  | 'WELCOME'
  | 'QUESTION'
  | 'LISTENING'
  | 'PROCESSING'
  | 'NEXT_QUESTION'
  | 'COMPLETED';

export interface PresentationReducerState {
  presentationState: PresentationState;
  /** Generation id of the in-flight (or most recently settled) submit request. */
  requestGeneration: number;
  /** Generation id of the currently active question. */
  questionGeneration: number;
  /** Wall-clock ms when the current wait (ACKNOWLEDGING onward) began, or null. */
  waitStartedAt: number | null;
  /** Last observed elapsed wait time, for consumers that want to render it. */
  elapsedMs: number;
}

export type PresentationAction =
  | { type: 'START_INTERVIEW' }
  | { type: 'BEGIN_ASKING'; questionGeneration: number }
  | { type: 'QUESTION_SPOKEN'; questionGeneration: number }
  | { type: 'BEGIN_ANSWER_FINALIZING'; questionGeneration: number }
  | { type: 'BEGIN_REQUEST'; requestGeneration: number; questionGeneration: number; now: number }
  | { type: 'TICK'; requestGeneration: number; elapsedMs: number }
  | {
      type: 'SUBMIT_SUCCEEDED';
      requestGeneration: number;
      questionGeneration: number;
      outcome: 'next-question' | 'completed';
    }
  | { type: 'QUESTION_TEXT_AVAILABLE'; requestGeneration: number; questionGeneration: number }
  | { type: 'SUBMIT_FAILED'; requestGeneration: number }
  | { type: 'RESET_FOR_QUESTION'; questionGeneration: number }
  | { type: 'RESET_TO_PRE_START' };

const WAITING_STATES = new Set<PresentationState>([
  PresentationState.ACKNOWLEDGING,
  PresentationState.THINKING_SHORT,
  PresentationState.THINKING_LONG,
]);

// Forward-only escalation ordering used by TICK — a tier can only push the
// wait state further along this list, never backward, and TICK can never by
// itself produce QUESTION_READY/COMPLETED/ERROR_RECOVERY (only a real
// SUBMIT_SUCCEEDED/SUBMIT_FAILED event can).
const ESCALATION_ORDER: PresentationState[] = [
  PresentationState.ACKNOWLEDGING,
  PresentationState.THINKING_SHORT,
  PresentationState.THINKING_LONG,
];

export function createInitialPresentationState(): PresentationReducerState {
  return {
    presentationState: PresentationState.PRE_START,
    requestGeneration: 0,
    questionGeneration: 0,
    waitStartedAt: null,
    elapsedMs: 0,
  };
}

/**
 * Pure reducer — no timers, no Date.now(), no DOM/browser API access, so it
 * can be exercised directly with plain assertions (see
 * useInterviewPresentationState.test.ts).
 */
export function presentationReducer(
  state: PresentationReducerState,
  action: PresentationAction
): PresentationReducerState {
  switch (action.type) {
    case 'START_INTERVIEW': {
      if (state.presentationState !== PresentationState.PRE_START) return state;
      return { ...state, presentationState: PresentationState.WELCOME };
    }

    case 'BEGIN_ASKING': {
      // Minted fresh by the caller for every question (first question after
      // welcome, or the next question after a successful submit) — accepted
      // from any non-terminal state defensively, since this call always
      // originates from the orchestration code itself (never a stale async
      // callback), and always reflects the newest question generation.
      if (state.presentationState === PresentationState.COMPLETED) return state;
      return {
        ...state,
        presentationState: PresentationState.ASKING_QUESTION,
        questionGeneration: action.questionGeneration,
      };
    }

    case 'QUESTION_SPOKEN': {
      if (state.presentationState !== PresentationState.ASKING_QUESTION) return state;
      if (action.questionGeneration !== state.questionGeneration) return state; // stale TTS onEnd
      return { ...state, presentationState: PresentationState.LISTENING };
    }

    case 'BEGIN_ANSWER_FINALIZING': {
      // Also valid from ERROR_RECOVERY: retrying after a failed submit (same
      // question) is a legitimate real user action, not a stale callback.
      const validFrom =
        state.presentationState === PresentationState.LISTENING ||
        state.presentationState === PresentationState.ERROR_RECOVERY;
      if (!validFrom) return state;
      if (action.questionGeneration !== state.questionGeneration) return state;
      return { ...state, presentationState: PresentationState.ANSWER_FINALIZING };
    }

    case 'BEGIN_REQUEST': {
      const validFrom =
        state.presentationState === PresentationState.ANSWER_FINALIZING ||
        state.presentationState === PresentationState.LISTENING || // typed-answer path may skip finalizing
        state.presentationState === PresentationState.ERROR_RECOVERY; // retry after a failed submit
      if (!validFrom) return state;
      if (action.questionGeneration !== state.questionGeneration) return state; // submitting for an abandoned question
      return {
        ...state,
        presentationState: PresentationState.ACKNOWLEDGING,
        requestGeneration: action.requestGeneration,
        waitStartedAt: action.now,
        elapsedMs: 0,
      };
    }

    case 'TICK': {
      if (!WAITING_STATES.has(state.presentationState)) return state;
      if (action.requestGeneration !== state.requestGeneration) return state; // stale timer from an abandoned request
      const tier = getLatencyTier(action.elapsedMs);
      const currentIndex = ESCALATION_ORDER.indexOf(state.presentationState);
      const hintIndex = ESCALATION_ORDER.indexOf(tier.presentationState as PresentationState);
      // Never escalate on the basis of the INSTANT tier's "QUESTION_READY"
      // hint (that hint only means "no thinking treatment needed YET", not
      // "jump to QUESTION_READY" — TICK never produces that transition).
      const nextState =
        hintIndex > currentIndex ? ESCALATION_ORDER[hintIndex] : state.presentationState;
      if (nextState === state.presentationState && state.elapsedMs === action.elapsedMs) return state;
      return { ...state, presentationState: nextState, elapsedMs: action.elapsedMs };
    }

    case 'SUBMIT_SUCCEEDED': {
      if (!WAITING_STATES.has(state.presentationState)) return state;
      if (action.requestGeneration !== state.requestGeneration) return state; // stale response for an abandoned submit
      if (action.outcome === 'completed') {
        return { ...state, presentationState: PresentationState.COMPLETED, waitStartedAt: null };
      }
      return {
        ...state,
        presentationState: PresentationState.PREPARING_QUESTION,
        questionGeneration: action.questionGeneration,
        waitStartedAt: null,
      };
    }

    case 'QUESTION_TEXT_AVAILABLE': {
      if (state.presentationState !== PresentationState.PREPARING_QUESTION) return state;
      if (action.requestGeneration !== state.requestGeneration) return state;
      if (action.questionGeneration !== state.questionGeneration) return state;
      return { ...state, presentationState: PresentationState.QUESTION_READY };
    }

    case 'SUBMIT_FAILED': {
      const validFrom =
        WAITING_STATES.has(state.presentationState) ||
        state.presentationState === PresentationState.ANSWER_FINALIZING ||
        state.presentationState === PresentationState.PREPARING_QUESTION;
      if (!validFrom) return state;
      if (action.requestGeneration !== state.requestGeneration) return state;
      return { ...state, presentationState: PresentationState.ERROR_RECOVERY, waitStartedAt: null };
    }

    case 'RESET_FOR_QUESTION': {
      // Reachable from anywhere (retry-after-error, or a defensive full
      // reset) — always accepted since it originates from real user/
      // orchestration action, never a stale async callback.
      return {
        ...state,
        presentationState: PresentationState.LISTENING,
        questionGeneration: action.questionGeneration,
        waitStartedAt: null,
        elapsedMs: 0,
      };
    }

    case 'RESET_TO_PRE_START': {
      return createInitialPresentationState();
    }

    default:
      return state;
  }
}

/** Pure mapping: PresentationState (+ whether the mic is actively recording) -> the existing 5-value AvatarState. */
export function presentationStateToAvatarState(
  presentationState: PresentationState,
  isActivelyListening: boolean
): AvatarState {
  switch (presentationState) {
    case PresentationState.PRE_START:
      return AvatarState.IDLE;
    case PresentationState.WELCOME:
    case PresentationState.ASKING_QUESTION:
      return AvatarState.SPEAKING;
    case PresentationState.LISTENING:
      return isActivelyListening ? AvatarState.LISTENING : AvatarState.IDLE;
    case PresentationState.ANSWER_FINALIZING:
    case PresentationState.ACKNOWLEDGING:
    case PresentationState.THINKING_SHORT:
    case PresentationState.THINKING_LONG:
    case PresentationState.PREPARING_QUESTION:
      return AvatarState.THINKING;
    case PresentationState.QUESTION_READY:
      return AvatarState.IDLE;
    case PresentationState.ERROR_RECOVERY:
      return AvatarState.IDLE;
    case PresentationState.COMPLETED:
      return AvatarState.COMPLETED;
    default:
      return AvatarState.IDLE;
  }
}

/** Pure mapping: PresentationState -> the legacy phase union InterviewScreen.tsx's JSX already branches on. */
export function presentationStateToLegacyPhase(presentationState: PresentationState): LegacyInterviewPhase {
  switch (presentationState) {
    case PresentationState.PRE_START:
      return 'READY';
    case PresentationState.WELCOME:
      return 'WELCOME';
    case PresentationState.ASKING_QUESTION:
      return 'QUESTION';
    case PresentationState.LISTENING:
      return 'LISTENING';
    case PresentationState.ANSWER_FINALIZING:
    case PresentationState.ACKNOWLEDGING:
    case PresentationState.THINKING_SHORT:
    case PresentationState.THINKING_LONG:
      return 'PROCESSING';
    case PresentationState.PREPARING_QUESTION:
    case PresentationState.QUESTION_READY:
      return 'NEXT_QUESTION';
    case PresentationState.ERROR_RECOVERY:
      // Routes into the SAME error-banner-augmented LISTENING UI
      // InterviewScreen.tsx already renders (submissionError + Start
      // Answer/Type Answer) rather than a second error surface.
      return 'LISTENING';
    case PresentationState.COMPLETED:
      return 'COMPLETED';
    default:
      return 'READY';
  }
}

export interface UseInterviewPresentationStateReturn {
  presentationState: PresentationState;
  elapsedMs: number;
  /** Current question generation id — pass to isQuestionCurrent() from any async callback before it mutates state. */
  currentQuestionGeneration: () => number;
  /** Current request generation id — pass to isRequestCurrent() from any async callback before it mutates state. */
  currentRequestGeneration: () => number;
  isQuestionCurrent: (questionGeneration: number) => boolean;
  isRequestCurrent: (requestGeneration: number) => boolean;
  startInterview: () => void;
  beginAsking: () => number;
  questionSpoken: (questionGeneration: number) => void;
  beginAnswerFinalizing: () => void;
  beginRequest: () => number;
  submitSucceededNextQuestion: (requestGeneration: number) => number;
  submitSucceededCompleted: (requestGeneration: number) => void;
  questionTextAvailable: (requestGeneration: number, questionGeneration: number) => void;
  submitFailed: (requestGeneration: number) => void;
  resetForQuestion: () => number;
  resetToPreStart: () => void;
}

/**
 * React wrapper around `presentationReducer`. Owns the monotonic generation
 * counters (plain refs — they are ids/bookkeeping, not renderable state) and
 * a tick loop that only runs while genuinely waiting, purely to escalate the
 * neutral "still thinking" treatment — it never delays or gates the real
 * transition on completion.
 */
export function useInterviewPresentationState(): UseInterviewPresentationStateReturn {
  const [state, dispatch] = useReducer(presentationReducer, undefined, createInitialPresentationState);
  const requestGenRef = useRef(0);
  const questionGenRef = useRef(0);

  // Tick loop: only alive while in a waiting state, cleared immediately on
  // any state change (including a real completion) or unmount. This is the
  // one timer in this module, and it never gates anything — see file header.
  useEffect(() => {
    if (!WAITING_STATES.has(state.presentationState) || state.waitStartedAt == null) return undefined;
    const myRequestGeneration = state.requestGeneration;
    const startedAt = state.waitStartedAt;
    const id = window.setInterval(() => {
      dispatch({ type: 'TICK', requestGeneration: myRequestGeneration, elapsedMs: Date.now() - startedAt });
    }, 250);
    return () => window.clearInterval(id);
  }, [state.presentationState, state.waitStartedAt, state.requestGeneration]);

  // Unmount safety: invalidate every outstanding generation so a late async
  // callback (slow submit response, delayed TTS onEnd) that fires after
  // unmount can never affect anything — isRequestCurrent/isQuestionCurrent
  // will report false, and any caller code must check those before touching
  // component state.
  useEffect(
    () => () => {
      requestGenRef.current += 1;
      questionGenRef.current += 1;
    },
    []
  );

  const isQuestionCurrent = useCallback(
    (questionGeneration: number) => questionGenRef.current === questionGeneration,
    []
  );
  const isRequestCurrent = useCallback(
    (requestGeneration: number) => requestGenRef.current === requestGeneration,
    []
  );

  const startInterview = useCallback(() => dispatch({ type: 'START_INTERVIEW' }), []);

  const beginAsking = useCallback(() => {
    const questionGeneration = ++questionGenRef.current;
    dispatch({ type: 'BEGIN_ASKING', questionGeneration });
    return questionGeneration;
  }, []);

  const questionSpoken = useCallback((questionGeneration: number) => {
    dispatch({ type: 'QUESTION_SPOKEN', questionGeneration });
  }, []);

  const beginAnswerFinalizing = useCallback(() => {
    dispatch({ type: 'BEGIN_ANSWER_FINALIZING', questionGeneration: questionGenRef.current });
  }, []);

  const beginRequest = useCallback(() => {
    const requestGeneration = ++requestGenRef.current;
    dispatch({
      type: 'BEGIN_REQUEST',
      requestGeneration,
      questionGeneration: questionGenRef.current,
      now: Date.now(),
    });
    return requestGeneration;
  }, []);

  const submitSucceededNextQuestion = useCallback((requestGeneration: number) => {
    const questionGeneration = ++questionGenRef.current;
    dispatch({
      type: 'SUBMIT_SUCCEEDED',
      requestGeneration,
      questionGeneration,
      outcome: 'next-question',
    });
    return questionGeneration;
  }, []);

  const submitSucceededCompleted = useCallback((requestGeneration: number) => {
    dispatch({
      type: 'SUBMIT_SUCCEEDED',
      requestGeneration,
      questionGeneration: questionGenRef.current,
      outcome: 'completed',
    });
  }, []);

  const questionTextAvailable = useCallback((requestGeneration: number, questionGeneration: number) => {
    dispatch({ type: 'QUESTION_TEXT_AVAILABLE', requestGeneration, questionGeneration });
  }, []);

  const submitFailed = useCallback((requestGeneration: number) => {
    dispatch({ type: 'SUBMIT_FAILED', requestGeneration });
  }, []);

  const resetForQuestion = useCallback(() => {
    const questionGeneration = ++questionGenRef.current;
    dispatch({ type: 'RESET_FOR_QUESTION', questionGeneration });
    return questionGeneration;
  }, []);

  const resetToPreStart = useCallback(() => {
    requestGenRef.current += 1;
    questionGenRef.current += 1;
    dispatch({ type: 'RESET_TO_PRE_START' });
  }, []);

  return {
    presentationState: state.presentationState,
    elapsedMs: state.elapsedMs,
    currentQuestionGeneration: () => questionGenRef.current,
    currentRequestGeneration: () => requestGenRef.current,
    isQuestionCurrent,
    isRequestCurrent,
    startInterview,
    beginAsking,
    questionSpoken,
    beginAnswerFinalizing,
    beginRequest,
    submitSucceededNextQuestion,
    submitSucceededCompleted,
    questionTextAvailable,
    submitFailed,
    resetForQuestion,
    resetToPreStart,
  };
}
