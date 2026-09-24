import crypto from 'crypto';
import { User, IUser } from '../models/user.model';
import { transactionalEmailService } from './TransactionalEmailService';
import { authSecurityEventService } from './AuthSecurityEventService';
import { renderEmailVerificationEmail } from '../emails/templates';
import { EmailTemplateCode } from '../constants/email';
import {
  EMAIL_VERIFICATION_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  EMAIL_VERIFICATION_ROLLOUT_AT,
  EMAIL_VERIFICATION_CODE_EXPIRY_MS,
  EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS,
} from '../constants/authSecurity';
import { env } from '../config/environment';
import { ApiError } from '../utils/ApiError';

export type VerifyEmailOutcome = 'verified' | 'already_verified';

/** Zero-padded 6-digit code, e.g. "007421" — always exactly 6 characters, leading zeroes allowed. */
function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashVerificationCode(rawCode: string): string {
  return crypto.createHash('sha256').update(rawCode).digest('hex');
}

/**
 * Email verification lifecycle (PR-AUTH-1), built entirely on PR-COMM's
 * TransactionalEmailService — never a direct provider call here. Only the
 * SHA-256 hash of the verification token is ever persisted; the raw token
 * exists in memory only long enough to build the email link.
 */
class EmailVerificationService {
  /**
   * Best-effort — a delivery/queueing failure must never fail registration
   * or block the caller. Generates BOTH the link token and the 6-digit
   * code for this single challenge and sends them in ONE email — never
   * two separate sends. Only the SHA-256 hashes are ever persisted; both
   * raw secrets exist in memory only long enough to build the email.
   */
  async sendVerificationEmail(user: IUser): Promise<void> {
    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const rawCode = generateVerificationCode();
      const codeHash = hashVerificationCode(rawCode);

      user.emailVerificationTokenHash = tokenHash;
      user.emailVerificationExpire = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
      user.emailVerificationSentAt = new Date();
      user.emailVerificationCodeHash = codeHash;
      user.emailVerificationCodeExpire = new Date(Date.now() + EMAIL_VERIFICATION_CODE_EXPIRY_MS);
      user.emailVerificationCodeAttempts = 0;
      await user.save({ validateBeforeSave: false });

      const verifyUrl = `${env.frontendUrl.replace(/\/$/, '')}/verify-email/${rawToken}`;
      const { subject, html, text } = renderEmailVerificationEmail({
        name: user.name,
        verifyUrl,
        expiryHours: EMAIL_VERIFICATION_EXPIRY_MS / (60 * 60 * 1000),
        code: rawCode,
        codeExpiryMinutes: EMAIL_VERIFICATION_CODE_EXPIRY_MS / (60 * 1000),
      });

      await transactionalEmailService.sendTransactionalEmail({
        to: user.email,
        templateCode: EmailTemplateCode.EMAIL_VERIFICATION,
        subject,
        html,
        text,
        // Keyed on the token's own hash — a deliberate NEW send (registration
        // or resend) always rotates the hash, so it always sends a fresh
        // email, while a retried HTTP request for the exact same generation
        // never double-sends.
        idempotencyKey: `email-verification:${user._id.toString()}:${tokenHash}`,
        relatedEntityType: 'User',
        relatedEntityId: user._id.toString(),
      });
    } catch (error) {
      console.error('[EmailVerificationService] Failed to enqueue verification email', { userId: user._id.toString() });
    }
  }

  /**
   * Verifies a raw token — hashes it, looks up the matching user, checks
   * expiry, and marks them verified. One-time use: the hash/expiry are
   * cleared the moment verification succeeds, so the same link can never
   * be replayed. Never reveals which specific failure occurred beyond
   * invalid vs expired — never leaks whether ANY account matches at all
   * beyond that binary.
   */
  async verifyToken(rawToken: string): Promise<VerifyEmailOutcome> {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await User.findOne({ emailVerificationTokenHash: tokenHash }).select('+emailVerificationTokenHash');

    if (!user) {
      throw new ApiError(400, 'This verification link is invalid or has already been used', undefined, 'EMAIL_VERIFICATION_INVALID');
    }

    if (user.isVerified) {
      return 'already_verified';
    }

    if (!user.emailVerificationExpire || user.emailVerificationExpire.getTime() < Date.now()) {
      throw new ApiError(400, 'This verification link has expired. Please request a new one.', undefined, 'EMAIL_VERIFICATION_EXPIRED');
    }

    user.isVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpire = undefined;
    // Same challenge, other method — a link verification also retires the
    // sibling 6-digit code so it can no longer be used (safe to clear here:
    // verifyCode's lookup is session-based via req.user, not a hash lookup,
    // so clearing these fields doesn't break its ability to find the user).
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationCodeExpire = undefined;
    user.emailVerificationCodeAttempts = 0;
    await user.save({ validateBeforeSave: false });

    await authSecurityEventService.record('email_verified', { userId: user._id });
    return 'verified';
  }

  /**
   * Authenticated code-entry path — the user is always resolved from the
   * session (never from a request body email), so there is no enumeration
   * surface. Deliberately checks `isVerified` FIRST: if the user already
   * verified via the link, this short-circuits to `already_verified`
   * without needing the code hash to still exist. NOTE: on success this
   * only clears the CODE fields, never `emailVerificationTokenHash` — the
   * link's own lookup is by hash, so leaving it in place while `isVerified`
   * is already true means a stale link safely resolves to
   * `already_verified` via verifyToken's own isVerified check, rather than
   * failing to find the user at all.
   */
  async verifyCode(user: IUser, rawCode: string): Promise<VerifyEmailOutcome> {
    if (user.isVerified) {
      return 'already_verified';
    }

    if (!/^\d{6}$/.test(rawCode)) {
      throw new ApiError(400, 'Enter the 6-digit verification code.', undefined, 'EMAIL_VERIFICATION_CODE_INVALID');
    }

    const userWithCode = await User.findById(user._id).select('+emailVerificationCodeHash');
    if (!userWithCode) {
      throw new ApiError(404, 'User not found');
    }

    if (!userWithCode.emailVerificationCodeHash || !userWithCode.emailVerificationCodeExpire) {
      throw new ApiError(400, 'No verification code is pending. Please request a new one.', undefined, 'EMAIL_VERIFICATION_CODE_INVALID');
    }

    if (userWithCode.emailVerificationCodeExpire.getTime() < Date.now()) {
      throw new ApiError(400, 'This verification code has expired. Please request a new one.', undefined, 'EMAIL_VERIFICATION_CODE_EXPIRED');
    }

    if (userWithCode.emailVerificationCodeAttempts >= EMAIL_VERIFICATION_CODE_MAX_ATTEMPTS) {
      throw new ApiError(429, 'Too many incorrect attempts. Please request a new verification code.', undefined, 'EMAIL_VERIFICATION_CODE_LOCKED');
    }

    const suppliedHash = hashVerificationCode(rawCode);
    const suppliedBuf = Buffer.from(suppliedHash, 'hex');
    const storedBuf = Buffer.from(userWithCode.emailVerificationCodeHash, 'hex');
    const isMatch = suppliedBuf.length === storedBuf.length && crypto.timingSafeEqual(suppliedBuf, storedBuf);

    if (!isMatch) {
      userWithCode.emailVerificationCodeAttempts += 1;
      await userWithCode.save({ validateBeforeSave: false });
      await authSecurityEventService.record('email_verification_code_failure', { userId: userWithCode._id });
      throw new ApiError(400, 'Incorrect verification code.', undefined, 'EMAIL_VERIFICATION_CODE_INVALID');
    }

    userWithCode.isVerified = true;
    userWithCode.emailVerifiedAt = new Date();
    userWithCode.emailVerificationCodeHash = undefined;
    userWithCode.emailVerificationCodeExpire = undefined;
    userWithCode.emailVerificationCodeAttempts = 0;
    await userWithCode.save({ validateBeforeSave: false });

    await authSecurityEventService.record('email_verification_code_success', { userId: userWithCode._id });
    return 'verified';
  }

  /**
   * Authenticated-only resend (no email-based lookup, so there is no
   * enumeration surface at all — the caller can only ever resend their
   * OWN verification email). Bounded frequency via
   * EMAIL_VERIFICATION_RESEND_COOLDOWN_MS so a double-click never sends
   * two different emails with two different (both technically valid)
   * tokens.
   */
  async resendVerification(user: IUser): Promise<'sent' | 'already_verified' | 'cooldown'> {
    if (user.isVerified) {
      return 'already_verified';
    }
    if (user.emailVerificationSentAt && Date.now() - user.emailVerificationSentAt.getTime() < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
      return 'cooldown';
    }
    await this.sendVerificationEmail(user);
    await authSecurityEventService.record('verification_resent', { userId: user._id });
    return 'sent';
  }

  /**
   * Backward-compatibility backfill (PR-AUTH-1) — accounts created before
   * the email-verification rollout are treated as already verified, so
   * this feature shipping never locks out existing users. Idempotent: a
   * repeated call only ever touches rows still matching `isVerified:
   * false`, so it naturally becomes a no-op once the backfill has run.
   */
  async backfillLegacyUsersAsVerified(): Promise<number> {
    const result = await User.updateMany(
      { createdAt: { $lt: EMAIL_VERIFICATION_ROLLOUT_AT }, isVerified: false },
      { $set: { isVerified: true, emailVerifiedAt: new Date() } }
    );
    return result.modifiedCount ?? 0;
  }
}

export const emailVerificationService = new EmailVerificationService();
