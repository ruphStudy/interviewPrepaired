import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder, PaymentOrderStatus, PaymentPurchaseType } from '../models/PaymentOrder.model';
import { userSubscriptionService } from './UserSubscriptionService';
import { interviewCreditService } from './InterviewCreditService';
import { creditPackService } from './CreditPackService';
import { organizationInterviewCreditService } from './OrganizationInterviewCreditService';
import { organizationSubscriptionService } from './OrganizationSubscriptionService';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

const SETTLEABLE_STATUSES: PaymentOrderStatus[] = ['created', 'provider_created', 'payment_pending'];

export interface SettlementReference {
  providerPaymentId: string;
  source: 'verify' | 'webhook';
}

export interface SettlementResult {
  paymentOrderId: string;
  purchaseType: PaymentPurchaseType;
  status: PaymentOrderStatus;
  planCode?: string;
  creditPackCode?: string;
  organizationId?: string;
  plan?: { code: string; name: string };
  subscription?: { status: string; currentPeriodEnd?: Date };
  credits: { balance: number };
}

/**
 * THE single business-level path that turns a verified payment into
 * subscription entitlement or purchased credits (PR-BILL-3/4/5). Called
 * from BOTH the frontend verify endpoint and webhook processing — never
 * duplicated between the two. Idempotent and concurrency-safe: the atomic
 * `findOneAndUpdate` CAS below ensures that if a verify call and a webhook
 * delivery race for the SAME order, only one of them ever performs the
 * entitlement grant; the loser sees the order already 'paid' and returns
 * the same cached result without granting anything twice.
 */
class BillingSettlementService {
  async settleSuccessfulPayment(paymentOrderId: string, reference: SettlementReference): Promise<SettlementResult> {
    const claimed = await PaymentOrder.findOneAndUpdate(
      { _id: paymentOrderId, status: { $in: SETTLEABLE_STATUSES } },
      { $set: { status: 'paid', providerPaymentId: reference.providerPaymentId, paidAt: new Date() } },
      { new: true }
    );

    if (claimed) {
      // We won the settlement race — perform the one-time entitlement grant.
      try {
        await this.grantEntitlement(claimed);
      } catch (error) {
        // The order stays 'paid' (payment WAS captured) — a grant failure
        // here is a reconciliation case, not a reason to imply the payment
        // itself failed. Logged loudly for admin follow-up.
        console.error('[BillingSettlementService] Entitlement grant failed after payment capture — needs manual reconciliation', {
          paymentOrderId,
          error,
        });
      }
      return this.buildResult(claimed);
    }

    const order = await PaymentOrder.findById(paymentOrderId);
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }
    if (order.status === 'paid') {
      // Idempotent replay (duplicate callback, or callback+webhook race
      // where this call lost) — return the same result, never re-grant.
      return this.buildResult(order);
    }
    throw new ApiError(
      400,
      `Payment order cannot be settled from status "${order.status}"`,
      undefined,
      BillingErrorCode.PAYMENT_VERIFICATION_FAILED
    );
  }

  private async grantEntitlement(order: IPaymentOrder): Promise<void> {
    const buyerType = order.buyerType ?? 'user';

    if (buyerType === 'user') {
      await this.grantUserEntitlement(order);
      return;
    }

    if (buyerType === 'organization') {
      await this.grantOrganizationEntitlement(order);
      return;
    }

    // Fail closed — an unrecognized buyerType must never silently grant
    // anything, and must never fall through to either entitlement path.
    throw new ApiError(500, `Unknown purchase type (buyerType="${buyerType}")`);
  }

  private async grantUserEntitlement(order: IPaymentOrder): Promise<void> {
    const userId = order.userId.toString();
    const orderId = (order._id as Types.ObjectId).toString();

    if (order.purchaseType === 'subscription') {
      if (!order.planCode) {
        throw new ApiError(500, 'Payment order is missing a plan code');
      }
      await userSubscriptionService.changePlan(userId, order.planCode, 'payment', 'upgrade', order.providerPaymentId);
      return;
    }

    if (order.purchaseType !== 'credit_pack') {
      throw new ApiError(500, `Unknown purchase type for a user order: ${order.purchaseType}`);
    }

    if (!order.creditPackCode) {
      throw new ApiError(500, 'Payment order is missing a credit pack code');
    }
    const pack = await creditPackService.getPackByCode(order.creditPackCode);
    if (!pack) {
      throw new ApiError(500, 'Credit pack not found for payment order');
    }
    await interviewCreditService.addCredits({
      userId,
      amount: pack.credits,
      type: 'PACK_GRANT',
      referenceType: 'pack',
      referenceId: orderId,
      // Tied to the payment order id, not the payment id — stable even if a
      // provider retried payment IDs internally; there is exactly one
      // PaymentOrder per checkout attempt.
      idempotencyKey: `pack-grant:${orderId}`,
      description: `${pack.credits} interview credit(s) — ${pack.name}`,
    });
  }

  private async grantOrganizationEntitlement(order: IPaymentOrder): Promise<void> {
    const orderId = (order._id as Types.ObjectId).toString();
    if (!order.organizationId) {
      throw new ApiError(500, 'Organization payment order is missing an organizationId');
    }
    const organizationId = order.organizationId.toString();

    if (order.purchaseType === 'organization_credit_pack') {
      const creditsGranted = order.metadata?.creditsGranted;
      if (typeof creditsGranted !== 'number' || !Number.isInteger(creditsGranted) || creditsGranted <= 0) {
        throw new ApiError(500, 'Organization payment order is missing a valid creditsGranted amount');
      }
      await organizationInterviewCreditService.grantCredits({
        organizationId,
        amount: creditsGranted,
        referenceType: 'payment',
        referenceId: orderId,
        // Tied to the payment order id — exactly one PaymentOrder per
        // checkout attempt, so this can never double-grant on retry/replay.
        idempotencyKey: `org-credit-grant:${orderId}`,
        description: `${creditsGranted} interview credit(s) — plan ${order.planCode}`,
      });
      return;
    }

    if (order.purchaseType === 'organization_subscription') {
      if (!order.planCode) {
        throw new ApiError(500, 'Organization payment order is missing a plan code');
      }
      await organizationSubscriptionService.activateFromPayment(organizationId, order.planCode, order.providerPaymentId);
      return;
    }

    throw new ApiError(500, `Unknown purchase type for an organization order: ${order.purchaseType}`);
  }

  private async buildResult(order: IPaymentOrder): Promise<SettlementResult> {
    const buyerType = order.buyerType ?? 'user';

    if (buyerType === 'organization') {
      return this.buildOrganizationResult(order);
    }

    return this.buildUserResult(order);
  }

  private async buildUserResult(order: IPaymentOrder): Promise<SettlementResult> {
    const userId = order.userId.toString();

    if (order.purchaseType === 'subscription') {
      const { plan, subscription } = await userSubscriptionService.getSubscriptionDetails(userId);
      const balance = await interviewCreditService.getBalance(userId);
      return {
        paymentOrderId: (order._id as Types.ObjectId).toString(),
        purchaseType: order.purchaseType,
        status: order.status,
        planCode: order.planCode,
        plan: { code: plan.code, name: plan.name },
        subscription: { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd },
        credits: { balance },
      };
    }

    const balance = await interviewCreditService.getBalance(userId);
    return {
      paymentOrderId: (order._id as Types.ObjectId).toString(),
      purchaseType: order.purchaseType,
      status: order.status,
      creditPackCode: order.creditPackCode,
      credits: { balance },
    };
  }

  private async buildOrganizationResult(order: IPaymentOrder): Promise<SettlementResult> {
    const organizationId = order.organizationId ? order.organizationId.toString() : undefined;
    const balance = organizationId ? await organizationInterviewCreditService.getBalance(organizationId) : 0;

    if (order.purchaseType === 'organization_subscription' && organizationId) {
      const subscription = await organizationSubscriptionService.getCurrentSubscription(organizationId);
      return {
        paymentOrderId: (order._id as Types.ObjectId).toString(),
        purchaseType: order.purchaseType,
        status: order.status,
        planCode: order.planCode,
        organizationId,
        subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd } : undefined,
        credits: { balance },
      };
    }

    return {
      paymentOrderId: (order._id as Types.ObjectId).toString(),
      purchaseType: order.purchaseType,
      status: order.status,
      planCode: order.planCode,
      organizationId,
      credits: { balance },
    };
  }
}

export const billingSettlementService = new BillingSettlementService();
