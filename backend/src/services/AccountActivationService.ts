import crypto from 'crypto';
import { IUser } from '../models/user.model';
import { transactionalEmailService } from './TransactionalEmailService';
import { renderAccountSetupEmail } from '../emails/templates';
import { EmailTemplateCode } from '../constants/email';
import { env } from '../config/environment';

/** Same window as an organization invitation's raw token (INVITATION_EXPIRY_MS) — this is also an onboarding/acceptance token, not a short-lived password-reset session. */
const ACCOUNT_SETUP_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const ACCOUNT_SETUP_EXPIRY_MINUTES = ACCOUNT_SETUP_EXPIRY_MS / (60 * 1000);

/**
 * Issues a first-time "set your password" link for a User created via
 * `UserIdentityService.createUserAwaitingActivation` (Institute Trainer/
 * Student onboarding that isn't membership-shaped, so it can't reuse
 * `OrganizationInvitation`'s own token — Trainer onboarding instead reuses
 * OrganizationInvitationService.createInvitation/activateOwnerAccount,
 * which IS membership-shaped). Deliberately reuses the SAME
 * `User.resetPasswordToken`/`resetPasswordExpire` fields and the SAME
 * public `/auth/reset-password/:token` flow that `forgotPassword` already
 * uses — not a second/parallel token system. The only difference is which
 * template is sent and a longer expiry appropriate for an onboarding link.
 * Best-effort: an email-delivery failure is logged, never thrown — the
 * User row this token belongs to must already be durably persisted before
 * this is ever called, so a delivery failure never corrupts DB state (the
 * caller can always resend by calling this again).
 */
class AccountActivationService {
  async issuePasswordSetupToken(user: IUser, organizationName?: string): Promise<void> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpire = new Date(Date.now() + ACCOUNT_SETUP_EXPIRY_MS);
    await user.save({ validateBeforeSave: false });

    const setupUrl = `${env.frontendUrl.replace(/\/$/, '')}/reset-password/${rawToken}`;
    const { subject, html, text } = renderAccountSetupEmail({
      setupUrl,
      expiryMinutes: ACCOUNT_SETUP_EXPIRY_MINUTES,
      organizationName,
    });

    try {
      await transactionalEmailService.sendTransactionalEmail({
        to: user.email,
        templateCode: EmailTemplateCode.ACCOUNT_SETUP,
        subject,
        html,
        text,
        // Keyed on the token's own hash — a fresh call (e.g. an explicit
        // resend) always produces a new hash and a new email; a retried
        // HTTP call for the SAME issuance never double-sends.
        idempotencyKey: `account-setup:${user._id.toString()}:${tokenHash}`,
        relatedEntityType: 'User',
        relatedEntityId: (user._id as any).toString(),
      });
    } catch (error) {
      console.error('[AccountActivationService] Failed to enqueue account-setup email', {
        userId: (user._id as any).toString(),
      });
    }
  }
}

export const accountActivationService = new AccountActivationService();
