import crypto from 'crypto';
import { EmailDelivery, IEmailDelivery, EmailProviderName } from '../models/EmailDelivery.model';
import { EmailSuppression } from '../models/EmailSuppression.model';
import { EmailTemplateCode, EMAIL_MAX_ATTEMPTS, getRetryDelayMs } from '../constants/email';
import { getEmailProvider } from '../emails';
import { ApiError } from '../utils/ApiError';

export interface SendTransactionalEmailParams {
  to: string;
  templateCode: EmailTemplateCode;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Business-event idempotency key — e.g. `password-reset:<userId>:<generation>`. Repeated calls with the SAME key never send a second time. */
  idempotencyKey: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Bounded, non-sensitive context only — the caller MUST NEVER put a raw security token here. */
  metadata?: Record<string, unknown>;
}

const TERMINAL_STATUSES = new Set(['sent', 'delivered', 'bounced', 'complained', 'suppressed', 'cancelled']);

/**
 * The ONLY path business services use to send a transactional email
 * (PR-COMM-1) — never call an email provider SDK/HTTP API directly from a
 * business service. Handles idempotency, suppression, delivery-record
 * persistence, the immediate first send attempt, and holds the rendered
 * content (`pendingContent`, a `select:false` field — see the model) just
 * long enough for the background retry worker to finish an in-flight send;
 * that content is deleted the moment the delivery reaches a terminal
 * state. Never logs the rendered HTML/text (which may embed a raw
 * security-link token) — only the subject and recipient are ever logged.
 */
class TransactionalEmailService {
  async sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<IEmailDelivery> {
    const recipient = params.to.trim().toLowerCase();
    if (!recipient || !recipient.includes('@')) {
      throw new ApiError(400, 'A valid recipient email is required');
    }
    const recipientHash = this.hashRecipient(recipient);

    const existing = await EmailDelivery.findOne({ idempotencyKey: params.idempotencyKey });
    if (existing) {
      // Same deliberate business event — never send a second time, even on
      // an HTTP retry of the calling request.
      return existing;
    }

    const suppressed = await EmailSuppression.findOne({ normalizedEmail: recipient });

    let created: IEmailDelivery;
    try {
      created = await EmailDelivery.create({
        recipient,
        recipientHash,
        templateCode: params.templateCode,
        status: suppressed ? 'suppressed' : 'queued',
        provider: this.currentProviderName(),
        subjectSnapshot: params.subject.slice(0, 300),
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        attemptCount: 0,
        maxAttempts: EMAIL_MAX_ATTEMPTS,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata,
        pendingContent: suppressed ? undefined : { html: params.html, text: params.text, replyTo: params.replyTo },
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Race: a concurrent call with the same key won — return its record.
        const winner = await EmailDelivery.findOne({ idempotencyKey: params.idempotencyKey });
        if (winner) return winner;
      }
      throw error;
    }

    if (suppressed) {
      return created;
    }

    return this.attemptSend(created);
  }

  /**
   * Performs exactly one send attempt for a delivery that already has
   * `pendingContent` loaded (either just-created above, or re-fetched with
   * `.select('+pendingContent')` by the retry worker). Idempotent against
   * being called on an already-terminal delivery.
   */
  async attemptSend(delivery: IEmailDelivery): Promise<IEmailDelivery> {
    if (TERMINAL_STATUSES.has(delivery.status)) {
      return delivery;
    }
    if (!delivery.pendingContent) {
      // Nothing to send (already cleared, or somehow never set) — treat as
      // a permanent failure rather than looping forever with no content.
      delivery.status = 'failed';
      delivery.failureCode = 'MISSING_CONTENT';
      delivery.failureMessage = 'No rendered content was available for this delivery';
      delivery.failedAt = new Date();
      await delivery.save();
      return delivery;
    }

    const provider = getEmailProvider();
    const now = new Date();
    delivery.attemptCount += 1;
    delivery.lastAttemptAt = now;

    if (!provider) {
      // Infra/config issue, not a recipient-side rejection — treated as
      // transient so it retries (bounded by maxAttempts) in case the
      // provider gets configured before attempts run out.
      return this.recordFailure(delivery, { code: 'EMAIL_PROVIDER_UNAVAILABLE', message: 'No email provider is configured' }, true);
    }

    const content = delivery.pendingContent;
    let result;
    try {
      result = await provider.sendEmail({
        to: delivery.recipient,
        subject: delivery.subjectSnapshot,
        html: content.html,
        text: content.text,
        replyTo: content.replyTo,
        idempotencyKey: delivery.idempotencyKey,
      });
    } catch (error: any) {
      return this.recordFailure(delivery, { code: 'PROVIDER_EXCEPTION', message: String(error?.message || error).slice(0, 300) }, true);
    }

    if (result.accepted) {
      delivery.status = 'sent';
      delivery.sentAt = now;
      delivery.providerMessageId = result.providerMessageId;
      delivery.failureCode = undefined;
      delivery.failureMessage = undefined;
      delivery.nextAttemptAt = undefined;
      delivery.pendingContent = undefined;
      await delivery.save();
      return delivery;
    }

    return this.recordFailure(delivery, { code: result.failureCode, message: result.failureMessage }, result.transient !== false);
  }

  private async recordFailure(
    delivery: IEmailDelivery,
    failure: { code?: string; message?: string },
    transient: boolean
  ): Promise<IEmailDelivery> {
    const now = new Date();
    delivery.failureCode = failure.code?.slice(0, 100);
    delivery.failureMessage = failure.message?.slice(0, 500);

    const attemptsRemaining = delivery.attemptCount < delivery.maxAttempts;
    if (transient && attemptsRemaining) {
      delivery.status = 'queued';
      delivery.nextAttemptAt = new Date(now.getTime() + getRetryDelayMs(delivery.attemptCount + 1));
    } else {
      delivery.status = 'failed';
      delivery.failedAt = now;
      delivery.nextAttemptAt = undefined;
      delivery.pendingContent = undefined;
    }

    await delivery.save();
    return delivery;
  }

  private hashRecipient(normalizedEmail: string): string {
    return crypto.createHash('sha256').update(normalizedEmail).digest('hex');
  }

  private currentProviderName(): EmailProviderName {
    const provider = getEmailProvider();
    return (provider?.name as EmailProviderName) || 'resend';
  }
}

export const transactionalEmailService = new TransactionalEmailService();
