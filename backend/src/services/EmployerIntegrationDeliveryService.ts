import crypto from 'crypto';
import { Types } from 'mongoose';
import EmployerIntegrationConnection, { IEmployerIntegrationConnection } from '../models/EmployerIntegrationConnection.model';
import EmployerIntegrationEvent, { IEmployerIntegrationEvent } from '../models/EmployerIntegrationEvent.model';
import EmployerIntegrationDelivery, { IEmployerIntegrationDelivery } from '../models/EmployerIntegrationDelivery.model';
import { decryptSecret } from '../utils/integrationSecretEncryption';
import { assertSafeOutboundUrl } from '../utils/ssrfSafeUrl';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export const INTEGRATION_DELIVERY_VERSION = 'integration-delivery-v1';
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_ERROR_MESSAGE_LENGTH = 500;
// Deterministic bounded backoff by attempt number (31D section 9) — never an infinite/unbounded retry loop.
const RETRY_DELAYS_MS = [0, 30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

interface WebhookSendResult {
  delivered: boolean;
  responseStatus?: number;
  errorMessage?: string;
  retryable: boolean;
}

/**
 * DB-backed outbox delivery engine (31D/31E) — fans out one delivery row
 * per eligible connection for an emitted event, then attempts real HTTP
 * delivery ONLY for genuinely webhook-capable connections (`webhook`/
 * `generic` or `ats`/`custom` with a configured endpoint). Every other
 * provider is a deliberate, honest `provider_not_implemented` — never a
 * faked successful sync. No background worker exists in this project, so
 * delivery is attempted inline (fire-and-forget from the emitter) AND via
 * `processPendingDeliveries()`, which a future cron/worker can call
 * directly without any other change.
 */
export class EmployerIntegrationDeliveryService {
  /** Called by the event emitter — creates one delivery per eligible active connection, then attempts them immediately (never awaited by the emitter's own caller). */
  async enqueueAndProcessForEvent(event: IEmployerIntegrationEvent): Promise<void> {
    const connections = await EmployerIntegrationConnection.find({
      organizationId: event.organizationId,
      type: { $in: ['webhook', 'ats'] },
      status: 'active',
    });

    const eligible = connections.filter((c) => {
      const enabled = c.config.enabledEventTypes;
      return !enabled || enabled.length === 0 || enabled.includes(event.eventType);
    });
    if (eligible.length === 0) return;

    const deliveries: IEmployerIntegrationDelivery[] = [];
    for (const connection of eligible) {
      try {
        const delivery = await EmployerIntegrationDelivery.create({
          organizationId: event.organizationId,
          connectionId: connection._id,
          integrationEventId: event._id,
          status: 'pending',
          attemptCount: 0,
          nextAttemptAt: new Date(),
          deliveryVersion: INTEGRATION_DELIVERY_VERSION,
        });
        deliveries.push(delivery);
      } catch (error: any) {
        if (error?.code !== 11000) {
          console.error('[EmployerIntegrationDeliveryService] Failed to create delivery row (non-fatal)', error);
        }
      }
    }

    for (const delivery of deliveries) {
      await this.attemptDelivery(delivery).catch((error) => {
        console.error('[EmployerIntegrationDeliveryService] Delivery attempt failed unexpectedly (non-fatal)', error);
      });
    }
  }

  /** Structured so a future cron/worker can call this directly — processes bounded, due deliveries across all organizations. */
  async processPendingDeliveries(limit = 20): Promise<{ processed: number }> {
    const due = await EmployerIntegrationDelivery.find({
      status: 'pending',
      nextAttemptAt: { $lte: new Date() },
      attemptCount: { $lt: MAX_ATTEMPTS },
    })
      .sort({ nextAttemptAt: 1 })
      .limit(Math.min(Math.max(limit, 1), 100));

    for (const delivery of due) {
      await this.attemptDelivery(delivery).catch((error) => {
        console.error('[EmployerIntegrationDeliveryService] Delivery attempt failed unexpectedly (non-fatal)', error);
      });
    }
    return { processed: due.length };
  }

  /** POST .../integrations/:connectionId/deliveries/:deliveryId/retry — requires ORGANIZATION_UPDATE. Manual retry only; idempotency is preserved (a `delivered` row is returned as-is, never re-sent). */
  async retryDelivery(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    connectionId: string,
    deliveryId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const delivery = await EmployerIntegrationDelivery.findOne({ _id: deliveryId, organizationId, connectionId });
    if (!delivery) {
      throw new ApiError(404, 'Delivery not found');
    }
    if (delivery.status === 'delivered') {
      return this.toDetail(delivery);
    }
    if (delivery.status === 'processing') {
      throw new ApiError(409, 'This delivery is already being processed — please try again shortly');
    }

    delivery.status = 'pending';
    delivery.nextAttemptAt = new Date();
    await delivery.save();

    await this.attemptDelivery(delivery);
    return this.toDetail(delivery);
  }

  /** GET .../integrations/:connectionId/deliveries — requires ORGANIZATION_VIEW. */
  async listDeliveries(organizationId: string, actingRole: OrganizationMemberRole, connectionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const connection = await EmployerIntegrationConnection.findOne({ _id: connectionId, organizationId });
    if (!connection) {
      throw new ApiError(404, 'Integration connection not found');
    }

    const deliveries = await EmployerIntegrationDelivery.find({ organizationId, connectionId }).sort({ createdAt: -1 }).limit(50);
    const eventIds = deliveries.map((d) => d.integrationEventId);
    const events = await EmployerIntegrationEvent.find({ _id: { $in: eventIds } }).select('_id eventType');
    const eventTypeById = new Map(events.map((e) => [e._id.toString(), e.eventType]));

    return {
      deliveries: deliveries.map((d) => ({
        ...this.toDetail(d),
        eventType: eventTypeById.get(d.integrationEventId.toString()) ?? 'unknown',
      })),
    };
  }

  /** Sends a bounded, unattached `integration.test` event directly (never queued/persisted as a real milestone event) — used by the manual "Test" action. */
  async sendTestWebhook(organizationId: string, actingRole: OrganizationMemberRole, connectionId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const connection = await EmployerIntegrationConnection.findOne({ _id: connectionId, organizationId }).select('+secretConfigEncrypted');
    if (!connection) {
      throw new ApiError(404, 'Integration connection not found');
    }

    const testPayload = {
      id: new Types.ObjectId().toString(),
      type: 'integration.test',
      version: INTEGRATION_DELIVERY_VERSION,
      occurredAt: new Date().toISOString(),
      organizationId: organizationId,
      data: {},
    };

    const result = await this.sendWebhookPayload(connection, testPayload, 'integration.test', testPayload.id);
    return {
      success: result.delivered,
      responseStatus: result.responseStatus,
      errorMessage: result.delivered ? undefined : result.errorMessage,
    };
  }

  private async attemptDelivery(delivery: IEmployerIntegrationDelivery): Promise<void> {
    const claimed = await EmployerIntegrationDelivery.findOneAndUpdate(
      { _id: delivery._id, status: 'pending' },
      { $set: { status: 'processing', lastAttemptAt: new Date() }, $inc: { attemptCount: 1 } },
      { new: true }
    );
    if (!claimed) return; // Already claimed/processed by another caller — safe no-op.

    const [connection, event] = await Promise.all([
      EmployerIntegrationConnection.findById(claimed.connectionId).select('+secretConfigEncrypted'),
      EmployerIntegrationEvent.findById(claimed.integrationEventId),
    ]);
    if (!connection || !event || connection.status !== 'active') {
      await EmployerIntegrationDelivery.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', errorMessage: 'Connection is no longer active.' } }
      );
      return;
    }

    const payload = this.buildEventPayload(connection.organizationId.toString(), event);
    const result = await this.sendWebhookPayload(connection, payload, event.eventType, claimed._id.toString());

    if (result.delivered) {
      await EmployerIntegrationDelivery.updateOne(
        { _id: claimed._id },
        { $set: { status: 'delivered', deliveredAt: new Date(), responseStatus: result.responseStatus }, $unset: { errorMessage: 1 } }
      );
      return;
    }

    const nextAttemptNumber = claimed.attemptCount; // already incremented above
    if (result.retryable && nextAttemptNumber < MAX_ATTEMPTS) {
      const delayMs = RETRY_DELAYS_MS[Math.min(nextAttemptNumber, RETRY_DELAYS_MS.length - 1)];
      await EmployerIntegrationDelivery.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: 'pending',
            nextAttemptAt: new Date(Date.now() + delayMs),
            responseStatus: result.responseStatus,
            errorMessage: result.errorMessage,
          },
        }
      );
    } else {
      await EmployerIntegrationDelivery.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: result.retryable ? 'dead_letter' : 'failed',
            responseStatus: result.responseStatus,
            errorMessage: result.errorMessage,
          },
        }
      );
    }
  }

  /** Only `webhook`/`generic` and `ats`/`custom` (with a configured endpoint) are genuinely webhook-capable — every other provider is an honest, deterministic `provider_not_implemented`, never a faked success. */
  private async sendWebhookPayload(
    connection: IEmployerIntegrationConnection,
    payload: Record<string, unknown>,
    eventTypeHeader: string,
    deliveryIdHeader: string
  ): Promise<WebhookSendResult> {
    const isWebhookCapable =
      (connection.type === 'webhook' && connection.provider === 'generic') || (connection.type === 'ats' && connection.provider === 'custom');
    if (!isWebhookCapable || !connection.config.baseUrl) {
      return { delivered: false, retryable: false, errorMessage: 'provider_not_implemented' };
    }

    let url: URL;
    try {
      url = await assertSafeOutboundUrl(connection.config.baseUrl);
    } catch (error) {
      return { delivered: false, retryable: false, errorMessage: error instanceof ApiError ? error.message : 'Invalid endpoint URL' };
    }

    const rawBody = JSON.stringify(payload);
    const timestamp = Date.now().toString();
    const signature = this.signPayload(connection, timestamp, rawBody);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-EnterSkill-Event': eventTypeHeader,
          'X-EnterSkill-Delivery': deliveryIdHeader,
          'X-EnterSkill-Timestamp': timestamp,
          ...(signature ? { 'X-EnterSkill-Signature': signature } : {}),
        },
        body: rawBody,
        signal: controller.signal,
      });

      if (response.status >= 200 && response.status < 300) {
        return { delivered: true, responseStatus: response.status, retryable: false };
      }
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      return {
        delivered: false,
        responseStatus: response.status,
        retryable,
        errorMessage: `Endpoint responded with status ${response.status}`.slice(0, MAX_ERROR_MESSAGE_LENGTH),
      };
    } catch (error) {
      return { delivered: false, retryable: true, errorMessage: 'Request timed out or a network error occurred.' };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** HMAC-SHA256 over `${timestamp}.${rawBody}` — never logs the signing secret. Returns undefined (unsigned) only when no secret is configured for this connection. */
  private signPayload(connection: IEmployerIntegrationConnection, timestamp: string, rawBody: string): string | undefined {
    if (!connection.secretConfigEncrypted) return undefined;
    try {
      const secret = decryptSecret(connection.secretConfigEncrypted);
      const hmac = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
      return `sha256=${hmac}`;
    } catch (error) {
      console.error('[EmployerIntegrationDeliveryService] Failed to sign webhook payload (non-fatal — sent unsigned)', error);
      return undefined;
    }
  }

  /** Intentionally bounded (31E section 12/30) — IDs/status/milestone summary ONLY, never answers/source code/resumes/KB content/proctoring timelines/integrity signals. */
  private buildEventPayload(organizationId: string, event: IEmployerIntegrationEvent): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    if (event.applicationId) data.applicationId = event.applicationId.toString();
    if (event.jobId) data.jobId = event.jobId.toString();
    if (event.interviewId) data.interviewId = event.interviewId.toString();
    if (event.data) {
      for (const [key, value] of event.data.entries()) {
        data[key] = value;
      }
    }

    return {
      id: event._id.toString(),
      type: event.eventType,
      version: event.payloadVersion,
      occurredAt: event.occurredAt.toISOString(),
      organizationId,
      data,
    };
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private toDetail(delivery: IEmployerIntegrationDelivery): Record<string, unknown> {
    return {
      id: delivery._id.toString(),
      connectionId: delivery.connectionId.toString(),
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      nextAttemptAt: delivery.nextAttemptAt,
      lastAttemptAt: delivery.lastAttemptAt,
      deliveredAt: delivery.deliveredAt,
      responseStatus: delivery.responseStatus,
      errorMessage: delivery.errorMessage,
      createdAt: delivery.createdAt,
    };
  }
}

export const employerIntegrationDeliveryService = new EmployerIntegrationDeliveryService();
export default employerIntegrationDeliveryService;
