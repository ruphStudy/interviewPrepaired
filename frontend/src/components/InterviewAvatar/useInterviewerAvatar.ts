import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getActiveInterviewerPack,
  ListeningReactionCategory,
  SpeakingClipKey,
  NeutralClipKey,
  PositiveClipKey,
  StrongClipKey,
} from './interviewerMediaConfig';

export type InterviewerSemanticState = 'IDLE' | 'SPEAKING' | 'LISTENING' | 'INTERRUPTION';
export type InterviewerSpeakingContext = 'welcome' | 'question' | 'closing';

interface UseInterviewerAvatarParams {
  /** Interviewer/system TTS is currently playing. */
  isSpeaking: boolean;
  /** Candidate's microphone/speech recognition is currently active. */
  isListening: boolean;
  /** Coarse context for which SPEAKING clip pool to lean on — read from existing interview `phase`, never a new business-logic input. */
  speakingContext?: InterviewerSpeakingContext;
  /** Changing this (e.g. interviewId) resets all session-scoped behavior state — never let one interview's reaction history/interruption usage leak into the next. */
  resetKey?: string | number | null;
}

interface CurrentMedia {
  src: string;
  isVideo: boolean;
}

const MEDIUM_ANSWER_MS = 8000;
const LONG_ANSWER_MS = 20000;
const INTERRUPTION_CHANCE = 0.065; // ~6.5%, within the recommended 5-8% band

const SPEAKING_WEIGHTS: Record<InterviewerSpeakingContext, Record<SpeakingClipKey, number>> = {
  // Overall baseline preference across the whole interview: talking-2 ~50%, talking-3 ~30%, talking-1 ~20%.
  question: { 'talking-2': 0.5, 'talking-3': 0.3, 'talking-1': 0.2 },
  welcome: { 'talking-1': 0.45, 'talking-3': 0.4, 'talking-2': 0.15 },
  closing: { 'talking-3': 0.45, 'talking-1': 0.4, 'talking-2': 0.15 },
};

const MEDIUM_ANSWER_WEIGHTS: Record<Exclude<ListeningReactionCategory, 'strong'>, number> = {
  neutral: 0.82,
  positive: 0.18,
};

const LONG_ANSWER_WEIGHTS: Record<ListeningReactionCategory, number> = {
  neutral: 0.65,
  positive: 0.2,
  strong: 0.1,
};

function weightedPick<T extends string>(weights: Partial<Record<T, number>>, exclude?: T | null): T {
  const allEntries = Object.entries(weights) as [T, number][];
  const entries = exclude ? allEntries.filter(([key]) => key !== exclude) : allEntries;
  const pool = entries.length > 0 ? entries : allEntries;
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return pool[pool.length - 1][0];
}

function pickRandomExcluding<T>(pool: T[], exclude: T | null): T {
  const candidates = exclude !== null && pool.length > 1 ? pool.filter((item) => item !== exclude) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getSpeakingContextLabel(context?: InterviewerSpeakingContext): InterviewerSpeakingContext {
  return context ?? 'question';
}

function decideListeningStep(
  elapsedMs: number,
  lastCategory: ListeningReactionCategory | null,
  interruptionUsed: boolean
): ListeningReactionCategory | 'interruption' {
  // Never play strong/positive reactions back-to-back — always settle back to neutral first.
  if (lastCategory === 'positive' || lastCategory === 'strong') {
    return 'neutral';
  }

  if (elapsedMs >= LONG_ANSWER_MS) {
    if (!interruptionUsed && Math.random() < INTERRUPTION_CHANCE) {
      return 'interruption';
    }
    return weightedPick(LONG_ANSWER_WEIGHTS, lastCategory);
  }

  if (elapsedMs >= MEDIUM_ANSWER_MS) {
    return weightedPick(MEDIUM_ANSWER_WEIGHTS, lastCategory as Exclude<ListeningReactionCategory, 'strong'> | null);
  }

  return 'neutral';
}

/**
 * Interviewer avatar behavior controller. Translates the interview's
 * existing semantic booleans (isSpeaking/isListening) plus a coarse
 * speaking context into a concrete media clip, sequencing clips so the
 * interview feels like a real video call rather than randomly swapping
 * files. Owns ONLY presentation/behavior state — never touches speech
 * recognition, TTS, question flow, or interview completion.
 */
export function useInterviewerAvatar({ isSpeaking, isListening, speakingContext, resetKey }: UseInterviewerAvatarParams) {
  const pack = getActiveInterviewerPack();

  const [semanticState, setSemanticState] = useState<InterviewerSemanticState>('IDLE');
  const [media, setMedia] = useState<CurrentMedia>({ src: pack.idle, isVideo: false });

  const lastSpeakingClipRef = useRef<SpeakingClipKey | null>(null);
  const lastListeningClipRef = useRef<NeutralClipKey | PositiveClipKey | StrongClipKey | null>(null);
  const lastCategoryRef = useRef<ListeningReactionCategory | null>(null);
  const candidateSpeakingStartedAtRef = useRef<number | null>(null);
  const interruptionUsedRef = useRef(false);

  const resetSession = useCallback(() => {
    lastSpeakingClipRef.current = null;
    lastListeningClipRef.current = null;
    lastCategoryRef.current = null;
    candidateSpeakingStartedAtRef.current = null;
    interruptionUsedRef.current = false;
    setSemanticState('IDLE');
    setMedia({ src: pack.idle, isVideo: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New interview session — never let previous behavior state leak forward.
  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pickSpeakingClip = useCallback(() => {
    const context = getSpeakingContextLabel(speakingContext);
    const key = weightedPick(SPEAKING_WEIGHTS[context], lastSpeakingClipRef.current);
    lastSpeakingClipRef.current = key;
    setMedia({ src: pack.speaking[key], isVideo: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingContext]);

  const pickListeningClip = useCallback((category: ListeningReactionCategory) => {
    let key: NeutralClipKey | PositiveClipKey | StrongClipKey;
    if (category === 'neutral') {
      const pool = Object.keys(pack.listening.neutral) as NeutralClipKey[];
      key = pickRandomExcluding(pool, lastListeningClipRef.current as NeutralClipKey | null);
    } else if (category === 'positive') {
      const pool = Object.keys(pack.listening.positive) as PositiveClipKey[];
      key = pickRandomExcluding(pool, lastListeningClipRef.current as PositiveClipKey | null);
    } else {
      const pool = Object.keys(pack.listening.strong) as StrongClipKey[];
      key = pool[0];
    }
    lastListeningClipRef.current = key;
    lastCategoryRef.current = category;
    const src =
      category === 'neutral'
        ? pack.listening.neutral[key as NeutralClipKey]
        : category === 'positive'
          ? pack.listening.positive[key as PositiveClipKey]
          : pack.listening.strong[key as StrongClipKey];
    setMedia({ src, isVideo: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startInterruption = useCallback(() => {
    interruptionUsedRef.current = true;
    lastCategoryRef.current = null;
    setSemanticState('INTERRUPTION');
    setMedia({ src: pack.interruption, isVideo: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goIdle = useCallback(() => {
    setSemanticState('IDLE');
    setMedia({ src: pack.idle, isVideo: false });
    candidateSpeakingStartedAtRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the interview's own speaking/listening booleans changing —
  // this is the ONLY place semantic-state transitions are decided.
  useEffect(() => {
    if (isSpeaking) {
      setSemanticState((prev) => {
        if (prev !== 'SPEAKING') {
          pickSpeakingClip();
          return 'SPEAKING';
        }
        return prev;
      });
      return;
    }

    if (isListening) {
      setSemanticState((prev) => {
        if (prev !== 'LISTENING' && prev !== 'INTERRUPTION') {
          candidateSpeakingStartedAtRef.current = Date.now();
          pickListeningClip('neutral');
          return 'LISTENING';
        }
        return prev;
      });
      return;
    }

    setSemanticState((prev) => {
      if (prev !== 'IDLE') {
        goIdle();
        return 'IDLE';
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, isListening]);

  // Video `ended` — rotate to the next clip while the semantic state is
  // still active; a state change mid-clip is already handled by the effect
  // above, so this only needs to continue the CURRENT state's sequence.
  const handleClipEnded = useCallback(() => {
    if (semanticState === 'SPEAKING') {
      if (isSpeaking) {
        pickSpeakingClip();
      } else {
        goIdle();
      }
      return;
    }

    if (semanticState === 'INTERRUPTION') {
      // Purely visual — never touches mic/STT/timers/transcript. Forced back to neutral listening once it finishes.
      if (isListening) {
        pickListeningClip('neutral');
        setSemanticState('LISTENING');
      } else {
        goIdle();
      }
      return;
    }

    if (semanticState === 'LISTENING') {
      if (!isListening) {
        goIdle();
        return;
      }
      const elapsed = candidateSpeakingStartedAtRef.current ? Date.now() - candidateSpeakingStartedAtRef.current : 0;
      const step = decideListeningStep(elapsed, lastCategoryRef.current, interruptionUsedRef.current);
      if (step === 'interruption') {
        startInterruption();
      } else {
        pickListeningClip(step);
      }
      return;
    }
    // IDLE has no video, so `ended` never fires for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticState, isSpeaking, isListening, pickSpeakingClip, pickListeningClip, startInterruption, goIdle]);

  return {
    semanticState,
    mediaSrc: media.src,
    isVideo: media.isVideo,
    handleClipEnded,
    resetSession,
  };
}
