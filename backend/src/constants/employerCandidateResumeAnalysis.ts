/**
 * AI-parsed structured candidate profile extracted from ONE immutable
 * resume source version (18C). Raw extraction only — no evaluation,
 * scoring, or ranking, and nothing here ever writes back to
 * EmployerCandidate automatically.
 */
export enum EmployerCandidateResumeAnalysisStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** Caps the text handed to the AI gateway — keeps the call low-cost and bounded regardless of how large the source file's extracted text is. */
export const MAX_EXTRACTED_TEXT_LENGTH = 100_000;

export const MAX_PROFILE_EXPERIENCE_ENTRIES = 20;
export const MAX_PROFILE_EDUCATION_ENTRIES = 15;
export const MAX_PROFILE_PROJECT_ENTRIES = 20;
