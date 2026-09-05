/**
 * Candidate resume source uploads (18B). Deliberately minimal — a resume
 * "source" is just an immutable stored file + its metadata. No AI parsing,
 * no text extraction into structured candidate fields — that's 18C.
 */
export enum EmployerCandidateResumeSourceType {
  UPLOAD = 'upload',
}

/** Mirrors the existing question-file upload limit (see interview.routes.ts) — no reason for a different ceiling here. */
export const MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export const MAX_RESUME_HISTORY_LIMIT = 20;

interface AllowedResumeFileType {
  extension: string;
  mimeTypes: string[];
}

/**
 * DOC/DOCX/PDF are the practical formats this backend already knows how to
 * handle elsewhere (mammoth/pdf-parse in QuestionFileParserService); TXT is
 * included too since it's trivially safe (plain text, no parser needed).
 */
export const ALLOWED_RESUME_FILE_TYPES: AllowedResumeFileType[] = [
  { extension: '.pdf', mimeTypes: ['application/pdf'] },
  { extension: '.docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { extension: '.doc', mimeTypes: ['application/msword'] },
  { extension: '.txt', mimeTypes: ['text/plain'] },
];

export const ALLOWED_RESUME_EXTENSIONS = ALLOWED_RESUME_FILE_TYPES.map((t) => t.extension);

/** Some OS/browser combinations send a generic fallback mimetype for legacy formats (esp. .doc) — tolerate only that fallback, never an outright mismatch. */
const GENERIC_FALLBACK_MIME_TYPES = ['application/octet-stream'];

export function getResumeFileExtension(originalName: string): string {
  const idx = originalName.lastIndexOf('.');
  return idx === -1 ? '' : originalName.slice(idx).toLowerCase();
}

/** Validates extension AND mimetype together where the mimetype is meaningful — never trusts the extension alone. */
export function isAllowedResumeFile(originalName: string, mimeType: string): { allowed: boolean; extension: string } {
  const extension = getResumeFileExtension(originalName);
  const match = ALLOWED_RESUME_FILE_TYPES.find((t) => t.extension === extension);
  if (!match) {
    return { allowed: false, extension };
  }
  if (mimeType && !GENERIC_FALLBACK_MIME_TYPES.includes(mimeType) && !match.mimeTypes.includes(mimeType)) {
    return { allowed: false, extension };
  }
  return { allowed: true, extension };
}
