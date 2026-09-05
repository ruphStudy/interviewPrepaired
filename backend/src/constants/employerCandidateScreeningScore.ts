/**
 * Explainable Candidate Score (19B) — a deterministic, fixed-formula
 * breakdown of an already-COMPLETED 19A screening against the exact JD
 * snapshot it was screened against. No AI call happens here or anywhere in
 * this model's lifecycle. This is a SEPARATE, distinct score from the AI's
 * own `screening.result.overallScore` — never a replacement for it.
 */
export const SCREENING_SCORE_CALCULATION_VERSION = 'screening-score-v1';

export const SCREENING_SCORE_WEIGHTS = {
  skills: 0.35,
  competencies: 0.4,
  experience: 0.2,
  education: 0.05,
} as const;
