/**
 * Phase 7B — centralized latency-tier configuration.
 *
 * These thresholds are a CEILING/ORDERING policy only: they say "if we are
 * STILL WAITING at this elapsed time, it is reasonable to show a
 * progressively more patient neutral status" — they are never a floor and
 * must never be used to hold back a real response that already arrived.
 * Nothing in this module schedules work or delays anything; it is pure
 * arithmetic over an `elapsedMs` value the caller measures itself (e.g. via
 * `Date.now() - requestStartedAt`).
 *
 * "No Artificial Delay Rule": no setTimeout/await-delay anywhere in this
 * file or in anything that consumes it purely to simulate humanlike pacing.
 * A tick loop that re-evaluates `getLatencyTier` while a real request is
 * still in flight is fine (it only escalates a label); calling
 * `getLatencyTier` after the real response has already resolved and using
 * it to gate the transition to QUESTION_READY is exactly what this module
 * forbids.
 */

/** Named ceilings, in milliseconds, matching the product's stated targets. */
export const LATENCY_TIER_THRESHOLDS_MS = {
  /** <1s: response is fast enough that no "thinking" treatment is needed at all. */
  INSTANT_CEILING_MS: 1000,
  /** 1-3s: a brief, neutral acknowledgement is appropriate once this much time has genuinely elapsed. */
  SHORT_CEILING_MS: 3000,
  /** 3-5s: a visible "still thinking" treatment is appropriate once this much time has genuinely elapsed. */
  MEDIUM_CEILING_MS: 5000,
  // >5000ms falls into the LONG tier (no upper bound).
} as const;

export type LatencyTier = 'INSTANT' | 'SHORT' | 'MEDIUM' | 'LONG';

/**
 * The neutral presentation states a latency tier may suggest. Deliberately
 * a subset of `PresentationState` (see useInterviewPresentationState.ts) —
 * only the states that are ever a *function of elapsed wait time*.
 */
export type LatencyPresentationHint = 'QUESTION_READY' | 'ACKNOWLEDGING' | 'THINKING_SHORT' | 'THINKING_LONG';

export interface LatencyTierInfo {
  tier: LatencyTier;
  /**
   * The state that is appropriate to be showing IF still waiting at this
   * elapsed time. Never a directive to wait until this state is "used up"
   * — a real completion always wins immediately regardless of tier.
   */
  presentationState: LatencyPresentationHint;
  /** Whether a short acknowledgement treatment is appropriate yet. */
  canUseAcknowledgement: boolean;
  /** Whether the elapsed wait has crossed into "long thinking" territory. */
  shouldUseLongThinking: boolean;
  elapsedMs: number;
}

/**
 * Pure function: given how long we have genuinely been waiting for a real
 * response, return the ceiling tier info. Callers must only invoke this
 * while ACTUALLY still waiting — the instant a real response arrives, skip
 * straight to the real outcome (QUESTION_READY / ERROR_RECOVERY) without
 * consulting this function again.
 */
export function getLatencyTier(elapsedMs: number): LatencyTierInfo {
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;

  if (safeElapsed < LATENCY_TIER_THRESHOLDS_MS.INSTANT_CEILING_MS) {
    return {
      tier: 'INSTANT',
      presentationState: 'QUESTION_READY',
      canUseAcknowledgement: false,
      shouldUseLongThinking: false,
      elapsedMs: safeElapsed,
    };
  }

  if (safeElapsed < LATENCY_TIER_THRESHOLDS_MS.SHORT_CEILING_MS) {
    return {
      tier: 'SHORT',
      presentationState: 'ACKNOWLEDGING',
      canUseAcknowledgement: true,
      shouldUseLongThinking: false,
      elapsedMs: safeElapsed,
    };
  }

  if (safeElapsed < LATENCY_TIER_THRESHOLDS_MS.MEDIUM_CEILING_MS) {
    return {
      tier: 'MEDIUM',
      presentationState: 'THINKING_SHORT',
      canUseAcknowledgement: true,
      shouldUseLongThinking: false,
      elapsedMs: safeElapsed,
    };
  }

  return {
    tier: 'LONG',
    presentationState: 'THINKING_LONG',
    canUseAcknowledgement: true,
    shouldUseLongThinking: true,
    elapsedMs: safeElapsed,
  };
}
