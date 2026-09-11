/**
 * Thin wrapper around Razorpay's official checkout.js widget (PR-BILL-7).
 * Loads the script from Razorpay's CDN exactly once and opens the modal.
 * This file NEVER decides payment success — it only forwards whatever the
 * widget reports to the caller, which MUST always call the server verify
 * endpoint before treating anything as paid.
 */

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loadPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if ((window as any).Razorpay) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load the payment checkout script. Please check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface OpenCheckoutOptions {
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  currency: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string };
}

export type CheckoutOutcome =
  | { status: 'success'; payment: RazorpaySuccessResponse }
  | { status: 'dismissed' };

/**
 * Opens the Razorpay checkout modal. Resolves with `{status:'dismissed'}`
 * if the user closes it without paying — that is NOT a payment failure,
 * just an unknown/abandoned attempt, so callers must never treat it as
 * "payment failed". A real failure only ever comes from the server
 * (verify endpoint / webhook), never from the browser widget alone.
 */
export async function openRazorpayCheckout(options: OpenCheckoutOptions): Promise<CheckoutOutcome> {
  await loadRazorpayScript();

  return new Promise((resolve, reject) => {
    const RazorpayCtor = (window as any).Razorpay;
    if (!RazorpayCtor) {
      reject(new Error('Payment checkout is unavailable right now. Please try again shortly.'));
      return;
    }

    const instance = new RazorpayCtor({
      key: options.keyId,
      order_id: options.providerOrderId,
      amount: options.amountPaise,
      currency: options.currency,
      name: options.name || 'EnterSkill',
      description: options.description,
      prefill: options.prefill,
      handler: (response: RazorpaySuccessResponse) => {
        resolve({ status: 'success', payment: response });
      },
      modal: {
        ondismiss: () => resolve({ status: 'dismissed' }),
      },
    });

    instance.open();
  });
}
