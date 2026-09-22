/**
 * Phase 8 (8D) — weighted phrase selection, silence, and repetition
 * prevention. Pure, deterministic given a fixed `rng` — no AI call, no I/O,
 * no wall-clock dependency (repetition cooldown is measured in
 * turns/positions within `recentPhraseHistory`, never elapsed time).
 */

import { HumanizerInterviewMode, PHRASE_LIBRARY, Phrase, PhraseCategory } from '../constants/phraseLibrary';

export interface SelectedPhrase {
  phraseId: string;
  text: string;
  avatarStateHint: string;
}

/**
 * Relative "say nothing" weight added to each category's real-phrase pool
 * before the weighted roll — silence is a genuine, sometimes-selected
 * outcome for every category (not an error path/fallback-only branch), per
 * "don't ALWAYS use an acknowledgement / sometimes the plan should be
 * direct with no acknowledgement/transition at all." Categories that carry
 * more conversational weight when shown (CONTRADICTION_NEUTRAL grounding,
 * NO_ANSWER acknowledgement) get a lower silence weight so they're shown
 * more often than skipped, without ever making them mandatory.
 */
const SILENCE_WEIGHT: Record<PhraseCategory, number> = {
  NEUTRAL_ACK: 4,
  THINKING: 3,
  PROBE: 2,
  TRANSITION: 2,
  CLARIFY: 2,
  CALLBACK: 2,
  CONTRADICTION_NEUTRAL: 1,
  CHALLENGE: 2,
  NO_ANSWER: 1,
  LONG_ANSWER: 3,
  DELAY_BRIDGE: 2,
  // Phase 11 — WELCOME/CLOSING are one-time scripted moments, never
  // mid-interview filler: silence is never an acceptable outcome for
  // either, unlike every category above.
  WELCOME: 0,
  CLOSING: 0,
};

function isOnCooldown(phrase: Phrase, recentPhraseHistory: string[]): boolean {
  if (phrase.minimumGap <= 0 || recentPhraseHistory.length === 0) return false;
  const windowStart = Math.max(0, recentPhraseHistory.length - phrase.minimumGap);
  return recentPhraseHistory.slice(windowStart).includes(phrase.id);
}

/**
 * Selects (at most) one phrase for `category`, filtered to phrases allowed
 * in `mode` and not currently on cooldown, then makes a weighted random
 * choice — via the injectable `rng` (default `Math.random`) — among the
 * eligible phrases PLUS a "silence" outcome baked into the same weighted
 * pool. Returns `null` for silence: either because the weighted roll
 * genuinely landed there, or because every phrase in this category+mode is
 * currently on cooldown (never forces a repeat).
 */
export function selectPhrase(
  category: PhraseCategory,
  mode: HumanizerInterviewMode,
  recentPhraseHistory: string[],
  rng: () => number = Math.random
): SelectedPhrase | null {
  const candidates = PHRASE_LIBRARY.filter((p) => p.category === category && p.allowedModes.includes(mode));
  const eligible = candidates.filter((p) => !isOnCooldown(p, recentPhraseHistory));
  if (eligible.length === 0) return null;

  const silenceWeight = SILENCE_WEIGHT[category] ?? 0;
  const realWeight = eligible.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  const totalWeight = realWeight + Math.max(0, silenceWeight);
  if (totalWeight <= 0) return null;

  let roll = rng() * totalWeight;
  if (roll < silenceWeight) return null;
  roll -= silenceWeight;

  for (const phrase of eligible) {
    const weight = Math.max(0, phrase.weight);
    if (roll < weight) {
      return { phraseId: phrase.id, text: phrase.text, avatarStateHint: phrase.avatarStateHint };
    }
    roll -= weight;
  }

  // Floating-point edge case only (roll landed exactly on the boundary) —
  // fall back to the last eligible phrase rather than silence, since the
  // roll already committed to the "real phrase" portion of the pool above.
  const last = eligible[eligible.length - 1];
  return { phraseId: last.id, text: last.text, avatarStateHint: last.avatarStateHint };
}
