/**
 * Candidate Skill & Requirement Gap Analysis (19C) — a deterministic
 * breakdown derived from an already-COMPLETED 19A screening, its 19B
 * explainable score, and the exact finalized JD snapshot. No AI call
 * happens here or anywhere in this model's lifecycle. Informational only —
 * never ranks candidates (19D), never automates a shortlist decision (19E),
 * never generates a remediation/training plan.
 */
export const SCREENING_GAP_CALCULATION_VERSION = 'screening-gap-v1';

export enum EmployerCandidateGapSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum EmployerCandidateSkillGapStatus {
  MISSING = 'missing',
  PARTIAL = 'partial',
}

/** A competency/experience/education match score at or above this is NOT a gap. */
export const GAP_SCORE_THRESHOLD = 70;

/** A JD competency weight below this may have its computed severity lowered by one level. */
export const LOW_JD_WEIGHT_THRESHOLD = 10;
