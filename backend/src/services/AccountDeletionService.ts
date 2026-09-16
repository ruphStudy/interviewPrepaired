import crypto from 'crypto';
import { User, IUser } from '../models/user.model';
import { Interview } from '../models/interview.model';
import { EmailSuppression } from '../models/EmailSuppression.model';
import { EmailSuppressionReason } from '../constants/email';
import { PrivacyActionAudit } from '../models/PrivacyActionAudit.model';
import { authSessionService } from './AuthSessionService';
import { ApiError } from '../utils/ApiError';
import { TransientOperationalError } from '../utils/operationalError';
import { PrivacyErrorCode } from '../constants/privacy';

/**
 * Privacy-safe account deletion. The synchronous phase immediately revokes
 * access and anonymizes the User row; slower content/email cleanup is queued
 * through the existing operational-job path. Financial/audit records are
 * deliberately preserved according to the privacy retention foundation.
 */
class AccountDeletionService {
  async requestDeletion(userId: string, currentPassword: string): Promise<{ status: 'processing' }> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new ApiError(404, 'User not found');
    if (user.isDeleted) return { status: 'processing' };

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(401, 'Current password is incorrect', undefined, PrivacyErrorCode.PRIVACY_REAUTH_REQUIRED);
    }

    return this.beginDeletion(user, user._id.toString(), 'self_service');
  }

  /**
   * Global-admin deletion uses exactly the same privacy lifecycle as
   * self-service deletion, but authorization is enforced by the admin route
   * rather than by asking the target user's password. This avoids the old
   * destructive findByIdAndDelete path that bypassed session revocation,
   * anonymization, email suppression and financial/audit retention.
   */
  async requestDeletionByAdmin(userId: string, actorUserId: string): Promise<{ status: 'processing' }> {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new ApiError(404, 'User not found');
    if (user.isDeleted) return { status: 'processing' };

    if (user._id.toString() === actorUserId) {
      throw new ApiError(400, 'Administrators cannot delete their own account from the admin user-management endpoint');
    }

    return this.beginDeletion(user, actorUserId, 'admin');
  }

  private async beginDeletion(
    user: IUser,
    actorUserId: string,
    source: 'self_service' | 'admin'
  ): Promise<{ status: 'processing' }> {
    const originalEmail = user.email;

    await PrivacyActionAudit.create({
      action: 'deletion_requested',
      actorUserId: user._id.toString() === actorUserId ? user._id : actorUserId,
      subjectUserId: user._id,
      status: 'processing',
      requestedAt: new Date(),
      metadata: { source },
    });

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

  private buildAnonymizedEmail(userId: string): string {
    return `deleted.${userId}@deleted.inv`;
  }

  /** OperationalJob handler. Idempotent after partial failure. */
  async processAccountDeletion(userId: string, originalEmail?: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user) return;
    if (!user.isDeleted) throw new ApiError(409, 'Account is not marked for deletion');

    try {
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

    await PrivacyActionAudit.updateOne(
      { subjectUserId: user._id, action: 'deletion_requested', status: { $ne: 'completed' } },
      { $set: { status: 'completed', completedAt: new Date() } }
    );
  }
}

export const accountDeletionService = new AccountDeletionService();