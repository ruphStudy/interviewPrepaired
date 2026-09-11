/**
 * Transactional email foundation (PR-COMM). Stable template codes and
 * retry policy — centralized here so retry timing/attempt bounds are never
 * duplicated or drifted between the send path and the retry worker.
 */
export enum EmailTemplateCode {
  PASSWORD_RESET = 'PASSWORD_RESET',
  ORGANIZATION_INVITATION = 'ORGANIZATION_INVITATION',
  EMPLOYER_INTERVIEW_INVITATION = 'EMPLOYER_INTERVIEW_INVITATION',
  // Reserved for future PR-COMM/PR-BILL work — architecture only, not implemented here.
  // EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  // PAYMENT_RECEIPT = 'PAYMENT_RECEIPT',
  // SUBSCRIPTION_NOTICE = 'SUBSCRIPTION_NOTICE',
}

export type EmailDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'complained'
  | 'suppressed'
  | 'cancelled';

/** A transient failure is retried; a permanent one is not. */
export type EmailFailureClass = 'transient' | 'permanent';

export const EMAIL_MAX_ATTEMPTS = 5;

/** Delay in ms BEFORE attempt N (1-indexed) — attempt 1 is immediate (no prior delay). */
export const EMAIL_RETRY_DELAYS_MS = [
  0, // attempt 1 (immediate)
  60 * 1000, // attempt 2 — ~1 minute
  5 * 60 * 1000, // attempt 3 — ~5 minutes
  30 * 60 * 1000, // attempt 4 — ~30 minutes
  2 * 60 * 60 * 1000, // attempt 5 — ~2 hours
];

export function getRetryDelayMs(nextAttemptNumber: number): number {
  const index = Math.min(Math.max(nextAttemptNumber - 1, 0), EMAIL_RETRY_DELAYS_MS.length - 1);
  return EMAIL_RETRY_DELAYS_MS[index];
}

export enum EmailSuppressionReason {
  HARD_BOUNCE = 'hard_bounce',
  COMPLAINT = 'complaint',
  MANUAL = 'manual',
}
