/**
 * Billing API Service (PR-BILL)
 *
 * Handles all API calls to the backend B2C checkout/payment-verification/
 * billing-history endpoints. Mirrors subscriptionApi.ts's conventions
 * exactly (auth-token interceptor, per-method try/catch with a fallback
 * message) — the interceptor here additionally preserves the structured
 * `code` field a billing error response may carry, since the UI needs it
 * to distinguish e.g. PAYMENT_PROVIDER_UNAVAILABLE from a generic failure.
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface CreditPack {
  code: string;
  name: string;
  description?: string;
  credits: number;
  priceInrPaise: number;
  priceInr: number;
}

export interface GetCreditPacksResponse {
  success: boolean;
  message: string;
  data: CreditPack[];
}

export interface CheckoutPayload {
  paymentOrderId: string;
  providerOrderId?: string;
  amountPaise: number;
  currency: string;
  purchaseType: 'subscription' | 'credit_pack';
  planCode?: string;
  creditPackCode?: string;
  keyId: string;
}

export interface CheckoutResponse {
  success: boolean;
  message: string;
  data: CheckoutPayload;
}

export interface SettlementResult {
  paymentOrderId: string;
  purchaseType: 'subscription' | 'credit_pack';
  status: string;
  planCode?: string;
  creditPackCode?: string;
  plan?: { code: string; name: string };
  subscription?: { status: string; currentPeriodEnd?: string };
  credits: { balance: number };
}

export interface VerifyPaymentResponse {
  success: boolean;
  message: string;
  data: SettlementResult;
}

export type PaymentOrderStatus =
  | 'created'
  | 'provider_created'
  | 'payment_pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentOrder {
  id: string;
  purchaseType: 'subscription' | 'credit_pack';
  planCode?: string;
  creditPackCode?: string;
  amountPaise: number;
  currency: string;
  status: PaymentOrderStatus;
  receiptReference: string;
  providerPaymentId?: string;
  failureCode?: string;
  failureMessage?: string;
  paidAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
  createdAt: string;
}

export interface ListOrdersResponse {
  success: boolean;
  message: string;
  data: {
    orders: PaymentOrder[];
    page: number;
    limit: number;
    total: number;
  };
}

export interface GetOrderResponse {
  success: boolean;
  message: string;
  data: PaymentOrder;
}

export interface Receipt {
  documentLabel: string;
  gstConfigured: boolean;
  merchant: { name: string };
  receiptNumber: string;
  paymentDate?: string;
  customer: { name?: string; email?: string };
  purchase: { type: 'subscription' | 'credit_pack'; planCode?: string; creditPackCode?: string };
  amountPaise: number;
  currency: string;
  paymentReference?: string;
  paymentStatus: string;
}

export interface GetReceiptResponse {
  success: boolean;
  message: string;
  data: Receipt;
}

export interface DowngradeActionResult {
  status: string;
  planCode: string;
  pendingPlanCode?: string;
  pendingPlanEffectiveAt?: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
}

export interface DowngradeActionResponse {
  success: boolean;
  message: string;
  data?: DowngradeActionResult;
}

// ============================================================================
// API Configuration
// ============================================================================

class BillingApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.message || 'An error occurred';
          const err = new Error(message) as Error & { code?: string; statusCode?: number };
          if (error.response.data?.code) err.code = error.response.data.code;
          err.statusCode = error.response.status;
          throw err;
        } else if (error.request) {
          throw new Error('No response from server. Please check your connection.');
        } else {
          throw new Error(error.message || 'Failed to make request');
        }
      }
    );
  }

  async getCreditPacks(): Promise<GetCreditPacksResponse> {
    try {
      const response = await this.api.get<GetCreditPacksResponse>('/billing/credit-packs');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load credit packs');
    }
  }

  async checkoutSubscription(planCode: string, idempotencyKey: string): Promise<CheckoutResponse> {
    try {
      const response = await this.api.post<CheckoutResponse>('/billing/checkout/subscription', { planCode, idempotencyKey });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async checkoutCreditPack(creditPackCode: string, idempotencyKey: string): Promise<CheckoutResponse> {
    try {
      const response = await this.api.post<CheckoutResponse>('/billing/checkout/credit-pack', {
        creditPackCode,
        idempotencyKey,
      });
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async verifyPayment(input: {
    paymentOrderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }): Promise<VerifyPaymentResponse> {
    try {
      const response = await this.api.post<VerifyPaymentResponse>('/billing/payments/verify', input);
      return response.data;
    } catch (error: any) {
      throw error;
    }
  }

  async listOrders(params: { page?: number; limit?: number } = {}): Promise<ListOrdersResponse> {
    try {
      const response = await this.api.get<ListOrdersResponse>('/billing/orders', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load billing history');
    }
  }

  async getOrder(orderId: string): Promise<GetOrderResponse> {
    try {
      const response = await this.api.get<GetOrderResponse>(`/billing/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load payment order');
    }
  }

  async getReceipt(orderId: string): Promise<GetReceiptResponse> {
    try {
      const response = await this.api.get<GetReceiptResponse>(`/billing/orders/${orderId}/receipt`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load receipt');
    }
  }

  async scheduleDowngrade(planCode: string): Promise<DowngradeActionResponse> {
    try {
      const response = await this.api.post<DowngradeActionResponse>('/billing/subscription/downgrade', { planCode });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to schedule downgrade');
    }
  }

  async cancelScheduledDowngrade(): Promise<DowngradeActionResponse> {
    try {
      const response = await this.api.post<DowngradeActionResponse>('/billing/subscription/downgrade/cancel');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to cancel scheduled downgrade');
    }
  }
}

export const billingApi = new BillingApiService();
export default billingApi;
