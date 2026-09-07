/**
 * Deterministic, NO-AI text chunking for organization knowledge documents
 * (29C). Pure text splitting only — never summarizes/rewrites/translates,
 * always preserves original wording. Prefers paragraph boundaries, then
 * sentence boundaries for an oversized paragraph, and only ever falls back
 * to a hard word-count cut when neither boundary is available.
 */

export interface ChunkDraft {
  text: string;
  wordCount: number;
  characterStart?: number;
  characterEnd?: number;
  headingPath?: string[];
}

export interface ChunkingOptions {
  /** Preferred stopping point once reached at a paragraph boundary. */
  targetWords: number;
  /** Never flush before this many words UNLESS the source is exhausted. */
  minWords: number;
  /** Hard ceiling — a paragraph larger than this alone is further split by sentence. */
  maxWords: number;
  /** Word overlap carried into the start of the next chunk for continuity. */
  overlapWords: number;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  targetWords: 700,
  minWords: 500,
  maxWords: 900,
  overlapWords: 75,
};

interface ParagraphSpan {
  content: string;
  start: number;
  end: number;
}

/** Splits on 2+ newlines (already-normalized text uses `\n\n` for paragraph breaks), tracking each paragraph's real offset in the ORIGINAL string. */
function splitIntoParagraphs(text: string): ParagraphSpan[] {
  const spans: ParagraphSpan[] = [];
  const rawParagraphs = text.split(/\n{2,}/);
  let cursor = 0;
  for (const raw of rawParagraphs) {
    const start = text.indexOf(raw, cursor);
    if (start === -1) continue;
    const end = start + raw.length;
    cursor = end;
    const trimmed = raw.trim();
    if (trimmed) {
      spans.push({ content: trimmed, start, end });
    }
  }
  return spans;
}

/** Simple, safe sentence boundary split — deliberately conservative (only splits on ./!/? followed by whitespace) rather than a full NLP sentence tokenizer. */
function splitIntoSentences(text: string): string[] {
  const matches = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  if (!matches) return [text];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Deliberately narrow, safe heuristic: a single short line with no
 * sentence-ending punctuation is treated as a heading. Never guesses on
 * multi-line or long paragraphs — those simply never become a heading,
 * which is the safe default (an under-detected heading only means
 * `headingPath` stays undefined for that chunk, never a wrong one).
 */
function isHeadingLike(paragraph: string): boolean {
  if (paragraph.includes('\n')) return false;
  const trimmed = paragraph.trim();
  if (!trimmed || trimmed.length > 100) return false;
  if (/[.!?,;:]$/.test(trimmed)) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return wordCount > 0 && wordCount <= 12;
}

function wordsOf(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function chunkKnowledgeText(rawText: string, options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS): ChunkDraft[] {
  const paragraphs = splitIntoParagraphs(rawText);
  if (paragraphs.length === 0) return [];

  const chunks: ChunkDraft[] = [];

  let segments: string[] = [];
  let segmentWordCount = 0;
  let chunkStart: number | undefined;
  let chunkEnd = 0;
  let currentHeading: string | undefined;
  let overlapCarry: string[] = [];

  const flush = () => {
    const text = segments.join('\n\n').trim();
    if (text) {
      chunks.push({
        text,
        wordCount: segmentWordCount,
        characterStart: chunkStart,
        characterEnd: chunkEnd,
        headingPath: currentHeading ? [currentHeading] : undefined,
      });
    }
    overlapCarry = segmentWordCount > 0 ? wordsOf(text).slice(-options.overlapWords) : [];
    segments = overlapCarry.length > 0 ? [overlapCarry.join(' ')] : [];
    segmentWordCount = overlapCarry.length;
    chunkStart = undefined;
  };

  const appendSegment = (text: string, words: string[], start: number, end: number) => {
    if (words.length === 0) return;
    if (chunkStart === undefined) chunkStart = start;
    segments.push(text);
    segmentWordCount += words.length;
    chunkEnd = end;
  };

  for (const paragraph of paragraphs) {
    if (isHeadingLike(paragraph.content)) {
      currentHeading = paragraph.content;
    }

    const paragraphWords = wordsOf(paragraph.content);
    if (paragraphWords.length === 0) continue;

    if (paragraphWords.length > options.maxWords) {
      // Oversized paragraph — split by sentence instead of an arbitrary hard cut.
      const sentences = splitIntoSentences(paragraph.content);
      for (const sentence of sentences) {
        const sentenceWords = wordsOf(sentence);
        if (sentenceWords.length === 0) continue;
        if (segmentWordCount + sentenceWords.length > options.maxWords && segmentWordCount >= options.minWords) {
          flush();
        }
        appendSegment(sentence, sentenceWords, paragraph.start, paragraph.end);
        if (segmentWordCount >= options.targetWords) {
          flush();
        }
      }
      continue;
    }

    if (segmentWordCount + paragraphWords.length > options.maxWords && segmentWordCount >= options.minWords) {
      flush();
    }

    appendSegment(paragraph.content, paragraphWords, paragraph.start, paragraph.end);

    if (segmentWordCount >= options.targetWords) {
      flush();
    }
  }

  // Final partial chunk — only keep it if it has genuinely new (non-overlap-only) content.
  if (segments.length > 0 && segmentWordCount > overlapCarry.length) {
    flush();
  }

  return chunks;
}

/** Simple deterministic approximation (~4 characters per token) — no tokenizer dependency added for this estimate. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
