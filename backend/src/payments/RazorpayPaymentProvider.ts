import crypto from 'crypto';
import Razorpay from 'razorpay';
import {
  PaymentProvider,
  CreateOrderParams,
  ProviderOrder,
  ProviderPayment,
  VerifyPaymentSignatureParams,
  RefundPaymentParams,
  ProviderRefund,
} from './PaymentProvider';

/**
 * Real Razorpay integration (PR-BILL-1). Configuration comes ONLY from
 * environment variables (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET) — never hardcoded, never read from anywhere the
 * client could influence. `keySecret`/`webhookSecret` are private fields
 * that are never exposed on the object in a way a caller could serialize
 * (`publicKeyId` is the only credential-shaped value ever returned).
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  readonly publicKeyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly client: Razorpay;

  constructor(config: { keyId: string; keySecret: string; webhookSecret: string }) {
    this.publicKeyId = config.keyId;
    this.keySecret = config.keySecret;
    this.webhookSecret = config.webhookSecret;
    this.client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
  }

  async createOrder(params: CreateOrderParams): Promise<ProviderOrder> {
    const order = await this.client.orders.create({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes,
    });
    return { id: order.id, amountPaise: Number(order.amount), currency: order.currency, status: order.status };
  }

  verifyPaymentSignature(params: VerifyPaymentSignatureParams): boolean {
    const expected = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${params.orderId}|${params.paymentId}`)
      .digest('hex');
    return this.safeCompare(expected, params.signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return this.safeCompare(expected, signature);
  }

  async fetchPayment(paymentId: string): Promise<ProviderPayment> {
    const payment = await this.client.payments.fetch(paymentId);
    return {
      id: payment.id,
      orderId: payment.order_id || '',
      amountPaise: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
    };
  }

  async fetchOrder(orderId: string): Promise<ProviderOrder> {
    const order = await this.client.orders.fetch(orderId);
    return { id: order.id, amountPaise: Number(order.amount), currency: order.currency, status: order.status };
  }

  async refundPayment(params: RefundPaymentParams): Promise<ProviderRefund> {
    const refund = await this.client.payments.refund(params.paymentId, {
      amount: params.amountPaise,
      notes: params.notes,
    });
    return {
      id: refund.id,
      paymentId: refund.payment_id,
      amountPaise: Number(refund.amount),
      status: refund.status,
    };
  }

  /** Constant-time comparison — a plain `===` on attacker-influenced signatures would leak timing information. */
  private safeCompare(expected: string, actual: string): boolean {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.from(actual, 'utf8');
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }
}
