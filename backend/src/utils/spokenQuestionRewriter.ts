/**
 * Phase 8 (8B) — deterministic, non-AI spoken-form rewriter.
 *
 * Small, regex-based, opener-only transformations that make a handful of
 * common AI-generated question openings ("Explain X", "Describe X", ...)
 * read a little more like a spoken interviewer asking the question, rather
 * than a written prompt. This is deliberately NOT a general rewriter:
 * - Every pattern is anchored to the very START of the string (`^...`), so
 *   it can only ever touch the opening verb/clause — everything after the
 *   matched prefix (technical terms, quoted phrases, proper nouns, code
 *   tokens) is copied through byte-for-byte, never re-cased or reworded.
 * - If no pattern matches, the canonical text is returned completely
 *   unchanged — "do not over-rewrite; if the generated question is already
 *   natural enough, leave it alone."
 * - `context` (targetConcept/sourcePhraseReference) is accepted for
 *   interface-completeness/future use but is deliberately NOT used to
 *   prepend a grounding lead-in here: `ConversationHumanizerService`
 *   already has a `transitionText` slot for that grounding (e.g. "You
 *   mentioned {targetConcept} there — "), and stacking the same grounding
 *   in both places would violate the "at most one short lead-in" rule.
 *   Keeping the rewriter's job narrowly scoped to tense/phrasing only is
 *   the single place that concern is decided (see 8B's own reasoning in
 *   the Phase 8 brief).
 *
 * `canonicalQuestionText` (what's already persisted as
 * `IQuestion.questionText`) is NEVER mutated by this function — callers
 * only ever use its return value as a NEW, presentation-only
 * `spokenQuestionText`, never writing it back over the canonical field.
 */

export interface SpokenRewriteContext {
  targetConcept?: string;
  sourcePhraseReference?: string;
}

interface RewritePattern {
  /** Anchored to the start of the string; matches the opening verb + trailing whitespace ONLY. */
  pattern: RegExp;
  replacement: string;
}

// Patterns are checked in order; the FIRST match wins (they are mutually
// exclusive by construction — each matches a different opening verb — so
// ordering only matters for readability, not correctness). Sourced from
// this codebase's actual generated-question phrasing conventions (see
// OpenAIService.ts's follow-up prompt, which itself favors "Walk me
// through.../Describe a time when..." — already-natural spoken phrasing
// that intentionally has NO pattern below, since it needs no rewrite) and
// common structured-question openers ("Explain"/"Describe"/"Define"/
// "Compare"/"List"/"Discuss"/"Outline") that read as written-prompt style
// rather than spoken-interviewer style.
const REWRITE_PATTERNS: RewritePattern[] = [
  { pattern: /^Explain\s+/i, replacement: 'How would you explain ' },
  { pattern: /^Describe\s+/i, replacement: 'Can you walk me through ' },
  { pattern: /^Define\s+/i, replacement: 'How would you define ' },
  { pattern: /^Compare\s+/i, replacement: 'How would you compare ' },
  { pattern: /^Discuss\s+/i, replacement: 'Could you discuss ' },
  { pattern: /^Outline\s+/i, replacement: 'Could you outline ' },
  { pattern: /^List\s+/i, replacement: 'Could you list ' },
  { pattern: /^Summarize\s+/i, replacement: 'Could you summarize ' },
];

/**
 * Rewrites ONLY the opening clause of `canonicalText` into a more spoken
 * form when a known, safe pattern matches; otherwise returns it unchanged.
 * Pure, synchronous, deterministic — no AI call, no randomness, no I/O.
 */
export function rewriteToSpokenForm(canonicalText: string, _context?: SpokenRewriteContext): string {
  if (typeof canonicalText !== 'string') return canonicalText;
  const trimmed = canonicalText.trim();
  if (trimmed.length === 0) return canonicalText;

  for (const { pattern, replacement } of REWRITE_PATTERNS) {
    const match = canonicalText.match(pattern);
    if (!match) continue;
    const rest = canonicalText.slice(match[0].length);
    // Never produce a dangling rewrite with no object following the verb.
    if (!rest.trim()) continue;
    return `${replacement}${rest}`;
  }

  return canonicalText;
}
