import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder } from '../models/PaymentOrder.model';
import { User } from '../models/user.model';
import { getPaymentProvider } from '../payments';
import { interviewCreditService } from './InterviewCreditService';
import { creditPackService } from './CreditPackService';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

export interface AdminSafeOrder {
  id: string;
  userId: string;
  userEmail?: string;
  purchaseType: 'subscription' | 'credit_pack';
  planCode?: string;
  creditPackCode?: string;
  amountPaise: number;
  currency: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: Date;
  paidAt?: Date;
  refundedAt?: Date;
  refundedAmountPaise?: number;
}

/**
 * Minimal admin-safe billing visibility + admin-only refund action
 * (PR-BILL-8). Reuses the existing admin RBAC (`authorize('admin')` on
 * `/api/v1/admin`) — no new admin framework. Every mapper is an explicit
 * allow-list; no provider secret/signature/raw webhook payload is ever
 * included.
 */
class BillingAdminService {
  private toAdminSafeOrder(order: IPaymentOrder, userEmail?: string): AdminSafeOrder {
    return {
      id: (order._id as Types.ObjectId).toString(),
      userId: order.userId.toString(),
      userEmail,
      purchaseType: order.purchaseType,
      planCode: order.planCode,
      creditPackCode: order.creditPackCode,
      amountPaise: order.amountPaise,
      currency: order.currency,
      provider: order.provider,
      providerOrderId: order.providerOrderId,
      providerPaymentId: order.providerPaymentId,
      status: order.status,
      failureCode: order.failureCode,
      failureMessage: order.failureMessage,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      refundedAt: order.refundedAt,
      refundedAmountPaise: order.refundedAmountPaise,
    };
  }

  async listOrders(options: {
    userId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ orders: AdminSafeOrder[]; page: number; limit: number; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);
    const filter: Record<string, unknown> = {};
    if (options.userId) filter.userId = options.userId;
    if (options.status) filter.status = options.status;

    const [orders, total] = await Promise.all([
      PaymentOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentOrder.countDocuments(filter),
    ]);

    const userIds = [...new Set(orders.map((o) => o.userId.toString()))];
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('_id email') : [];
    const emailByUserId = new Map(users.map((u) => [u._id.toString(), u.email]));

    return {
      orders: orders.map((o) => this.toAdminSafeOrder(o, emailByUserId.get(o.userId.toString()))),
      page,
      limit,
      total,
    };
  }

  async getOrder(orderId: string): Promise<AdminSafeOrder> {
    const order = await PaymentOrder.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }
    const user = await User.findById(order.userId).select('email');
    return this.toAdminSafeOrder(order, user?.email);
  }

  /**
   * Read-only reconciliation against the provider's own record — NEVER
   * alters local entitlement/status. Surfaces a local-vs-provider
   * inconsistency for a human to act on (e.g. via a separate, explicit
   * admin action), never auto-corrects it.
   */
  async reconcileOrder(orderId: string): Promise<Record<string, unknown>> {
    const order = await PaymentOrder.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }
    const provider = getPaymentProvider();
    if (!provider) {
      throw new ApiError(503, 'Payment provider is not configured', undefined, BillingErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }

    const [providerOrder, providerPayment] = await Promise.all([
      order.providerOrderId ? provider.fetchOrder(order.providerOrderId).catch(() => null) : Promise.resolve(null),
      order.providerPaymentId ? provider.fetchPayment(order.providerPaymentId).catch(() => null) : Promise.resolve(null),
    ]);

    const providerPaid = providerPayment?.status === 'captured' || providerOrder?.status === 'paid';
    const locallyPaid = order.status === 'paid' || order.status === 'refunded' || order.status === 'partially_refunded';

    return {
      local: { status: order.status, amountPaise: order.amountPaise, providerOrderId: order.providerOrderId, providerPaymentId: order.providerPaymentId },
      provider: {
        orderStatus: providerOrder?.status,
        paymentStatus: providerPayment?.status,
        amountPaise: providerPayment?.amountPaise ?? providerOrder?.amountPaise,
      },
      consistent: providerPaid === locallyPaid,
    };
  }

  /**
   * Admin/server-only refund action. The provider refund must succeed
   * before anything local is marked final. For a credit-pack purchase,
   * unused credits are safely removed via the existing admin credit
   * adjustment path (which itself refuses to take balance below 0); if the
   * credits were already (partly) consumed, the order is flagged for
   * manual review instead of ever creating a negative balance. A
   * subscription refund never rewrites historical interview usage.
   */
  async refundOrder(
    orderId: string,
    adminUserId: string,
    input: { amountPaise?: number; reason: string }
  ): Promise<AdminSafeOrder> {
    const order = await PaymentOrder.findById(orderId);
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }
    if (order.status !== 'paid' && order.status !== 'partially_refunded') {
      throw new ApiError(400, 'Only a paid order can be refunded', undefined, BillingErrorCode.REFUND_NOT_ALLOWED);
    }
    if (!order.providerPaymentId) {
      throw new ApiError(400, 'This order has no provider payment to refund', undefined, BillingErrorCode.REFUND_NOT_ALLOWED);
    }

    const provider = getPaymentProvider();
    if (!provider) {
      throw new ApiError(503, 'Payment provider is not configured', undefined, BillingErrorCode.PAYMENT_PROVIDER_UNAVAILABLE);
    }

    // Provider refund must succeed/confirm BEFORE anything local is marked final.
    const refund = await provider.refundPayment({ paymentId: order.providerPaymentId, amountPaise: input.amountPaise });

    const alreadyRefunded = order.refundedAmountPaise ?? 0;
    const totalRefunded = alreadyRefunded + refund.amountPaise;
    const isFullRefund = totalRefunded >= order.amountPaise;

    order.status = isFullRefund ? 'refunded' : 'partially_refunded';
    order.refundedAt = new Date();
    order.refundedAmountPaise = totalRefunded;
    order.metadata = {
      ...(order.metadata || {}),
      lastRefund: { refundId: refund.id, amountPaise: refund.amountPaise, reason: input.reason.slice(0, 300), byAdminUserId: adminUserId },
    };

    if (order.purchaseType === 'credit_pack' && isFullRefund) {
      const pack = await creditPackService.getPackByCode(order.creditPackCode!);
      if (pack) {
        try {
          await interviewCreditService.adjustCredits({
            userId: order.userId.toString(),
            amount: -pack.credits,
            reason: `Refund for credit pack purchase (order ${(order._id as Types.ObjectId).toString()})`,
            adminUserId,
            idempotencyKey: `refund-credit-removal:${(order._id as Types.ObjectId).toString()}`,
          });
          order.metadata.creditRefundStatus = 'removed';
        } catch (error) {
          // Balance already partly consumed — never create a negative
          // balance; flag for manual review instead.
          order.metadata.creditRefundStatus = 'manual_review_required';
          console.error('[BillingAdminService] Could not safely remove refunded credits — flagged for manual review', {
            orderId,
            error,
          });
        }
      }
    }

    await order.save();
    const user = await User.findById(order.userId).select('email');
    return this.toAdminSafeOrder(order, user?.email);
  }
}

export const billingAdminService = new BillingAdminService();
