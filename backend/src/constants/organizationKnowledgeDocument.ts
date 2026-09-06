/**
 * Organization Knowledge Base document uploads (29B). Deliberately reuses
 * the exact same safe parsing primitives already used elsewhere in this
 * backend (mammoth for .docx, pdf-parse for .pdf, plain read for .txt via
 * `ResumeTextExtractionService`) — no new parsing dependency. Legacy .doc
 * is intentionally excluded (unlike the resume upload list) since nothing
 * in this project can safely parse it; rejecting it here at upload time
 * avoids ever creating a `processing` document doomed to fail.
 */
export const MAX_KNOWLEDGE_DOCUMENT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — mirrors the existing resume/question-file upload ceiling

/** Mirrors `MAX_EXTRACTED_TEXT_LENGTH` used for resume parsing — same safe bound, own named constant for this domain. */
export const MAX_KNOWLEDGE_DOCUMENT_TEXT_LENGTH = 100_000;

export const KNOWLEDGE_DOCUMENT_PREVIEW_LENGTH = 500;

export const MAX_KNOWLEDGE_DOCUMENT_TITLE_LENGTH = 200;
export const MAX_KNOWLEDGE_DOCUMENT_DESCRIPTION_LENGTH = 1000;

interface AllowedKnowledgeDocumentFileType {
  extension: string;
  mimeTypes: string[];
}

export const ALLOWED_KNOWLEDGE_DOCUMENT_FILE_TYPES: AllowedKnowledgeDocumentFileType[] = [
  { extension: '.pdf', mimeTypes: ['application/pdf'] },
  { extension: '.docx', mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { extension: '.txt', mimeTypes: ['text/plain'] },
];

export const ALLOWED_KNOWLEDGE_DOCUMENT_EXTENSIONS = ALLOWED_KNOWLEDGE_DOCUMENT_FILE_TYPES.map((t) => t.extension);

const GENERIC_FALLBACK_MIME_TYPES = ['application/octet-stream'];

export function getKnowledgeDocumentFileExtension(originalName: string): string {
  const idx = originalName.lastIndexOf('.');
  return idx === -1 ? '' : originalName.slice(idx).toLowerCase();
}

/** Validates extension AND mimetype together where the mimetype is meaningful — never trusts the extension alone. */
export function isAllowedKnowledgeDocumentFile(originalName: string, mimeType: string): { allowed: boolean; extension: string } {
  const extension = getKnowledgeDocumentFileExtension(originalName);
  const match = ALLOWED_KNOWLEDGE_DOCUMENT_FILE_TYPES.find((t) => t.extension === extension);
  if (!match) {
    return { allowed: false, extension };
  }
  if (mimeType && !GENERIC_FALLBACK_MIME_TYPES.includes(mimeType) && !match.mimeTypes.includes(mimeType)) {
    return { allowed: false, extension };
  }
  return { allowed: true, extension };
}
