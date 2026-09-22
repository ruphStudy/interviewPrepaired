import { useEffect, useRef, useState } from 'react';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { PresentationState, presentationStateToAvatarState } from './useInterviewPresentationState';
import { isSafeForDistractedLook, isSafeForMicroBehavior } from '../utils/avatarSemanticState';
import {
  createMicroBehaviorSchedulerState,
  reconcileSchedulerSessionState,
  selectMicroBehavior,
  type MicroBehaviorType,
} from '../utils/microBehaviorScheduler';
import { prefersReducedMotion } from '../utils/reducedMotion';

/**
 * Phase 10B/10C — the ONE place that resolves "what semantic state is the
 * avatar in right now" for `InterviewAvatar.tsx` to consume, per the master
 * spec's "exactly ONE place" requirement.
 *
 * This is deliberately a THIN layer, not a second state machine:
 *  - `avatarState` is a pure, synchronous derivation of Phase 7's
 *    `presentationState` (via the exact same `presentationStateToAvatarState`
 *    `InterviewScreen.tsx` already called directly pre-Phase-10) — this hook
 *    owns no state of its own that could ever disagree with the reducer.
 *  - `currentMicroBehavior` is a SEPARATE, presentation-only overlay concept
 *    (never written back to `presentationState`, never capable of gating or
 *    delaying a real transition — see avatarSemanticState.ts's header for
 *    why that is true by construction, not just convention) scheduled by
 *    the pure, testable `selectMicroBehavior` (utils/microBehaviorScheduler.ts)
 *    on a fixed interval while the current turn is a safe, low-priority
 *    moment.
 *
 * Per-item audio-plan hints (Phase 10B's `AudioPlanItem.avatarState` /
 * `onItemStart`/`onItemEnd`) are intentionally NOT consumed here to drive
 * `avatarState` — see `utils/audioPlanBuilder.ts`'s header: every item in a
 * turn's lead-in+question plan already shares the same
 * `avatarStateHint`/`'ASKING_QUESTION'` value as the reducer's own
 * `ASKING_QUESTION`, so re-deriving from item events would be redundant at
 * best and a flicker risk at worst. Callers still SHOULD wire those
 * callbacks through `useAudioPlaybackQueue` (e.g. for future richer
 * per-item assets) — this controller does not require it.
 */

const SCHEDULER_TICK_MS = 4_000;
const MICRO_BEHAVIOR_VISIBLE_MS: Record<MicroBehaviorType, number> = {
  SMALL_NOD: 900,
  BLINK: 500,
  DISTRACTED_LOOK: 1_600,
};

export interface UseAvatarPresentationControllerArgs {
  presentationState: PresentationState;
  /** Real mic-recording flag (Phase 2/pre-existing) — resolves LISTENING's one genuine ambiguity, exactly as `InterviewScreen.tsx` already did pre-Phase-10. */
  isActivelyListening: boolean;
  /** `useInterviewPresentationState`'s `sessionGeneration` — bumped only on a genuinely new interview session; resets the `DISTRACTED_LOOK` per-session budget. */
  sessionGeneration: number;
  /** The CURRENT question turn's `ConversationPresentationPlan.presentationType`, if known — set by the caller right before playing that turn's lead-in/question audio; purely presentation-only. */
  currentPresentationType?: string;
}

export interface UseAvatarPresentationControllerReturn {
  avatarState: AvatarState;
  currentMicroBehavior: MicroBehaviorType | null;
}

export function useAvatarPresentationController(
  args: UseAvatarPresentationControllerArgs
): UseAvatarPresentationControllerReturn {
  const avatarState = presentationStateToAvatarState(args.presentationState, args.isActivelyListening);

  const schedulerStateRef = useRef(createMicroBehaviorSchedulerState(args.sessionGeneration));
  const clearTimerRef = useRef<number | null>(null);
  const [currentMicroBehavior, setCurrentMicroBehavior] = useState<MicroBehaviorType | null>(null);

  // Keep the ref-held args current for the interval closure below without
  // re-arming the interval itself on every render.
  const latestArgsRef = useRef(args);
  latestArgsRef.current = args;

  useEffect(() => {
    schedulerStateRef.current = reconcileSchedulerSessionState(schedulerStateRef.current, args.sessionGeneration);
  }, [args.sessionGeneration]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = latestArgsRef.current;
      const safetyInput = {
        presentationState: current.presentationState,
        isActivelyListening: current.isActivelyListening,
        presentationType: current.currentPresentationType,
      };
      const result = selectMicroBehavior(schedulerStateRef.current, {
        now: Date.now(),
        isEligibleContext: isSafeForMicroBehavior(safetyInput),
        isEligibleForDistraction: isSafeForDistractedLook(safetyInput),
        prefersReducedMotion: prefersReducedMotion(),
      });
      schedulerStateRef.current = result.state;
      if (result.selected) {
        const selected = result.selected;
        setCurrentMicroBehavior(selected);
        if (clearTimerRef.current != null) window.clearTimeout(clearTimerRef.current);
        clearTimerRef.current = window.setTimeout(() => {
          setCurrentMicroBehavior(null);
        }, MICRO_BEHAVIOR_VISIBLE_MS[selected]);
      }
    }, SCHEDULER_TICK_MS);

    return () => {
      window.clearInterval(id);
      if (clearTimerRef.current != null) window.clearTimeout(clearTimerRef.current);
    };
    // Intentionally only [] — this interval reads the freshest inputs from
    // `latestArgsRef` on every tick rather than being torn down/recreated
    // on every presentationState change (which would otherwise reset the
    // MIN_GAP_ANY_MS cooldown's effective cadence far more often than
    // intended).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { avatarState, currentMicroBehavior };
}
