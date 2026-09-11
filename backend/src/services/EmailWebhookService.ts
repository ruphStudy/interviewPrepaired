import crypto from 'crypto';
import { EmailDelivery } from '../models/EmailDelivery.model';
import { EmailProviderEvent, IEmailProviderEvent } from '../models/EmailProviderEvent.model';
import { EmailSuppression } from '../models/EmailSuppression.model';
import { EmailSuppressionReason } from '../constants/email';
import { env } from '../config/environment';

export interface WebhookProcessingOutcome {
  httpStatus: number;
  body: { success: boolean; message: string };
}

/**
 * Resend delivery/bounce/complaint webhook processing (PR-COMM-6). Resend
 * signs webhooks using the Svix format: HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${rawBody}`, keyed by the base64-decoded
 * secret (after stripping the `whsec_` prefix), base64-encoded, compared
 * against one or more `v1,<sig>` values in the `svix-signature` header.
 * `svix-id` doubles as our EmailProviderEvent idempotency key — Resend
 * guarantees it is stable across redelivery of the exact same event.
 */
class EmailWebhookService {
  verifySignature(rawBody: Buffer, headers: { id?: string; timestamp?: string; signature?: string }): boolean {
    if (!env.emailWebhookSecret || !headers.id || !headers.timestamp || !headers.signature) {
      return false;
    }
    try {
      const secretBytes = Buffer.from(env.emailWebhookSecret.replace(/^whsec_/, ''), 'base64');
      const signedContent = `${headers.id}.${headers.timestamp}.${rawBody.toString('utf8')}`;
      const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
      const provided = headers.signature
        .split(' ')
        .map((part) => part.split(',')[1])
        .filter(Boolean) as string[];
      return provided.some((sig) => this.safeCompare(sig, expected));
    } catch {
      return false;
    }
  }

  async handleWebhook(
    rawBody: Buffer,
    headers: { id?: string; timestamp?: string; signature?: string }
  ): Promise<WebhookProcessingOutcome> {
    if (!env.emailWebhookSecret) {
      return { httpStatus: 503, body: { success: false, message: 'Email webhook is not configured' } };
    }

    const signatureValid = this.verifySignature(rawBody, headers);

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { httpStatus: 400, body: { success: false, message: 'Invalid webhook payload' } };
    }

    const eventType = typeof payload?.type === 'string' ? payload.type : 'unknown';
    const providerMessageId: string | undefined = payload?.data?.email_id;
    // svix-id is the guaranteed-stable dedup key; fall back to a body
    // fingerprint only if it's ever missing (defensive, not expected).
    const providerEventId = headers.id || crypto.createHash('sha256').update(rawBody).digest('hex');

    let eventDoc: IEmailProviderEvent;
    try {
      eventDoc = await EmailProviderEvent.create({
        provider: 'resend',
        providerEventId,
        providerMessageId,
        eventType,
        signatureVerified: signatureValid,
        processingStatus: 'received',
        occurredAt: payload?.created_at ? new Date(payload.created_at) : undefined,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Already processed this exact event — safe no-op.
        return { httpStatus: 200, body: { success: true, message: 'Event already processed' } };
      }
      throw error;
    }

    if (!signatureValid) {
      eventDoc.processingStatus = 'failed';
      eventDoc.failureReason = 'Invalid signature';
      await eventDoc.save();
      return { httpStatus: 400, body: { success: false, message: 'Invalid signature' } };
    }

    try {
      const outcome = await this.applyEvent(eventType, providerMessageId);
      eventDoc.processingStatus = outcome;
      await eventDoc.save();
    } catch (error: any) {
      eventDoc.processingStatus = 'failed';
      eventDoc.failureReason = String(error?.message || error).slice(0, 500);
      await eventDoc.save();
      console.error('[EmailWebhookService] Event processing failed', { eventType, error });
    }

    return { httpStatus: 200, body: { success: true, message: 'Webhook received' } };
  }

  private async applyEvent(eventType: string, providerMessageId?: string): Promise<'processed' | 'ignored'> {
    if (!providerMessageId) return 'ignored';

    const delivery = await EmailDelivery.findOne({ provider: 'resend', providerMessageId });
    if (!delivery) return 'ignored';

    switch (eventType) {
      case 'email.delivered':
        if (delivery.status !== 'bounced' && delivery.status !== 'complained') {
          delivery.status = 'delivered';
          delivery.deliveredAt = new Date();
          await delivery.save();
        }
        return 'processed';

      case 'email.bounced': {
        delivery.status = 'bounced';
        delivery.bouncedAt = new Date();
        await delivery.save();
        await this.suppress(delivery.recipient, EmailSuppressionReason.HARD_BOUNCE, 'resend');
        return 'processed';
      }

      case 'email.complained': {
        delivery.status = 'complained';
        await delivery.save();
        await this.suppress(delivery.recipient, EmailSuppressionReason.COMPLAINT, 'resend');
        return 'processed';
      }

      default:
        return 'ignored';
    }
  }

  private async suppress(normalizedEmail: string, reason: EmailSuppressionReason, provider: string): Promise<void> {
    try {
      await EmailSuppression.create({ normalizedEmail, reason, provider });
    } catch (error: any) {
      if (error?.code !== 11000) throw error; // already suppressed — fine
    }
  }

  private safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'base64');
    const bufB = Buffer.from(b, 'base64');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}

export const emailWebhookService = new EmailWebhookService();
