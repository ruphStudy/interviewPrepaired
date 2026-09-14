/**
 * Thrown by an OperationalJobService handler for a RETRYABLE condition
 * (network timeout, provider 429/5xx, a transient DB/storage/email issue).
 * The job runner schedules a future attempt (per that job type's backoff
 * schedule) as long as `attemptCount < maxAttempts`; once attempts are
 * exhausted the job still goes to `dead_letter`.
 *
 * Any OTHER thrown error (a plain Error/ApiError — invalid email, entity
 * deleted, authorization invalid, malformed payload, unsupported state,
 * invalid payment signature, business rule rejection) is treated as
 * PERMANENT — the job runner sends it straight to `dead_letter` regardless
 * of remaining attempts. Never retry a doomed job indefinitely.
 */
export class TransientOperationalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientOperationalError';
    Error.captureStackTrace(this, this.constructor);
  }
}
