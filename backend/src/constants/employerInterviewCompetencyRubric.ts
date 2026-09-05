/**
 * Interview competency coverage / evaluation rubric (20B) — a DETERMINISTIC
 * (no AI) transformation of a COMPLETED 20A blueprint + the exact
 * finalized JD competencies it was generated from into an immutable
 * interviewer evaluation rubric. Guides interviewer evaluation only — it
 * is never a candidate score, and no candidate answers are evaluated here.
 */
export const INTERVIEW_RUBRIC_CALCULATION_VERSION = 'interview-rubric-v1';

export const MAX_EVIDENCE_SIGNALS = 10;
export const MAX_EVIDENCE_SIGNAL_LENGTH = 200;

/** Weights are expected to already sum to exactly 100 (17D/17E guarantee this) — this is just float-safety tolerance for the 20B integrity check, never a renormalization. */
export const WEIGHT_SUM_TOLERANCE = 0.5;
