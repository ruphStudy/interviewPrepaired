/**
 * Provider-neutral payment contract (PR-BILL-1). Every payment-provider
 * integration (currently only Razorpay) implements this interface — no
 * business logic (checkout/settlement/webhook processing) ever imports a
 * concrete provider class directly, only this contract plus the
 * `getPaymentProvider()` factory. Nothing in this file ever reads a secret
 * — implementations own their own credential handling.
 */

export interface CreateOrderParams {
  amountPaise: number;
  currency: string;
  /** Must be unique per provider order — used as Razorpay's `receipt`. */
  receipt: string;
  /** Non-sensitive, bounded key/value context only — never a secret. */
  notes?: Record<string, string>;
}

export interface ProviderOrder {
  id: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface ProviderPayment {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  status: string;
}

export interface VerifyPaymentSignatureParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface RefundPaymentParams {
  paymentId: string;
  /** Omit for a full refund. */
  amountPaise?: number;
  notes?: Record<string, string>;
}

export interface ProviderRefund {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: string;
}

export interface PaymentProvider {
  readonly name: 'razorpay';
  /** Safe to send to the frontend checkout widget — never the secret. */
  readonly publicKeyId: string;

  createOrder(params: CreateOrderParams): Promise<ProviderOrder>;
  /** Verifies the signature Razorpay's checkout.js callback returns — server-side only, never trusted from the client alone. */
  verifyPaymentSignature(params: VerifyPaymentSignatureParams): boolean;
  /** Verifies a webhook delivery's signature against the RAW request body bytes. */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
  fetchOrder(orderId: string): Promise<ProviderOrder>;
  refundPayment(params: RefundPaymentParams): Promise<ProviderRefund>;
}
