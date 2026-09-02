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
