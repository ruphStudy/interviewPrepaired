/**
 * Employer interview blueprint (20A) — a structured interview PLAN
 * (question intents / planning slots, never final candidate-facing
 * questions) generated for a shortlisted application from its finalized
 * JD Intelligence Snapshot + structured screening/score/gap artifacts. No
 * interview invitation/session creation happens here — that's 20B/20C/20D.
 */
export enum EmployerInterviewBlueprintStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum EmployerInterviewBlueprintSectionCategory {
  TECHNICAL = 'technical',
  PROBLEM_SOLVING = 'problem_solving',
  SYSTEM_DESIGN = 'system_design',
  DOMAIN = 'domain',
  BEHAVIORAL = 'behavioral',
  LEADERSHIP = 'leadership',
  COMMUNICATION = 'communication',
  EXPERIENCE = 'experience',
}

export enum EmployerInterviewBlueprintDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

export const MIN_ESTIMATED_DURATION_MINUTES = 15;
export const MAX_ESTIMATED_DURATION_MINUTES = 120;
export const DEFAULT_ESTIMATED_DURATION_MINUTES = 60;

export const MIN_SECTIONS = 2;
export const MAX_SECTIONS = 10;
export const MIN_SECTION_DURATION_MINUTES = 1;
export const MAX_SECTION_DURATION_MINUTES = 60;

export const MIN_QUESTION_PLAN_PER_SECTION = 1;
export const MAX_QUESTION_PLAN_PER_SECTION = 6;
export const MAX_TOTAL_PLANNED_QUESTIONS = 30;

/** Rescale section durations to match `estimatedDurationMinutes` only when they're off by more than this fraction — minor AI arithmetic slop is left as-is. */
export const DURATION_RESCALE_THRESHOLD_RATIO = 0.3;
