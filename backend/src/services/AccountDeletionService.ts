import crypto from 'crypto';
import { User } from '../models/user.model';
import { Interview } from '../models/interview.model';
import { EmailSuppression } from '../models/EmailSuppression.model';
import { EmailSuppressionReason } from '../constants/email';
import { PrivacyActionAudit } from '../models/PrivacyActionAudit.model';
import { authSessionService } from './AuthSessionService';
import { ApiError } from '../utils/ApiError';
import { TransientOperationalError } from '../utils/operationalError';
import { PrivacyErrorCode } from '../constants/privacy';

/**
 * B2C account deletion (PR-PRIVACY-3). `requestDeletion` performs the
 * SYNCHRONOUS, security-critical steps in the request handler's own
 * transaction of work — by the time it returns, every session for this
 * user is already revoked and the User row is already anonymized/
 * disabled, so the account is unusable from that instant even before the
 * slower async cleanup (`processAccountDeletion`, the ACCOUNT_DELETION
 * job handler) runs.
 */
class AccountDeletionService {
  async requestDeletion(userId: string, currentPassword: string): Promise<{ status: 'processing' }> {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Idempotent — a retried/duplicate request against an already-deleted
    // account is a safe no-op, never a re-auth prompt for a password that
    // no longer matches anything meaningful.
    if (user.isDeleted) {
      return { status: 'processing' };
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(401, 'Current password is incorrect', undefined, PrivacyErrorCode.PRIVACY_REAUTH_REQUIRED);
    }

    const originalEmail = user.email;

    await PrivacyActionAudit.create({
      action: 'deletion_requested',
      subjectUserId: user._id,
      status: 'processing',
      requestedAt: new Date(),
    });

    // Reuse the existing session-revocation path — never a second, hand-rolled revocation mechanism.
    await authSessionService.revokeAllSessions(user._id.toString(), 'account_deletion');

    user.isDeleted = true;
    user.isActive = false;
    user.deletedAt = new Date();
    user.name = 'Deleted User';
    user.email = this.buildAnonymizedEmail(user._id.toString());
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpire = undefined;
    // A fresh, never-exposed random value — hashed through the model's own
    // pre-save bcrypt hook exactly like a normal password set. Never
    // logged/returned.
    user.password = crypto.randomBytes(32).toString('hex');
    await user.save({ validateBeforeSave: false });

    try {
      const { operationalJobService } = await import('./OperationalJobService');
      const { OperationalJobType } = await import('../constants/operationalJob');
      await operationalJobService.enqueue({
        jobType: OperationalJobType.ACCOUNT_DELETION,
        payload: { userId: user._id.toString(), originalEmail },
        idempotencyKey: `account-deletion:${user._id.toString()}`,
      });
    } catch (error) {
      console.error('[AccountDeletionService] Failed to enqueue ACCOUNT_DELETION job', {
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return { status: 'processing' };
  }

  /**
   * Matches the email field's existing format validator
   * (`/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/`) — a 7-character TLD
   * like ".invalid" would be REJECTED by that validator (max 3 chars per
   * label), so a short, obviously-non-deliverable ".inv" TLD is used
   * instead. Guaranteed collision-free since it's keyed on the unique _id.
   */
  private buildAnonymizedEmail(userId: string): string {
    return `deleted.${userId}@deleted.inv`;
  }

  /**
   * OperationalJob handler (ACCOUNT_DELETION). Every step re-checks current
   * state first so a retry after a partial failure is a safe no-op —
   * never double-processed.
   */
  async processAccountDeletion(userId: string, originalEmail?: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return; // Nothing left to clean up.
    if (!user.isDeleted) {
      // The synchronous step always runs first and sets isDeleted before
      // this job is ever enqueued — this should never happen, but fail
      // loudly (permanent) rather than silently cleaning up a live account.
      throw new ApiError(409, 'Account is not marked for deletion');
    }

    try {
      // Only ever this user's own B2C practice interviews (`userId` match)
      // — a hiring-assessment row never has `userId` set, so this can
      // never touch an employer's business record. Idempotent: deleting an
      // already-empty set is a no-op.
      await Interview.deleteMany({ userId: user._id });
    } catch (error) {
      throw new TransientOperationalError(error instanceof Error ? error.message : 'Failed to remove interview history');
    }

    if (originalEmail) {
      try {
        const normalizedEmail = originalEmail.trim().toLowerCase();
        await EmailSuppression.updateOne(
          { normalizedEmail },
          { $setOnInsert: { normalizedEmail, reason: EmailSuppressionReason.MANUAL } },
          { upsert: true }
        );
      } catch (error) {
        throw new TransientOperationalError(error instanceof Error ? error.message : 'Failed to suppress future email delivery');
      }
    }

    // Billing/subscription/credit history intentionally untouched — see
    // retentionPolicy.ts (BILLING is LEGAL_REVIEW_REQUIRED, never touched
    // by any deletion path). PaymentOrder/UserSubscription don't duplicate
    // name/email, so leaving their internal userId reference as-is already
    // satisfies "preserve immutable reference, remove unnecessary profile
    // linkage" — there is no further profile linkage to remove.

    await PrivacyActionAudit.updateOne(
      { subjectUserId: user._id, action: 'deletion_requested', status: { $ne: 'completed' } },
      { $set: { status: 'completed', completedAt: new Date() } }
    );
  }
}

export const accountDeletionService = new AccountDeletionService();
