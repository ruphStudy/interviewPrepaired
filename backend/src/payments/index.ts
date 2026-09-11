import { env } from '../config/environment';
import { PaymentProvider } from './PaymentProvider';
import { RazorpayPaymentProvider } from './RazorpayPaymentProvider';

export * from './PaymentProvider';

let cachedProvider: PaymentProvider | null | undefined;

/**
 * Single factory for the active payment provider. Returns `null` — never
 * throws, never a fake/mock success path — when required Razorpay
 * configuration is missing, so every caller can uniformly surface
 * PAYMENT_PROVIDER_UNAVAILABLE instead of crashing or silently proceeding.
 * Cached after first successful construction (config is static for the life
 * of the process).
 */
export function getPaymentProvider(): PaymentProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  if (env.paymentProvider !== 'razorpay' || !env.razorpayKeyId || !env.razorpayKeySecret || !env.razorpayWebhookSecret) {
    cachedProvider = null;
    return cachedProvider;
  }

  cachedProvider = new RazorpayPaymentProvider({
    keyId: env.razorpayKeyId,
    keySecret: env.razorpayKeySecret,
    webhookSecret: env.razorpayWebhookSecret,
  });
  return cachedProvider;
}
