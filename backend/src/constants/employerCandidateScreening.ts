/**
 * Candidate-to-job screening (19A) — compares one job application's
 * candidate resume analysis against the job's FINALIZED JD Intelligence
 * Snapshot (17E). No ranking across candidates (19D), no shortlist
 * automation (19E), no interview generation.
 */
export enum EmployerCandidateScreeningStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EmployerCandidateScreeningRecommendation {
  STRONG_MATCH = 'strong_match',
  MATCH = 'match',
  BORDERLINE = 'borderline',
  WEAK_MATCH = 'weak_match',
}

export const MAX_SCREENING_HISTORY_LIMIT = 20;
