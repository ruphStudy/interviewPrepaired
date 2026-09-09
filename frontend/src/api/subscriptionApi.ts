/**
 * Subscription API Service
 *
 * Handles all API calls to the backend B2C subscription/credit endpoints.
 * Mirrors interviewApi.ts's conventions exactly (auth-token interceptor,
 * per-method try/catch with a fallback message).
 */

import axios, { AxiosInstance } from 'axios';
import { API_BASE_URL, API_TIMEOUT } from '../config/api.config';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface SubscriptionPlan {
  code: string;
  name: string;
  description: string;
  priceInrPaise: number;
  priceInr: number;
  billingInterval: 'month' | 'none';
  includedInterviews: number;
  features: string[];
}

export interface GetPlansResponse {
  success: boolean;
  message: string;
  data: SubscriptionPlan[];
}

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial' | 'past_due';
export type SubscriptionSource = 'system' | 'admin' | 'payment';

export interface CurrentSubscription {
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd?: string;
  startedAt: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string;
  autoRenew: boolean;
  source: SubscriptionSource;
}

export interface GetMySubscriptionResponse {
  success: boolean;
  message: string;
  data: {
    plan: SubscriptionPlan;
    subscription: CurrentSubscription;
    credits: {
      balance: number;
    };
  };
}

export interface SubscriptionActionResult {
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  currentPeriodEnd?: string;
  cancelledAt?: string;
}

export interface SubscriptionActionResponse {
  success: boolean;
  message: string;
  data?: SubscriptionActionResult;
}

export type CreditTransactionType = 'PLAN_GRANT' | 'PACK_GRANT' | 'CONSUME' | 'REFUND' | 'ADMIN_ADJUSTMENT' | 'EXPIRE';

export interface CreditTransaction {
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export interface GetMyCreditsResponse {
  success: boolean;
  message: string;
  data: {
    balance: number;
    recentTransactions: CreditTransaction[];
  };
}

export interface GetCreditHistoryResponse {
  success: boolean;
  message: string;
  data: {
    transactions: CreditTransaction[];
    page: number;
    limit: number;
    total: number;
  };
}

// ============================================================================
// API Configuration
// ============================================================================

class SubscriptionApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT,
    });

    // Add auth token to requests
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Handle response errors
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.message || 'An error occurred';
          throw new Error(message);
        } else if (error.request) {
          throw new Error('No response from server. Please check your connection.');
        } else {
          throw new Error(error.message || 'Failed to make request');
        }
      }
    );
  }

  /**
   * Public plan catalog — no auth required by the backend, but sent with
   * whatever token is present (harmless either way).
   */
  async getPlans(): Promise<GetPlansResponse> {
    try {
      const response = await this.api.get<GetPlansResponse>('/subscription/plans');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load subscription plans');
    }
  }

  /**
   * The caller's current plan + subscription state
   */
  async getMySubscription(): Promise<GetMySubscriptionResponse> {
    try {
      const response = await this.api.get<GetMySubscriptionResponse>('/subscription/me');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load your subscription');
    }
  }

  /**
   * Current credit balance + a short recent-transactions preview
   */
  async getMyCredits(): Promise<GetMyCreditsResponse> {
    try {
      const response = await this.api.get<GetMyCreditsResponse>('/subscription/credits');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load your credit balance');
    }
  }

  /**
   * Full paginated credit ledger history
   */
  async getCreditHistory(params: { page?: number; limit?: number } = {}): Promise<GetCreditHistoryResponse> {
    try {
      const response = await this.api.get<GetCreditHistoryResponse>('/subscription/credits/history', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to load credit history');
    }
  }

  /**
   * Schedules cancellation for the end of the current billing period —
   * the subscription stays active until then. Authenticated user only.
   */
  async cancelAtPeriodEnd(): Promise<SubscriptionActionResponse> {
    try {
      const response = await this.api.post<SubscriptionActionResponse>('/subscription/me/cancel-at-period-end');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to schedule cancellation');
    }
  }

  /**
   * Resumes renewal on a subscription previously scheduled to cancel at
   * period end. Authenticated user only.
   */
  async resumeRenewal(): Promise<SubscriptionActionResponse> {
    try {
      const response = await this.api.post<SubscriptionActionResponse>('/subscription/me/resume-renewal');
      return response.data;
    } catch (error: any) {
      throw new Error(error.message || 'Failed to resume renewal');
    }
  }
}

// ============================================================================
// Export Singleton Instance
// ============================================================================

export const subscriptionApi = new SubscriptionApiService();
export default subscriptionApi;
