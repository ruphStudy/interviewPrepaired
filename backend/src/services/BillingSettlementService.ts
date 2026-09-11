import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder, PaymentOrderStatus } from '../models/PaymentOrder.model';
import { userSubscriptionService } from './UserSubscriptionService';
import { interviewCreditService } from './InterviewCreditService';
import { creditPackService } from './CreditPackService';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

const SETTLEABLE_STATUSES: PaymentOrderStatus[] = ['created', 'provider_created', 'payment_pending'];

export interface SettlementReference {
  providerPaymentId: string;
  source: 'verify' | 'webhook';
}

export interface SettlementResult {
  paymentOrderId: string;
  purchaseType: 'subscription' | 'credit_pack';
  status: PaymentOrderStatus;
  planCode?: string;
  creditPackCode?: string;
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
    const userId = order.userId.toString();
    const orderId = (order._id as Types.ObjectId).toString();

    if (order.purchaseType === 'subscription') {
      if (!order.planCode) {
        throw new ApiError(500, 'Payment order is missing a plan code');
      }
      await userSubscriptionService.changePlan(userId, order.planCode, 'payment', 'upgrade', order.providerPaymentId);
      return;
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

  private async buildResult(order: IPaymentOrder): Promise<SettlementResult> {
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
}

export const billingSettlementService = new BillingSettlementService();
