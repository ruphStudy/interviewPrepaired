/**
 * Organization (B2B) Billing API Service (PR-B2B-BILL)
 *
 * Handles all API calls to the backend organization-scoped billing
 * endpoints (institute prepaid-credit checkout, company subscription
 * checkout, billing profile, subscription status, order history/receipts,
 * plan catalog). Mirrors billingApi.ts's conventions exactly (auth-token
 * interceptor, per-method try/catch, preserves the structured `code` field
 * a billing error response may carry). Payment verification itself reuses
 * the EXISTING `billingApi.verifyPayment` endpoint — there is only one
 * verify/webhook path in this codebase, for both B2C and organization
 * purchases.
 */

import axios, { AxiosInstance } from 'axios';
import { attachAuthExpiryHandler } from '../utils/authExpiry';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

export interface OrgBillingPlan {
  code: string;
  organizationType: 'institute' | 'company';
  name: string;
  description?: string;
  billingModel: 'prepaid_credits' | 'monthly_subscription' | 'annual_contract' | 'custom';
  priceInrPaise: number | null;
  interviewCredits?: number | null;
  candidateLimit?: number | null;
  jobLimit?: number | null;
  memberLimit?: number | null;
  features: string[];
  active: boolean;
  customPrice: boolean;
  sortOrder: number;
}

export interface OrgCheckoutPayload {
  paymentOrderId: string;
  providerOrderId?: string;
  amountPaise: number;
  currency: string;
  purchaseType: 'organization_credit_pack' | 'organization_subscription';
  organizationId: string;
  planCode?: string;
  keyId: string;
}

export interface OrgBillingProfile {
  organizationId: string;
  billingType?: string;
  billingEmail?: string;
  legalName?: string;
  billingAddress?: string;
  taxId?: string;
  gstin?: string;
  currency: string;
  status: string;
}

export interface OrgSubscription {
  planCode: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  source: string;
  pendingNextPlanCode?: string;
}

export interface OrgEntitlements {
  billingType: string;
  subscriptionStatus?: string;
  planCode?: string;
  features: string[];
  limits: { candidateLimit?: number | null; jobLimit?: number | null; memberLimit?: number | null };
  legacyGrandfathered: boolean;
}

export interface OrgContract {
  contractCode: string;
  status: string;
  startDate: string;
  endDate?: string;
  billingModel: string;
  planCode?: string;
  creditAllowance?: number;
  renewalTerms?: string;
}

export interface OrgSubscriptionStatusResponse {
  subscription: OrgSubscription | null;
  entitlements: OrgEntitlements;
  contract: OrgContract | null;
}

export type OrgPaymentOrderStatus =
  | 'created'
  | 'provider_created'
  | 'payment_pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'partially_refunded';

export interface OrgPaymentOrder {
  id: string;
  organizationId: string;
  purchaseType: string;
  planCode?: string;
  amountPaise: number;
  currency: string;
  status: OrgPaymentOrderStatus;
  receiptReference: string;
  providerPaymentId?: string;
  failureCode?: string;
  failureMessage?: string;
  paidAt?: string;
  cancelledAt?: string;
  refundedAt?: string;
  createdAt: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

class OrganizationBillingApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT,
    });
    attachAuthExpiryHandler(this.api);

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

  async getPlans(organizationId: string): Promise<ApiEnvelope<{ plans: OrgBillingPlan[] }>> {
    const response = await this.api.get<ApiEnvelope<{ plans: OrgBillingPlan[] }>>(`/organizations/${organizationId}/billing/plans`);
    return response.data;
  }

  async getBillingProfile(organizationId: string): Promise<ApiEnvelope<OrgBillingProfile>> {
    const response = await this.api.get<ApiEnvelope<OrgBillingProfile>>(`/organizations/${organizationId}/billing/profile`);
    return response.data;
  }

  async updateBillingProfile(
    organizationId: string,
    payload: { billingEmail?: string; legalName?: string; billingAddress?: string; taxId?: string; gstin?: string }
  ): Promise<ApiEnvelope<OrgBillingProfile>> {
    const response = await this.api.patch<ApiEnvelope<OrgBillingProfile>>(`/organizations/${organizationId}/billing/profile`, payload);
    return response.data;
  }

  async checkoutCredits(organizationId: string, planCode: string, idempotencyKey: string): Promise<ApiEnvelope<OrgCheckoutPayload>> {
    const response = await this.api.post<ApiEnvelope<OrgCheckoutPayload>>(`/organizations/${organizationId}/billing/checkout/credits`, {
      planCode,
      idempotencyKey,
    });
    return response.data;
  }

  async checkoutSubscription(organizationId: string, planCode: string, idempotencyKey: string): Promise<ApiEnvelope<OrgCheckoutPayload>> {
    const response = await this.api.post<ApiEnvelope<OrgCheckoutPayload>>(
      `/organizations/${organizationId}/billing/checkout/subscription`,
      { planCode, idempotencyKey }
    );
    return response.data;
  }

  async getSubscriptionStatus(organizationId: string): Promise<ApiEnvelope<OrgSubscriptionStatusResponse>> {
    const response = await this.api.get<ApiEnvelope<OrgSubscriptionStatusResponse>>(`/organizations/${organizationId}/billing/subscription`);
    return response.data;
  }

  async scheduleDowngrade(organizationId: string, planCode: string): Promise<ApiEnvelope<unknown>> {
    const response = await this.api.post<ApiEnvelope<unknown>>(`/organizations/${organizationId}/billing/subscription/downgrade`, {
      planCode,
    });
    return response.data;
  }

  async cancelScheduledDowngrade(organizationId: string): Promise<ApiEnvelope<unknown>> {
    const response = await this.api.post<ApiEnvelope<unknown>>(`/organizations/${organizationId}/billing/subscription/downgrade/cancel`);
    return response.data;
  }

  async cancelSubscription(organizationId: string, cancelAtPeriodEnd: boolean): Promise<ApiEnvelope<unknown>> {
    const response = await this.api.post<ApiEnvelope<unknown>>(`/organizations/${organizationId}/billing/subscription/cancel`, {
      cancelAtPeriodEnd,
    });
    return response.data;
  }

  async getActiveContract(organizationId: string): Promise<ApiEnvelope<OrgContract | null>> {
    const response = await this.api.get<ApiEnvelope<OrgContract | null>>(`/organizations/${organizationId}/billing/contract`);
    return response.data;
  }

  async listOrders(
    organizationId: string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ApiEnvelope<{ orders: OrgPaymentOrder[]; page: number; limit: number; total: number }>> {
    const response = await this.api.get<ApiEnvelope<{ orders: OrgPaymentOrder[]; page: number; limit: number; total: number }>>(
      `/organizations/${organizationId}/billing/orders`,
      { params }
    );
    return response.data;
  }

  async getOrder(organizationId: string, orderId: string): Promise<ApiEnvelope<OrgPaymentOrder>> {
    const response = await this.api.get<ApiEnvelope<OrgPaymentOrder>>(`/organizations/${organizationId}/billing/orders/${orderId}`);
    return response.data;
  }

  async getReceipt(organizationId: string, orderId: string): Promise<ApiEnvelope<Record<string, unknown>>> {
    const response = await this.api.get<ApiEnvelope<Record<string, unknown>>>(
      `/organizations/${organizationId}/billing/orders/${orderId}/receipt`
    );
    return response.data;
  }
}

export const organizationBillingApi = new OrganizationBillingApiService();
export default organizationBillingApi;
