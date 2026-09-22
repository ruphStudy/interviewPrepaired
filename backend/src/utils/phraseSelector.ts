/**
 * Phase 8 (8D) — weighted phrase selection, silence, and repetition
 * prevention. Pure, deterministic given a fixed `rng` — no AI call, no I/O,
 * no wall-clock dependency (repetition cooldown is measured in
 * turns/positions within `recentPhraseHistory`, never elapsed time).
 *
 * Phase 12B adds a PURE weight-MULTIPLIER layer (`applyPersonalityWeightAdjustment`)
 * on top of this same mechanism — personality never introduces a new phrase
 * pool, never changes cooldown/history behavior, and (critically) never
 * changes WHICH phrases are ELIGIBLE for a given category+mode: it is
 * applied strictly AFTER mode/cooldown filtering, only nudging the relative
 * WEIGHT of already-eligible phrases (and the silence outcome's own
 * weight). This is what makes "employer + CHALLENGING can only ever draw
 * from the employer-safe phrase pool" true by construction rather than by a
 * separate check: CHALLENGE/PROBE phrases are already absent from the
 * `eligible` array in employer mode (phraseLibrary.ts's own `allowedModes`),
 * so multiplying their (non-existent, in that array) weight does nothing.
 */

import { HumanizerInterviewMode, PHRASE_LIBRARY, Phrase, PhraseCategory } from '../constants/phraseLibrary';
import { DEFAULT_INTERVIEW_PERSONALITY, InterviewerNeutrality, InterviewPersonality } from '../constants/interviewModePolicy';

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

// ============================================================================
// Phase 12B — personality weight multipliers. Bounded (0.6x-1.4x) around the
// existing baseline weight; PROFESSIONAL is an EMPTY map (byte-identical to
// pre-Phase-12 behavior — the existing weight values are used completely
// unmodified, never merely "multiplied by 1"). FRIENDLY boosts the warm
// acknowledgement-family categories and dampens the firmer probe/challenge
// ones; CHALLENGING does the inverse and additionally dampens filler
// (THINKING) to read as more direct/less-hedging. Every category not listed
// for a personality is left completely unmodified for that personality.
// ============================================================================
const PERSONALITY_CATEGORY_WEIGHT_MULTIPLIER: Record<InterviewPersonality, Partial<Record<PhraseCategory, number>>> = {
  PROFESSIONAL: {},
  FRIENDLY: {
    NEUTRAL_ACK: 1.3,
    LONG_ANSWER: 1.3,
    NO_ANSWER: 1.3,
    PROBE: 0.8,
    CHALLENGE: 0.6,
    CONTRADICTION_NEUTRAL: 0.85,
  },
  CHALLENGING: {
    PROBE: 1.3,
    CHALLENGE: 1.4,
    CONTRADICTION_NEUTRAL: 1.15,
    NEUTRAL_ACK: 0.85,
    THINKING: 0.8,
  },
};

/**
 * Same shape/intent as the category weight multiplier above, but applied to
 * the "say nothing" outcome's own weight (SILENCE_WEIGHT below) — FRIENDLY
 * shows its warmth more often (lower silence chance on the ack-family
 * categories), CHALLENGING "reduces overall filler frequency" by leaning
 * MORE toward silence on the purely decorative categories (NEUTRAL_ACK/
 * THINKING) while still never touching categories that carry real
 * conversational content (CONTRADICTION_NEUTRAL/NO_ANSWER keep their
 * existing silence weight for every personality).
 */
const PERSONALITY_SILENCE_WEIGHT_MULTIPLIER: Record<InterviewPersonality, Partial<Record<PhraseCategory, number>>> = {
  PROFESSIONAL: {},
  FRIENDLY: { NEUTRAL_ACK: 0.7, THINKING: 0.8 },
  CHALLENGING: { NEUTRAL_ACK: 1.3, THINKING: 1.2, LONG_ANSWER: 1.2 },
};

/**
 * Categories where `interviewerNeutrality: 'strict'` (employer mode — see
 * constants/interviewModePolicy.ts) caps the personality multiplier at 1.0
 * (no boost, no reduction) regardless of personality — defense in depth on
 * top of phraseLibrary.ts's own `allowedModes` exclusion. PROBE/CHALLENGE
 * are already 100% absent from the employer-mode `eligible` array by the
 * time this runs (see the file header comment), so listing them here is
 * belt-and-braces; CONTRADICTION_NEUTRAL is the one category in this set
 * that IS allowed in employer mode today, which is what makes this rule
 * directly observable/testable rather than purely theoretical.
 */
const NEUTRALITY_SENSITIVE_CATEGORIES: ReadonlySet<PhraseCategory> = new Set(['PROBE', 'CHALLENGE', 'CONTRADICTION_NEUTRAL']);

function resolveMultiplier(
  table: Record<InterviewPersonality, Partial<Record<PhraseCategory, number>>>,
  personality: InterviewPersonality,
  category: PhraseCategory,
  neutrality: InterviewerNeutrality
): number {
  if (neutrality === 'strict' && NEUTRALITY_SENSITIVE_CATEGORIES.has(category)) return 1;
  return table[personality]?.[category] ?? 1;
}

/**
 * Pure — returns a NEW array (never mutates `phrases`) with each phrase's
 * `weight` scaled by its category's personality multiplier. Structurally
 * cannot change which phrase ids are present (same length, same ids, same
 * order) — only the numeric `weight` field differs, which is exactly what
 * lets a test assert "eligibility never changes, only distribution does".
 */
export function applyPersonalityWeightAdjustment(
  phrases: Phrase[],
  personality: InterviewPersonality,
  neutrality: InterviewerNeutrality = 'relaxed'
): Phrase[] {
  const multipliers = PERSONALITY_CATEGORY_WEIGHT_MULTIPLIER[personality];
  if (!multipliers || Object.keys(multipliers).length === 0) return phrases;
  return phrases.map((phrase) => {
    const multiplier = resolveMultiplier(PERSONALITY_CATEGORY_WEIGHT_MULTIPLIER, personality, phrase.category, neutrality);
    if (multiplier === 1) return phrase;
    return { ...phrase, weight: Math.max(0, phrase.weight * multiplier) };
  });
}

function adjustSilenceWeight(
  baseWeight: number,
  category: PhraseCategory,
  personality: InterviewPersonality,
  neutrality: InterviewerNeutrality
): number {
  const multiplier = resolveMultiplier(PERSONALITY_SILENCE_WEIGHT_MULTIPLIER, personality, category, neutrality);
  return Math.max(0, baseWeight * multiplier);
}

/**
 * Selects (at most) one phrase for `category`, filtered to phrases allowed
 * in `mode` and not currently on cooldown, then makes a weighted random
 * choice — via the injectable `rng` (default `Math.random`) — among the
 * eligible phrases PLUS a "silence" outcome baked into the same weighted
 * pool. Returns `null` for silence: either because the weighted roll
 * genuinely landed there, or because every phrase in this category+mode is
 * currently on cooldown (never forces a repeat).
 *
 * `personality`/`neutrality` (Phase 12B, both optional/additive — every
 * pre-Phase-12 call site keeps calling this with 4 args and gets IDENTICAL
 * behavior, since `personality` defaults to PROFESSIONAL, whose multiplier
 * tables are empty) apply ONLY as a weight adjustment on top of the
 * already mode-filtered `eligible` array above — mode safety always wins,
 * personality can never widen eligibility.
 */
export function selectPhrase(
  category: PhraseCategory,
  mode: HumanizerInterviewMode,
  recentPhraseHistory: string[],
  rng: () => number = Math.random,
  personality: InterviewPersonality = DEFAULT_INTERVIEW_PERSONALITY,
  neutrality: InterviewerNeutrality = 'relaxed'
): SelectedPhrase | null {
  const candidates = PHRASE_LIBRARY.filter((p) => p.category === category && p.allowedModes.includes(mode));
  const eligible = candidates.filter((p) => !isOnCooldown(p, recentPhraseHistory));
  if (eligible.length === 0) return null;

  const weighted = applyPersonalityWeightAdjustment(eligible, personality, neutrality);

  const baseSilenceWeight = SILENCE_WEIGHT[category] ?? 0;
  const silenceWeight = adjustSilenceWeight(baseSilenceWeight, category, personality, neutrality);
  const realWeight = weighted.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  const totalWeight = realWeight + Math.max(0, silenceWeight);
  if (totalWeight <= 0) return null;

  let roll = rng() * totalWeight;
  if (roll < silenceWeight) return null;
  roll -= silenceWeight;

  for (const phrase of weighted) {
    const weight = Math.max(0, phrase.weight);
    if (roll < weight) {
      return { phraseId: phrase.id, text: phrase.text, avatarStateHint: phrase.avatarStateHint };
    }
    roll -= weight;
  }

  // Floating-point edge case only (roll landed exactly on the boundary) —
  // fall back to the last eligible phrase rather than silence, since the
  // roll already committed to the "real phrase" portion of the pool above.
  const last = weighted[weighted.length - 1];
  return { phraseId: last.id, text: last.text, avatarStateHint: last.avatarStateHint };
}
