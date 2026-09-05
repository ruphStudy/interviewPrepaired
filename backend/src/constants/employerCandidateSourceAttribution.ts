/**
 * Candidate source-attribution / provenance tracking (18E). Reuses the
 * EXISTING `EmployerCandidateSource` enum from `employerCandidate.ts` —
 * attribution records are historical evidence of how a candidate entered
 * the company's talent pool, never a replacement for
 * `EmployerCandidate.source` (the candidate's current PRIMARY source).
 */
export const MAX_SOURCE_ATTRIBUTION_HISTORY_LIMIT = 50;

export const SOURCE_ATTRIBUTION_STRING_MAX_LENGTH = 200;
export const SOURCE_ATTRIBUTION_EXTERNAL_REFERENCE_MAX_LENGTH = 150;
export const SOURCE_ATTRIBUTION_URL_MAX_LENGTH = 300;
export const SOURCE_ATTRIBUTION_NOTES_MAX_LENGTH = 1000;
