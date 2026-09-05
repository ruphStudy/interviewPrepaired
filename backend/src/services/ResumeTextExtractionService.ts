import mammoth from 'mammoth';
import { ApiError } from '../utils/ApiError';
import { MAX_EXTRACTED_TEXT_LENGTH } from '../constants/employerCandidateResumeAnalysis';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

/**
 * Strips null bytes and other control characters (keeping tab/newline/
 * carriage-return) before this text is ever embedded in an AI prompt or
 * logged. Implemented as a char-code scan rather than a regex so no raw
 * control bytes need to appear in this source file.
 */
function sanitizeExtractedText(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isKeptWhitespace = code === 9 || code === 10 || code === 13; // tab, LF, CR
    const isControlChar = code < 32 || code === 127;
    if (isControlChar && !isKeptWhitespace) {
      continue;
    }
    result += text[i];
  }
  return result.trim();
}

/**
 * Extracts raw text from a resume file buffer for AI parsing (18C). Reuses
 * the exact same extraction primitives QuestionFileParserService already
 * uses (mammoth for .docx, pdf-parse for .pdf) — that service's own
 * `parseFile()` isn't reused directly because it's coupled to question-bank
 * parsing (different return shape, different error semantics), not a
 * reusable "just extract text" primitive. Legacy .doc cannot be safely
 * parsed with any library already in this project (mammoth only reads
 * .docx); rather than add a new dependency for it, it's rejected here with
 * a clear 422 instead.
 */
export class ResumeTextExtractionService {
  async extractText(buffer: Buffer, fileExtension: string): Promise<string> {
    let raw: string;

    switch (fileExtension) {
      case '.txt':
        raw = buffer.toString('utf-8');
        break;
      case '.docx': {
        const { value } = await mammoth.extractRawText({ buffer });
        raw = value || '';
        break;
      }
      case '.pdf': {
        const data = await pdfParse(buffer);
        raw = data?.text || '';
        break;
      }
      case '.doc':
        throw new ApiError(422, 'Legacy .doc resumes are not supported for parsing yet. Please upload a PDF, DOCX, or TXT resume.');
      default:
        throw new ApiError(422, 'This resume file type is not supported for parsing.');
    }

    const sanitized = sanitizeExtractedText(raw);
    if (!sanitized) {
      throw new ApiError(422, 'Could not extract readable text from this resume. It may be a scanned or image-only file.');
    }

    return sanitized.slice(0, MAX_EXTRACTED_TEXT_LENGTH);
  }
}

export const resumeTextExtractionService = new ResumeTextExtractionService();
