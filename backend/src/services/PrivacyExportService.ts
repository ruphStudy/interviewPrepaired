import { PrivacyExportRequest, IPrivacyExportRequest } from '../models/PrivacyExportRequest.model';
import { PrivacyActionAudit } from '../models/PrivacyActionAudit.model';
import { User } from '../models/user.model';
import { Interview } from '../models/interview.model';
import OrganizationMember from '../models/OrganizationMember.model';
import Organization from '../models/Organization.model';
import { InterviewCreditBalance } from '../models/InterviewCreditBalance.model';
import { billingOrderService } from './BillingOrderService';
import { userSubscriptionService } from './UserSubscriptionService';
import { userConsentService } from './UserConsentService';
import { fileStorageService } from './FileStorageService';
import { StoredFileCategory } from '../constants/storage';
import { env } from '../config/environment';
import { ApiError } from '../utils/ApiError';
import { TransientOperationalError } from '../utils/operationalError';
import { PrivacyErrorCode } from '../constants/privacy';

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * User data export (PR-PRIVACY-2). `requestExport` is the ONLY entry point
 * from a controller — always keyed on the authenticated caller's own
 * userId, never a body/param-supplied id. Generation runs asynchronously
 * via the generic OperationalJob system (PRIVACY_EXPORT_GENERATION) so the
 * request handler responds immediately.
 */
class PrivacyExportService {
  /** Creates (or returns the existing pending/processing) export request for this user, and enqueues generation. */
  async requestExport(userId: string): Promise<IPrivacyExportRequest> {
    let request: IPrivacyExportRequest;
    try {
      request = await PrivacyExportRequest.create({
        userId,
        status: 'pending',
        requestedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await PrivacyExportRequest.findOne({
          userId,
          status: { $in: ['pending', 'processing'] },
        });
        if (existing) {
          throw new ApiError(409, 'A data export is already in progress for your account', undefined, PrivacyErrorCode.PRIVACY_EXPORT_ALREADY_PENDING);
        }
      }
      throw error;
    }

    await PrivacyActionAudit.create({
      action: 'export_requested',
      subjectUserId: request.userId,
      status: 'pending',
      requestedAt: request.requestedAt,
    });

    try {
      const { operationalJobService } = await import('./OperationalJobService');
      const { OperationalJobType } = await import('../constants/operationalJob');
      await operationalJobService.enqueue({
        jobType: OperationalJobType.PRIVACY_EXPORT_GENERATION,
        payload: { exportRequestId: request._id.toString() },
        idempotencyKey: `privacy-export:${request._id.toString()}`,
      });
    } catch (error) {
      console.error('[PrivacyExportService] Failed to enqueue PRIVACY_EXPORT_GENERATION job', {
        exportRequestId: request._id.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return request;
  }

  async listRequests(userId: string): Promise<IPrivacyExportRequest[]> {
    return PrivacyExportRequest.find({ userId }).sort({ createdAt: -1 }).limit(20);
  }

  /** Exact owner only — a mismatch is treated identically to a nonexistent request (404), never leaking whether it exists for a different user. */
  async getOwnedRequest(userId: string, requestId: string): Promise<IPrivacyExportRequest> {
    const request = await PrivacyExportRequest.findOne({ _id: requestId, userId });
    if (!request) {
      throw new ApiError(404, 'Export request not found', undefined, PrivacyErrorCode.PRIVACY_EXPORT_NOT_FOUND);
    }
    return request;
  }

  /**
   * OperationalJob handler (PRIVACY_EXPORT_GENERATION). Idempotent: a
   * completed request is a no-op; a missing request (e.g. the user was
   * later deleted) is also a no-op rather than an error, since there is
   * nothing left to export.
   */
  async generateExport(exportRequestId: string): Promise<void> {
    const request = await PrivacyExportRequest.findById(exportRequestId);
    if (!request) return;
    if (request.status === 'completed' || request.status === 'expired') return;

    if (request.status === 'pending') {
      request.status = 'processing';
      await request.save();
    }

    const user = await User.findById(request.userId);
    if (!user) {
      request.status = 'failed';
      request.failureReason = 'The associated account no longer exists';
      await request.save();
      return;
    }

    try {
      const bundle = await this.buildExportBundle(user);
      const buffer = Buffer.from(JSON.stringify(bundle, null, 2), 'utf-8');

      let uploadResult;
      try {
        uploadResult = await fileStorageService.uploadFile({
          category: StoredFileCategory.EXPORT,
          scope: [user._id.toString()],
          buffer,
          extension: '.json',
          contentType: 'application/json',
        });
      } catch (error) {
        // A storage hiccup is plausibly transient — let the job retry.
        throw new TransientOperationalError(error instanceof Error ? error.message : 'Export upload failed');
      }

      request.objectKey = uploadResult.objectKey;
      request.storageProvider = uploadResult.provider;
      request.checksumSha256 = uploadResult.checksumSha256;
      request.status = 'completed';
      request.completedAt = new Date();
      request.expiresAt = new Date(Date.now() + env.privacyExportRetentionHours * 60 * 60 * 1000);
      await request.save();

      await PrivacyActionAudit.create({
        action: 'export_completed',
        subjectUserId: user._id,
        status: 'completed',
        requestedAt: request.requestedAt,
        completedAt: request.completedAt,
      });
    } catch (error) {
      if (error instanceof TransientOperationalError) {
        throw error;
      }
      request.status = 'failed';
      request.failureReason = truncate(error instanceof Error ? error.message : 'Export generation failed', 500);
      await request.save();
      throw error;
    }
  }

  /**
   * Gathers ONLY the user's own data, exactly as they could already see it
   * through the existing authenticated APIs — never a password/token/
   * secret, never another user's/candidate's data, never a hidden employer
   * rubric.
   */
  private async buildExportBundle(user: InstanceType<typeof User>): Promise<Record<string, unknown>> {
    const [interviews, memberships, orders, subscription, creditBalance, consents, priorRequests] = await Promise.all([
      Interview.find({ userId: user._id }).lean(),
      OrganizationMember.find({ userId: user._id }).lean(),
      billingOrderService.listOrders(user._id.toString(), { limit: 100 }),
      userSubscriptionService.getCurrentSubscription(user._id.toString()),
      InterviewCreditBalance.findOne({ userId: user._id }).lean(),
      userConsentService.getUserConsents(user._id.toString()),
      PrivacyExportRequest.find({ userId: user._id }).select('status requestedAt completedAt expiresAt').lean(),
    ]);

    const organizationIds = Array.from(new Set(memberships.map((m: any) => m.organizationId.toString())));
    const organizations = organizationIds.length
      ? await Organization.find({ _id: { $in: organizationIds } }).select('name type').lean()
      : [];
    const organizationNameById = new Map(organizations.map((o) => [o._id.toString(), o.name]));

    return {
      exportedAt: new Date().toISOString(),
      account: {
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        isVerified: user.isVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        preferences: user.preferences,
      },
      interviews: interviews
        // Only ever this user's own B2C practice interviews — a hiring-assessment
        // row never has `userId` set, so this filter is structurally impossible
        // to cross into employer-owned data.
        .map((interview: any) => ({
          id: interview._id.toString(),
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceYears: interview.experienceYears,
          interviewStyle: interview.interviewStyle,
          status: interview.status,
          totalQuestions: interview.totalQuestions,
          questions: (interview.questions || []).map((q: any) => ({
            questionText: q.questionText,
            answerText: q.answerText,
            evaluation: q.evaluation,
          })),
          finalReport: interview.finalReport,
          createdAt: interview.createdAt,
          completedAt: interview.completedAt,
        })),
      billing: {
        orders: orders.orders,
        subscription: subscription
          ? {
              planCode: subscription.planCode,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              autoRenew: subscription.autoRenew,
            }
          : null,
        creditBalance: creditBalance ? { balance: creditBalance.balance } : null,
      },
      memberships: memberships.map((m: any) => ({
        organizationId: m.organizationId.toString(),
        organizationName: organizationNameById.get(m.organizationId.toString()),
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
      privacy: {
        consents,
        exportRequests: priorRequests.map((r: any) => ({
          status: r.status,
          requestedAt: r.requestedAt,
          completedAt: r.completedAt,
          expiresAt: r.expiresAt,
        })),
      },
    };
  }

  /**
   * Periodic sweep — finds completed exports past `expiresAt`, deletes the
   * stored archive, and flips status to 'expired'. Only ever touches
   * PrivacyExportRequest rows it owns; never any other collection.
   */
  async cleanupExpiredExports(batchSize = 50): Promise<void> {
    const now = new Date();
    const expired = await PrivacyExportRequest.find({
      status: 'completed',
      expiresAt: { $lt: now },
    })
      .limit(batchSize)
      .lean();

    for (const row of expired) {
      try {
        if (row.objectKey) {
          await fileStorageService.deleteFileBestEffort(row.objectKey, 'privacy export retention cleanup');
        }
        await PrivacyExportRequest.updateOne(
          { _id: row._id, status: 'completed' },
          { $set: { status: 'expired' }, $unset: { objectKey: '', storageProvider: '', checksumSha256: '' } }
        );
      } catch (error) {
        console.error('[PrivacyExportService] cleanupExpiredExports failed for one row', {
          requestId: row._id.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

export const privacyExportService = new PrivacyExportService();
