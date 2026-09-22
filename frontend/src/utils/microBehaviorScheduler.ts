/**
 * Phase 10C — pure, deterministic-given-injectable-rng micro-behavior
 * SELECTION/SCHEDULING logic. Mirrors Phases 8/9's `rng`-injection
 * precedent (see e.g. `utils/predictiveBranches.ts`/`ConversationHumanizerService`
 * for the same pattern server-side) so this is directly unit-testable
 * without mocking `Math.random`.
 *
 * No visual asset exists today for any of these behaviors except a small,
 * honest, asset-free CSS nudge `InterviewAvatar.tsx` optionally applies for
 * `SMALL_NOD` — `BLINK` and `DISTRACTED_LOOK` are genuinely scheduled but
 * not yet visually realized, which is an accepted, honest Phase 10C
 * deliverable (see this phase's report). Nothing here is read by, or can
 * influence, any backend decision/scoring path — it is exported data
 * consumed only by `InterviewAvatar.tsx` for a cosmetic transform.
 */

export type MicroBehaviorType = 'SMALL_NOD' | 'BLINK' | 'DISTRACTED_LOOK';

export interface MicroBehaviorRng {
  /** A value in [0, 1) — same contract as `Math.random()`. */
  next(): number;
}

export const defaultRng: MicroBehaviorRng = { next: () => Math.random() };

export interface MicroBehaviorSchedulerState {
  /** The session boundary this scheduler state belongs to — see `reconcileSchedulerSessionState`. */
  sessionGeneration: number;
  lastAnyAt: number | null;
  lastByType: Record<MicroBehaviorType, number | null>;
  distractedLookCountThisSession: number;
}

export function createMicroBehaviorSchedulerState(sessionGeneration: number): MicroBehaviorSchedulerState {
  return {
    sessionGeneration,
    lastAnyAt: null,
    lastByType: { SMALL_NOD: null, BLINK: null, DISTRACTED_LOOK: null },
    distractedLookCountThisSession: 0,
  };
}

/**
 * Resets ALL cooldowns and the `DISTRACTED_LOOK` budget when — and only
 * when — `sessionGeneration` has genuinely changed (a new interview was
 * loaded, per `useInterviewPresentationState`'s `sessionGeneration`
 * counter, bumped only by `resetToPreStart`). Calling this with the SAME
 * `sessionGeneration` is a no-op (returns the identical state reference),
 * so it is safe to call on every render/tick without accidentally
 * resetting cooldowns mid-interview.
 */
export function reconcileSchedulerSessionState(
  state: MicroBehaviorSchedulerState,
  sessionGeneration: number
): MicroBehaviorSchedulerState {
  if (state.sessionGeneration === sessionGeneration) return state;
  return createMicroBehaviorSchedulerState(sessionGeneration);
}

// "Occasional, not constant": no two micro-behaviors of ANY type closer than
// this, plus a same-type-specific minimum gap on top of that.
const MIN_GAP_ANY_MS = 8_000;
const MIN_GAP_SAME_TYPE_MS: Record<MicroBehaviorType, number> = {
  SMALL_NOD: 15_000,
  BLINK: 6_000,
  // Budget-gated (DISTRACTED_LOOK_MAX_PER_SESSION), not cooldown-gated —
  // once the session budget is spent, the type is simply never a candidate
  // again this session, so no additional cooldown is needed on top.
  DISTRACTED_LOOK: 0,
};
export const DISTRACTED_LOOK_MAX_PER_SESSION = 1;

// Weighted candidate pool. `NOOP` intentionally dominates the weight so a
// safe, eligible, cooldown-cleared tick still does nothing most of the
// time — "occasional", not "as often as physically allowed".
const NOOP = Symbol('noop');
type Candidate = { type: MicroBehaviorType; weight: number };
const CANDIDATES: Candidate[] = [
  { type: 'BLINK', weight: 0.5 },
  { type: 'SMALL_NOD', weight: 0.35 },
  { type: 'DISTRACTED_LOOK', weight: 0.05 },
];
const NOOP_WEIGHT = 3;

export interface SelectMicroBehaviorInput {
  now: number;
  /** From `isSafeForMicroBehavior(...)` (utils/avatarSemanticState.ts). */
  isEligibleContext: boolean;
  /** From `isSafeForDistractedLook(...)` — always false whenever `isEligibleContext` is false. */
  isEligibleForDistraction: boolean;
  /** From the centralized `prefersReducedMotion()` check (utils/reducedMotion.ts). */
  prefersReducedMotion: boolean;
}

export interface SelectMicroBehaviorResult {
  state: MicroBehaviorSchedulerState;
  selected: MicroBehaviorType | null;
}

/**
 * One scheduling "tick" — pure, no I/O, no mutation of the input state.
 * Returns the (possibly unchanged) next state plus the selected behavior,
 * or `null` when nothing should play this tick (by far the common case).
 */
export function selectMicroBehavior(
  state: MicroBehaviorSchedulerState,
  input: SelectMicroBehaviorInput,
  rng: MicroBehaviorRng = defaultRng
): SelectMicroBehaviorResult {
  if (input.prefersReducedMotion) return { state, selected: null };
  if (!input.isEligibleContext) return { state, selected: null };
  if (state.lastAnyAt != null && input.now - state.lastAnyAt < MIN_GAP_ANY_MS) return { state, selected: null };

  const candidates = CANDIDATES.filter(({ type }) => {
    const lastAt = state.lastByType[type];
    if (lastAt != null && input.now - lastAt < MIN_GAP_SAME_TYPE_MS[type]) return false;
    if (type === 'DISTRACTED_LOOK') {
      if (!input.isEligibleForDistraction) return false;
      if (state.distractedLookCountThisSession >= DISTRACTED_LOOK_MAX_PER_SESSION) return false;
    }
    return true;
  });
  if (candidates.length === 0) return { state, selected: null };

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0) + NOOP_WEIGHT;
  const roll = rng.next() * totalWeight;

  let cumulative = 0;
  let chosen: MicroBehaviorType | typeof NOOP = NOOP;
  for (const c of candidates) {
    cumulative += c.weight;
    if (roll < cumulative) {
      chosen = c.type;
      break;
    }
  }
  // Falling through the candidate loop without a match means the roll
  // landed in the NOOP band — `chosen` is already NOOP in that case.

  if (chosen === NOOP) return { state, selected: null };

  const nextState: MicroBehaviorSchedulerState = {
    ...state,
    lastAnyAt: input.now,
    lastByType: { ...state.lastByType, [chosen]: input.now },
    distractedLookCountThisSession:
      chosen === 'DISTRACTED_LOOK' ? state.distractedLookCountThisSession + 1 : state.distractedLookCountThisSession,
  };
  return { state: nextState, selected: chosen };
}
