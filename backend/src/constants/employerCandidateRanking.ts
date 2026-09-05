/**
 * Candidate Ranking (19D) — a live, deterministic, job-level read computed
 * from persisted applications + the CURRENT applicable 19B explainable
 * score. No AI call, no persisted ranking document, no mutation of any
 * kind. Ranking uses ONLY the deterministic 19B `score.overallScore` —
 * never the 19A AI `result.overallScore`, never `recommendation`, never gap
 * severity.
 */
export enum EmployerCandidateRankingUnrankedReason {
  SCREENING_REQUIRED = 'screening_required',
  EXPLAINABLE_SCORE_REQUIRED = 'explainable_score_required',
}
