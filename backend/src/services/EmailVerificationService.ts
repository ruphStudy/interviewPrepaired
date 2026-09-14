import crypto from 'crypto';
import { User, IUser } from '../models/user.model';
import { transactionalEmailService } from './TransactionalEmailService';
import { authSecurityEventService } from './AuthSecurityEventService';
import { renderEmailVerificationEmail } from '../emails/templates';
import { EmailTemplateCode } from '../constants/email';
import { EMAIL_VERIFICATION_EXPIRY_MS, EMAIL_VERIFICATION_RESEND_COOLDOWN_MS, EMAIL_VERIFICATION_ROLLOUT_AT } from '../constants/authSecurity';
import { env } from '../config/environment';
import { ApiError } from '../utils/ApiError';

export type VerifyEmailOutcome = 'verified' | 'already_verified';

/**
 * Email verification lifecycle (PR-AUTH-1), built entirely on PR-COMM's
 * TransactionalEmailService — never a direct provider call here. Only the
 * SHA-256 hash of the verification token is ever persisted; the raw token
 * exists in memory only long enough to build the email link.
 */
class EmailVerificationService {
  /** Best-effort — a delivery/queueing failure must never fail registration or block the caller. */
  async sendVerificationEmail(user: IUser): Promise<void> {
    try {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.emailVerificationTokenHash = tokenHash;
      user.emailVerificationExpire = new Date(Date.now() + EMAIL_VERIFICATION_EXPIRY_MS);
      user.emailVerificationSentAt = new Date();
      await user.save({ validateBeforeSave: false });

      const verifyUrl = `${env.frontendUrl.replace(/\/$/, '')}/verify-email/${rawToken}`;
      const { subject, html, text } = renderEmailVerificationEmail({
        name: user.name,
        verifyUrl,
        expiryHours: EMAIL_VERIFICATION_EXPIRY_MS / (60 * 60 * 1000),
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
    await user.save({ validateBeforeSave: false });

    await authSecurityEventService.record('email_verified', { userId: user._id });
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
