import { PaymentOrder } from '../models/PaymentOrder.model';
import { getPaymentProvider } from '../payments';
import { billingSettlementService, SettlementResult } from './BillingSettlementService';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

export interface VerifyPaymentInput {
  paymentOrderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

/**
 * Frontend checkout-callback verification (PR-BILL-3). This endpoint's
 * input is NEVER trusted by itself — every field is cross-checked against
 * the server-owned PaymentOrder and, for amount/currency/capture status,
 * against a direct provider fetch. Only after all of that succeeds does it
 * hand off to BillingSettlementService — the same central path a webhook
 * delivery uses — so a duplicate call or a call racing a webhook never
 * grants entitlement twice.
 */
class BillingVerificationService {
  async verifyPayment(userId: string, input: VerifyPaymentInput): Promise<SettlementResult> {
    const order = await PaymentOrder.findOne({ _id: input.paymentOrderId, userId });
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }

    if (!order.providerOrderId || order.providerOrderId !== input.razorpayOrderId) {
      throw new ApiError(400, 'Payment order does not match', undefined, BillingErrorCode.PAYMENT_ORDER_MISMATCH);
    }

    if (order.status === 'paid') {
      // Idempotent replay of an already-settled payment — never re-verify/re-grant.
      return billingSettlementService.settleSuccessfulPayment(input.paymentOrderId, {
        providerPaymentId: order.providerPaymentId || input.razorpayPaymentId,
        source: 'verify',
      });
    }
    if (order.status === 'refunded' || order.status === 'partially_refunded') {
      throw new ApiError(400, 'This payment has already been refunded', undefined, BillingErrorCode.PAYMENT_ALREADY_SETTLED);
    }

    const provider = getPaymentProvider();
    if (!provider) {
      throw new ApiError(503, 'Payment provider is not configured', undefined, BillingErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }

    const signatureValid = provider.verifyPaymentSignature({
      orderId: input.razorpayOrderId,
      paymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!signatureValid) {
      order.status = 'failed';
      order.failureCode = 'SIGNATURE_INVALID';
      order.failureMessage = 'Payment signature verification failed';
      await order.save();
      throw new ApiError(400, 'Payment verification failed', undefined, BillingErrorCode.PAYMENT_SIGNATURE_INVALID);
    }

    // Never trust the client-declared amount/currency — confirm directly
    // against the provider's own record of the payment.
    const providerPayment = await provider.fetchPayment(input.razorpayPaymentId);
    if (providerPayment.orderId !== order.providerOrderId) {
      throw new ApiError(400, 'Payment order does not match', undefined, BillingErrorCode.PAYMENT_ORDER_MISMATCH);
    }
    if (providerPayment.amountPaise !== order.amountPaise || providerPayment.currency !== order.currency) {
      order.status = 'failed';
      order.failureCode = 'AMOUNT_MISMATCH';
      order.failureMessage = 'Payment amount or currency did not match the order';
      await order.save();
      throw new ApiError(400, 'Payment verification failed', undefined, BillingErrorCode.PAYMENT_VERIFICATION_FAILED);
    }
    if (!['captured', 'authorized'].includes(providerPayment.status)) {
      order.status = 'failed';
      order.failureCode = providerPayment.status;
      order.failureMessage = 'Payment was not completed';
      await order.save();
      throw new ApiError(400, 'Payment was not completed', undefined, BillingErrorCode.PAYMENT_FAILED);
    }

    return billingSettlementService.settleSuccessfulPayment(input.paymentOrderId, {
      providerPaymentId: providerPayment.id,
      source: 'verify',
    });
  }
}

export const billingVerificationService = new BillingVerificationService();
