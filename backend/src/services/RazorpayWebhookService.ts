import crypto from 'crypto';
import { PaymentOrder } from '../models/PaymentOrder.model';
import { PaymentWebhookEvent, IPaymentWebhookEvent } from '../models/PaymentWebhookEvent.model';
import { getPaymentProvider } from '../payments';
import { billingSettlementService } from './BillingSettlementService';

export interface WebhookProcessingOutcome {
  httpStatus: number;
  body: { success: boolean; message: string };
}

/**
 * Razorpay webhook processing (PR-BILL-3). Signature is verified against
 * the RAW request body bytes (never the parsed/re-serialized JSON — a
 * re-serialization can byte-differ from what Razorpay actually signed).
 * Every delivery is deduplicated via PaymentWebhookEvent's unique
 * (provider, providerEventId) index BEFORE any business logic runs, so a
 * provider retry/replay of the same event is always a safe no-op.
 */
class RazorpayWebhookService {
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<WebhookProcessingOutcome> {
    const provider = getPaymentProvider();
    if (!provider) {
      return { httpStatus: 503, body: { success: false, message: 'Payment provider is not configured' } };
    }

    const signatureValid = provider.verifyWebhookSignature(rawBody, signatureHeader);

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return { httpStatus: 400, body: { success: false, message: 'Invalid webhook payload' } };
    }

    const eventType = typeof payload?.event === 'string' ? payload.event : 'unknown';
    const paymentEntity = payload?.payload?.payment?.entity;
    const orderEntity = payload?.payload?.order?.entity;
    const providerPaymentId: string | undefined = paymentEntity?.id;
    const providerOrderId: string | undefined = paymentEntity?.order_id || orderEntity?.id;

    // Razorpay does not guarantee a stable event id on every plan/webhook
    // configuration — fall back to a deterministic fingerprint of the raw
    // body so a genuine replay of the exact same delivery is still deduped.
    const providerEventId = crypto.createHash('sha256').update(rawBody).digest('hex');

    let eventDoc: IPaymentWebhookEvent;
    try {
      eventDoc = await PaymentWebhookEvent.create({
        provider: 'razorpay',
        providerEventId,
        eventType,
        providerOrderId,
        providerPaymentId,
        signatureVerified: signatureValid,
        processingStatus: 'received',
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Already seen this exact delivery — safe no-op, never a second grant.
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
      const outcome = await this.processEvent(eventType, payload);
      eventDoc.processingStatus = outcome;
      eventDoc.processedAt = new Date();
      await eventDoc.save();
    } catch (error: any) {
      eventDoc.processingStatus = 'failed';
      eventDoc.failureReason = String(error?.message || error).slice(0, 500);
      await eventDoc.save();
      console.error('[RazorpayWebhookService] Event processing failed', { eventType, error });
    }

    // Always 200 once signature is valid and the delivery is durably
    // recorded — a processing failure is logged for reconciliation, not
    // something the provider should keep retrying indefinitely.
    return { httpStatus: 200, body: { success: true, message: 'Webhook received' } };
  }

  private async processEvent(eventType: string, payload: any): Promise<'processed' | 'ignored'> {
    switch (eventType) {
      case 'payment.captured': {
        const paymentEntity = payload?.payload?.payment?.entity;
        if (!paymentEntity?.order_id || !paymentEntity?.id) return 'ignored';
        const order = await PaymentOrder.findOne({ provider: 'razorpay', providerOrderId: paymentEntity.order_id });
        if (!order) return 'ignored';
        await billingSettlementService.settleSuccessfulPayment((order._id as any).toString(), {
          providerPaymentId: paymentEntity.id,
          source: 'webhook',
        });
        return 'processed';
      }

      case 'payment.failed': {
        const paymentEntity = payload?.payload?.payment?.entity;
        if (!paymentEntity?.order_id) return 'ignored';
        const order = await PaymentOrder.findOne({ provider: 'razorpay', providerOrderId: paymentEntity.order_id });
        if (!order || order.status === 'paid') {
          // Never let a stale/out-of-order failure event downgrade an
          // already-settled order.
          return 'ignored';
        }
        await PaymentOrder.updateOne(
          { _id: order._id, status: { $ne: 'paid' } },
          {
            $set: {
              status: 'failed',
              failureCode: paymentEntity.error_code || 'PAYMENT_FAILED',
              failureMessage: String(paymentEntity.error_description || 'Payment failed').slice(0, 500),
            },
          }
        );
        return 'processed';
      }

      case 'subscription.charged': {
        // Foundation only — this codebase's MVP does not create Razorpay
        // recurring subscriptions yet (manual renewal checkout is the
        // supported mode). Reserved for when that mode is added.
        return 'ignored';
      }

      case 'payment.dispute.created': {
        // Reserved for future dispute handling — no automatic entitlement
        // change happens purely from a dispute being opened.
        return 'ignored';
      }

      case 'refund.processed': {
        const paymentEntity = payload?.payload?.payment?.entity;
        const refundEntity = payload?.payload?.refund?.entity;
        if (!paymentEntity?.id) return 'ignored';
        const order = await PaymentOrder.findOne({ provider: 'razorpay', providerPaymentId: paymentEntity.id });
        if (!order) return 'ignored';
        const amountRefunded = Number(paymentEntity.amount_refunded ?? refundEntity?.amount ?? 0);
        const isFullRefund = amountRefunded >= order.amountPaise;
        await PaymentOrder.updateOne(
          { _id: order._id },
          {
            $set: {
              status: isFullRefund ? 'refunded' : 'partially_refunded',
              refundedAt: new Date(),
              refundedAmountPaise: amountRefunded,
            },
          }
        );
        return 'processed';
      }

      default:
        return 'ignored';
    }
  }
}

export const razorpayWebhookService = new RazorpayWebhookService();
