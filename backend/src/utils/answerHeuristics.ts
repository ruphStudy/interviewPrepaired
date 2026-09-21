/**
 * Small, deterministic (no AI) heuristics used by AnswerSignalService to
 * classify an answer as effectively "no answer" before any AI-derived
 * signal is consulted. Word-count based (not character-count) and
 * deliberately tolerant of short-but-valid technical answers (e.g.
 * "O(log n)", "use an index") — only clearly-empty or explicit-refusal
 * answers are flagged.
 */

const REFUSAL_PHRASES = [
  "i don't know",
  'i dont know',
  'not sure',
  'no idea',
  "i'm not sure",
  'im not sure',
  'skip',
  'pass',
  'i have no idea',
];

// Kept deliberately low: a real, valid technical answer can be very short
// and still be exactly 1-2 whitespace-separated tokens ("O(log n)" splits
// into ["O(log", "n)"] = 2 tokens; "use an index" = 3). Flagging anything
// below ~3-4 words (as a naive threshold might) would misclassify those as
// no-answer, which is explicitly wrong — so only 0-1 word answers (plus the
// explicit refusal-phrase denylist below) are treated as no-answer here.
const MIN_WORD_COUNT = 2;

/**
 * true when the trimmed answer is empty/whitespace-only, has fewer than
 * MIN_WORD_COUNT words, or is (after lowercasing) one of a short denylist of
 * refusal phrases.
 */
export function isEffectivelyNoAnswer(answer: string): boolean {
  const trimmed = (answer ?? '').trim();
  if (trimmed.length === 0) return true;

  const normalized = trimmed.toLowerCase().replace(/[.!?]+$/, '').trim();
  if (REFUSAL_PHRASES.includes(normalized)) return true;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount < MIN_WORD_COUNT;
}
