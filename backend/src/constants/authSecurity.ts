/**
 * Account-security constants (PR-AUTH). Centralized so password policy,
 * lockout thresholds, and session/verification lifetimes are never
 * duplicated or drifted across controllers/services.
 */

// ---- Password policy — length-based, no artificial complexity rules. ----
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// ---- Email verification ----
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between resends

// ---- Email verification — 6-digit code (dual verification, PR-EMAILVERIFY-2) ----
// Deliberately shorter than the link's own 24h expiry — a manually-typed
// code is meant to be used right away, and a short window limits the
// brute-force guessing surface even before EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS.
export const EMAIL_VERIFICATION_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
export const EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS = 5;

/**
 * Deterministic backward-compatibility cutoff for the email-verification
 * rollout — any account created before this instant is lazily backfilled
 * to verified on first read, so existing users are never locked out by
 * this feature shipping. Deliberately a fixed literal (never `new Date()`
 * evaluated at process start), so every server restart backfills the same
 * population.
 */
export const EMAIL_VERIFICATION_ROLLOUT_AT = new Date('2026-09-12T00:00:00.000Z');

// ---- Session lifetime — mirrors the JWT_EXPIRE default (see .env.example); AuthSession.expiresAt tracks this independently of the JWT's own `exp` claim so a session can be found/revoked without decoding the token. ----
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ---- Login brute-force protection ----
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/** Pure decision helper — extracted so the lock threshold is unit-testable without a database. */
export function shouldLockAccount(failedAttemptsAfterThisOne: number): boolean {
  return failedAttemptsAfterThisOne >= LOGIN_MAX_FAILED_ATTEMPTS;
}

/** Pure helper — accounts created before the rollout are treated as legacy/pre-verified. */
export function isLegacyPreVerificationUser(createdAt: Date): boolean {
  return createdAt.getTime() < EMAIL_VERIFICATION_ROLLOUT_AT.getTime();
}
