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
