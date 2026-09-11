import { EmailDelivery, IEmailDelivery } from '../models/EmailDelivery.model';
import { ApiError } from '../utils/ApiError';

export interface AdminSafeEmailDelivery {
  id: string;
  recipientMasked: string;
  templateCode: string;
  status: string;
  provider: string;
  providerMessageId?: string;
  subjectSnapshot: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  bouncedAt?: Date;
  failureCode?: string;
  failureMessage?: string;
  createdAt: Date;
}

/**
 * Minimal admin-safe email-delivery visibility (PR-COMM-6). Reuses the
 * existing admin RBAC (`authorize('admin')` on `/api/v1/admin`) — no new
 * admin framework. Never exposes a security token, provider credential,
 * raw webhook secret, password, or the rendered email body — `pendingContent`
 * is `select:false` on the model and is never selected here.
 */
class EmailDeliveryAdminService {
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const visible = local.slice(0, 1) || '*';
    return `${visible}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
  }

  private toAdminSafe(doc: IEmailDelivery): AdminSafeEmailDelivery {
    return {
      id: doc._id.toString(),
      recipientMasked: this.maskEmail(doc.recipient),
      templateCode: doc.templateCode,
      status: doc.status,
      provider: doc.provider,
      providerMessageId: doc.providerMessageId,
      subjectSnapshot: doc.subjectSnapshot,
      relatedEntityType: doc.relatedEntityType,
      relatedEntityId: doc.relatedEntityId,
      attemptCount: doc.attemptCount,
      maxAttempts: doc.maxAttempts,
      lastAttemptAt: doc.lastAttemptAt,
      nextAttemptAt: doc.nextAttemptAt,
      sentAt: doc.sentAt,
      deliveredAt: doc.deliveredAt,
      failedAt: doc.failedAt,
      bouncedAt: doc.bouncedAt,
      failureCode: doc.failureCode,
      failureMessage: doc.failureMessage,
      createdAt: doc.createdAt,
    };
  }

  async listDeliveries(options: {
    status?: string;
    templateCode?: string;
    page?: number;
    limit?: number;
  }): Promise<{ deliveries: AdminSafeEmailDelivery[]; page: number; limit: number; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const filter: Record<string, unknown> = {};
    if (options.status) filter.status = options.status;
    if (options.templateCode) filter.templateCode = options.templateCode;

    const [deliveries, total] = await Promise.all([
      EmailDelivery.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      EmailDelivery.countDocuments(filter),
    ]);

    return { deliveries: deliveries.map((d) => this.toAdminSafe(d)), page, limit, total };
  }

  async getDelivery(deliveryId: string): Promise<AdminSafeEmailDelivery> {
    const delivery = await EmailDelivery.findById(deliveryId);
    if (!delivery) {
      throw new ApiError(404, 'Email delivery not found');
    }
    return this.toAdminSafe(delivery);
  }
}

export const emailDeliveryAdminService = new EmailDeliveryAdminService();
