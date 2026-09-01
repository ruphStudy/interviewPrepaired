import mammoth from 'mammoth';
import { ApiError } from '../utils/ApiError';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export interface ParsedQuestion {
  questionText: string;
  referenceAnswer?: string;
}

const SUPPORTED_EXTENSIONS = ['.txt', '.csv', '.docx', '.pdf'];

/** Same validity rule used across the interview report — an empty/placeholder value is not a real answer. */
function isNonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

// ============================================================================
// Flexible question/answer text parser (TXT/DOCX/PDF-extracted plain text)
// ============================================================================

// Explicit "Q:"/"Question:" markers are always treated as a question — the
// label itself is high-confidence, no heuristic needed.
const Q_LABEL_MARKER = /^Q(?:uestion)?\s*\d*\s*[:.)]\s*(.*)$/i;
// A bare numbered line ("1.", "1)", "1 -") is only a question if it also
// passes the interrogative-phrasing heuristic below — otherwise it's most
// likely a numbered list inside an answer (see FALSE POSITIVE PROTECTION).
const NUMBERED_MARKER = /^\d+\s*[.)\-]\s*(.*)$/;

const QUESTION_STARTERS = [
  'what', 'why', 'how', 'explain', 'describe', 'compare', 'discuss',
  'when', 'where', 'which', 'can', 'could', 'would', 'tell',
  'design', 'implement', 'walk me through',
];

function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  const lower = t.toLowerCase();
  return QUESTION_STARTERS.some((s) => lower.startsWith(s));
}

// Answer-heading labels, most-specific/longest first so e.g. "expected
// answer" is matched before the generic "answer". Tier = priority when a
// question has multiple answer sections (1 = highest priority).
const ANSWER_LABELS: Array<{ label: string; tier: number; requiresSeparator?: boolean }> = [
  { label: 'company-acceptable answer', tier: 1 },
  { label: 'company acceptable answer', tier: 1 },
  { label: 'company answer', tier: 1 },
  { label: 'expected interview answer', tier: 2 },
  { label: 'expected answer', tier: 2 },
  { label: 'ideal answer', tier: 2 },
  { label: 'model answer', tier: 2 },
  { label: 'reference answer', tier: 2 },
  { label: 'answer', tier: 2 },
  { label: 'ans', tier: 2, requiresSeparator: true },
  { label: 'a', tier: 2, requiresSeparator: true },
  { label: 'suggested response', tier: 3 },
  { label: 'suggested answer', tier: 3 },
  { label: 'sample answer', tier: 3 },
  { label: 'recommended answer', tier: 3 },
  { label: 'strong answer', tier: 3 },
  { label: 'short spoken answer', tier: 4 },
  { label: 'spoken answer', tier: 4 },
  { label: 'short answer', tier: 4 },
].sort((a, b) => b.label.length - a.label.length);

/** Detects "Label:"/"Label -"/bare-"Label" answer headings (case-insensitive), returning its priority tier and any trailing text on the same line. */
function matchAnswerHeading(line: string): { tier: number; trailing: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  for (const { label, tier, requiresSeparator } of ANSWER_LABELS) {
    if (!lower.startsWith(label)) continue;
    const rest = trimmed.slice(label.length);
    const restTrimmed = rest.replace(/^\s+/, '');

    if (restTrimmed === '') {
      if (requiresSeparator) continue; // e.g. bare "A" / "Ans" alone is too ambiguous
      return { tier, trailing: '' };
    }
    if (restTrimmed[0] === ':' || restTrimmed[0] === '-') {
      return { tier, trailing: restTrimmed.slice(1).trim() };
    }
    // Label matched only as a text prefix (e.g. "Answering the question...") — not a real heading.
  }
  return null;
}

/** Parses TXT/DOCX/PDF-extracted plain text into Q/A entries, tolerant of many real-world question-bank layouts (see class doc). */
function parseTextQuestions(text: string): ParsedQuestion[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  interface RawQuestion {
    questionText: string;
    answersByTier: Map<number, string>;
  }

  const results: ParsedQuestion[] = [];
  let current: RawQuestion | null = null;
  let activeTier: number | null = null; // set while accumulating an answer section; null while accumulating question text

  const appendToTier = (tier: number, textToAdd: string) => {
    if (!current || !textToAdd) return;
    const existing = current.answersByTier.get(tier);
    current.answersByTier.set(tier, existing ? `${existing}\n${textToAdd}` : textToAdd);
  };

  const finalize = () => {
    if (!current) return;
    const questionText = current.questionText.replace(/\s+/g, ' ').trim();
    if (questionText) {
      const bestTier = Math.min(...current.answersByTier.keys());
      const rawAnswer = Number.isFinite(bestTier) ? current.answersByTier.get(bestTier) : undefined;
      const referenceAnswer = isNonEmpty(rawAnswer) ? rawAnswer.replace(/\n{3,}/g, '\n\n').trim() : undefined;
      results.push({ questionText, referenceAnswer });
    }
    current = null;
    activeTier = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = matchAnswerHeading(line);
    if (heading && current) {
      activeTier = heading.tier;
      if (heading.trailing) appendToTier(activeTier, heading.trailing);
      continue;
    }

    const qLabelMatch = line.match(Q_LABEL_MARKER);
    const numberedMatch = !qLabelMatch ? line.match(NUMBERED_MARKER) : null;
    const isNumberedQuestion = numberedMatch && looksLikeQuestion(numberedMatch[1] || '');

    if (qLabelMatch || isNumberedQuestion) {
      finalize();
      const captured = (qLabelMatch ? qLabelMatch[1] : numberedMatch![1]) || '';
      current = { questionText: captured, answersByTier: new Map() };
      activeTier = null;
      continue;
    }

    if (!current) continue; // Preamble/title text before the first recognized question — ignored.

    if (activeTier !== null) {
      appendToTier(activeTier, line);
    } else {
      current.questionText += ' ' + line; // Wrapped/multiline question continuation.
    }
  }
  finalize();

  return results;
}

/** Minimal CSV parser supporting quoted fields with embedded commas/escaped quotes. */
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const content = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function parseCSV(text: string): ParsedQuestion[] {
  const rows = parseCSVRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const qIdx = header.findIndex((h) => ['question', 'questions', 'questiontext'].includes(h));
  const aIdx = header.findIndex((h) => ['answer', 'answers', 'referenceanswer'].includes(h));

  const hasHeader = qIdx >= 0;
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const questionCol = hasHeader ? qIdx : 0;
  const answerCol = hasHeader && aIdx >= 0 ? aIdx : 1;

  const results: ParsedQuestion[] = [];
  for (const row of dataRows) {
    const questionText = (row[questionCol] || '').trim();
    if (!questionText) continue;
    const referenceAnswer = (row[answerCol] || '').trim();
    results.push({ questionText, referenceAnswer: referenceAnswer || undefined });
  }
  return results;
}

export class QuestionFileParserService {
  async parseFile(buffer: Buffer, originalFilename: string): Promise<ParsedQuestion[]> {
    const ext = getExtension(originalFilename);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new ApiError(400, `Unsupported file type "${ext || 'unknown'}". Supported types: .txt, .csv, .docx, .pdf`);
    }

    let questions: ParsedQuestion[];

    if (ext === '.txt') {
      questions = parseTextQuestions(buffer.toString('utf-8'));
    } else if (ext === '.csv') {
      questions = parseCSV(buffer.toString('utf-8'));
    } else if (ext === '.docx') {
      const { value } = await mammoth.extractRawText({ buffer });
      questions = parseTextQuestions(value);
    } else {
      const data = await pdfParse(buffer);
      const text: string = data?.text || '';
      if (!isNonEmpty(text)) {
        throw new ApiError(
          400,
          'Scanned/image-only PDF is not supported yet. Please upload TXT, CSV, DOCX, or a text-based PDF.'
        );
      }
      questions = parseTextQuestions(text);
    }

    if (questions.length === 0) {
      throw new ApiError(400, 'No valid questions found in the uploaded file');
    }

    return questions;
  }
}

export const questionFileParserService = new QuestionFileParserService();
