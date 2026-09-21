/**
 * Authoritative interview lifecycle status values — the exact same strings
 * already used by the Mongo schema/active code today, just centralized so
 * they aren't duplicated as raw literals across the model/service/routes.
 * Existing stored documents are unaffected: these values are unchanged.
 */
export enum InterviewStatus {
  /** Shell persisted, but no usable first question yet — never returned to the client as a successful start. */
  CREATED = 'created',
  /** First question exists — the only status that can accept an answer. */
  IN_PROGRESS = 'in-progress',
  /** Stored/validated for existing-data compatibility; pause/resume behavior is not implemented. */
  PAUSED = 'paused',
  COMPLETED = 'completed',
  EVALUATED = 'evaluated',
}

/** Only IN_PROGRESS interviews may accept an answer submission. */
export function isAnswerableStatus(status: InterviewStatus): boolean {
  return status === InterviewStatus.IN_PROGRESS;
}

/**
 * What an interview is FOR (20E) — orthogonal to `status` above. Defaults
 * to PRACTICE for every existing/ordinary interview (personal or
 * institute-assigned); HIRING_ASSESSMENT is used only for the employer
 * candidate-invitation session-creation flow.
 */
export enum InterviewPurpose {
  PRACTICE = 'practice',
  HIRING_ASSESSMENT = 'hiring_assessment',
}

// Shared safety bound for any non-AI-generated question list (uploaded-file
// parsing, saved/manual question sets) — not the AI-generated-interview 1–10
// cap. Used by InterviewService and QuestionSetService; keep it in one place
// so the two never drift out of sync.
export const MAX_UPLOADED_QUESTIONS = 200;

/**
 * Where a question came from (Phase 1 of the answer-aware-interviewer
 * effort — see IQuestion in interview.model.ts). `'ai'` and `'uploaded'`
 * are the original two values and MUST NEVER be removed/renamed: existing
 * stored questions use them and the schema enum must keep accepting them.
 *
 * The remaining values are additive taxonomy for how a question was
 * decided, most of them reserved for LATER phases' actual decision logic:
 * - `'blueprint'`: chosen deterministically to target a specific, not-yet-
 *   covered/least-covered blueprint competency — this is the ONLY new value
 *   this phase actually sets (see InterviewService.buildQuestionTagging).
 * - `'answer_followup' | 'claim_probe' | 'contradiction_probe' |
 *   'coverage_gap' | 'scenario' | 'memory_callback'`: reserved for a later
 *   phase's answer-aware follow-up/probing decision engine — added to the
 *   type/enum now so that engine has somewhere to record its decision, but
 *   nothing in this codebase sets them yet.
 */
export const QUESTION_SOURCE_VALUES = [
  'ai',
  'uploaded',
  'blueprint',
  'answer_followup',
  'claim_probe',
  'contradiction_probe',
  'coverage_gap',
  'scenario',
  'memory_callback',
] as const;

export type QuestionSource = (typeof QUESTION_SOURCE_VALUES)[number];
