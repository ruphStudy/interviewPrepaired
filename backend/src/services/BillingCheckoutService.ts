import crypto from 'crypto';
import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder, PaymentOrderStatus } from '../models/PaymentOrder.model';
import { subscriptionPlanService } from './SubscriptionPlanService';
import { userSubscriptionService } from './UserSubscriptionService';
import { creditPackService } from './CreditPackService';
import { getPaymentProvider } from '../payments';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

const USABLE_STATUSES: PaymentOrderStatus[] = ['created', 'provider_created', 'payment_pending'];
const RETRYABLE_STATUSES: PaymentOrderStatus[] = ['failed', 'cancelled', 'expired'];

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

interface CreateOrderInput {
  userId: string;
  purchaseType: 'subscription' | 'credit_pack';
  planId?: Types.ObjectId;
  planCode?: string;
  creditPackId?: Types.ObjectId;
  creditPackCode?: string;
  amountPaise: number;
  idempotencyKey: string;
}

/**
 * Authenticated B2C checkout / order creation (PR-BILL-2). The ONLY place
 * amount/currency/plan/pack are resolved — always server-side, from the
 * caller's plan/pack CODE only. Never accepts amount, currency, userId, or
 * included-credits from the client. Creates the local PaymentOrder BEFORE
 * calling the payment provider, so a provider outage never loses the
 * user's purchase intent.
 */
class BillingCheckoutService {
  async createSubscriptionCheckout(userId: string, planCode: string, idempotencyKey: string): Promise<CheckoutPayload> {
    const plan = await subscriptionPlanService.getPlanByCode(planCode);
    if (!plan || !plan.isActive) {
      throw new ApiError(400, `Plan "${planCode}" is not available`, undefined, BillingErrorCode.INVALID_PLAN);
    }
    if (plan.isDefault || plan.priceInrPaise <= 0) {
      throw new ApiError(400, 'The Free plan cannot be purchased', undefined, BillingErrorCode.INVALID_PLAN);
    }

    const current = await userSubscriptionService.getCurrentSubscription(userId);
    if (current && current.planCode === plan.code && current.status === 'active' && !current.cancelAtPeriodEnd) {
      throw new ApiError(400, 'You already have this plan active', undefined, BillingErrorCode.SUBSCRIPTION_ALREADY_ACTIVE);
    }

    return this.createOrder({
      userId,
      purchaseType: 'subscription',
      planId: plan._id as Types.ObjectId,
      planCode: plan.code,
      amountPaise: plan.priceInrPaise,
      idempotencyKey,
    });
  }

  async createCreditPackCheckout(userId: string, creditPackCode: string, idempotencyKey: string): Promise<CheckoutPayload> {
    const pack = await creditPackService.getPackByCode(creditPackCode);
    if (!pack || !pack.active) {
      throw new ApiError(400, `Credit pack "${creditPackCode}" is not available`, undefined, BillingErrorCode.INVALID_CREDIT_PACK);
    }

    return this.createOrder({
      userId,
      purchaseType: 'credit_pack',
      creditPackId: pack._id as Types.ObjectId,
      creditPackCode: pack.code,
      amountPaise: pack.priceInrPaise,
      idempotencyKey,
    });
  }

  private async createOrder(input: CreateOrderInput): Promise<CheckoutPayload> {
    const existing = await PaymentOrder.findOne({ userId: input.userId, idempotencyKey: input.idempotencyKey });
    if (existing) {
      return this.resolveExisting(existing, input);
    }

    const receiptReference = `rcpt_${crypto.randomBytes(10).toString('hex')}`;

    let order: IPaymentOrder;
    try {
      order = await PaymentOrder.create({
        userId: input.userId,
        purchaseType: input.purchaseType,
        planId: input.planId,
        planCode: input.planCode,
        creditPackId: input.creditPackId,
        creditPackCode: input.creditPackCode,
        amountPaise: input.amountPaise,
        currency: 'INR',
        provider: 'razorpay',
        status: 'created',
        idempotencyKey: input.idempotencyKey,
        receiptReference,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Race: a concurrent request with the same key won — treat it the
        // same way we treat an already-existing order.
        const winner = await PaymentOrder.findOne({ userId: input.userId, idempotencyKey: input.idempotencyKey });
        if (winner) {
          return this.resolveExisting(winner, input);
        }
      }
      throw error;
    }

    return this.ensureProviderOrder(order);
  }

  /** Same key + same product => return the existing usable order (or a fresh retry if it previously failed). Same key + different product => 409 conflict. */
  private async resolveExisting(existing: IPaymentOrder, input: CreateOrderInput): Promise<CheckoutPayload> {
    const sameProduct =
      existing.purchaseType === input.purchaseType &&
      existing.planCode === input.planCode &&
      existing.creditPackCode === input.creditPackCode &&
      existing.amountPaise === input.amountPaise;

    if (!sameProduct) {
      throw new ApiError(
        409,
        'This idempotency key was already used for a different purchase',
        undefined,
        BillingErrorCode.IDEMPOTENCY_KEY_CONFLICT
      );
    }

    if (existing.status === 'paid') {
      throw new ApiError(400, 'This purchase has already been completed', undefined, BillingErrorCode.PAYMENT_ALREADY_SETTLED);
    }

    if (RETRYABLE_STATUSES.includes(existing.status)) {
      // Genuine retry of the same deliberate purchase attempt — reset for a
      // fresh provider order rather than dead-ending the user. Razorpay
      // requires `receipt` to be unique per order, so a retry must mint a
      // new one rather than reusing the failed attempt's receipt.
      existing.status = 'created';
      existing.providerOrderId = undefined;
      existing.providerPaymentId = undefined;
      existing.failureCode = undefined;
      existing.failureMessage = undefined;
      existing.receiptReference = `rcpt_${crypto.randomBytes(10).toString('hex')}`;
      await existing.save();
    }

    return this.ensureProviderOrder(existing);
  }

  private async ensureProviderOrder(order: IPaymentOrder): Promise<CheckoutPayload> {
    if (order.providerOrderId && USABLE_STATUSES.includes(order.status)) {
      return this.toCheckoutPayload(order);
    }

    const provider = getPaymentProvider();
    if (!provider) {
      throw new ApiError(503, 'Payment provider is not configured', undefined, BillingErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }

    const providerOrder = await provider.createOrder({
      amountPaise: order.amountPaise,
      currency: order.currency,
      receipt: order.receiptReference,
      notes: {
        paymentOrderId: (order._id as Types.ObjectId).toString(),
        purchaseType: order.purchaseType,
      },
    });

    order.providerOrderId = providerOrder.id;
    order.status = 'provider_created';
    await order.save();

    return this.toCheckoutPayload(order);
  }

  private toCheckoutPayload(order: IPaymentOrder): CheckoutPayload {
    const provider = getPaymentProvider();
    return {
      paymentOrderId: (order._id as Types.ObjectId).toString(),
      providerOrderId: order.providerOrderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      purchaseType: order.purchaseType,
      planCode: order.planCode,
      creditPackCode: order.creditPackCode,
      keyId: provider?.publicKeyId ?? '',
    };
  }
}

export const billingCheckoutService = new BillingCheckoutService();
