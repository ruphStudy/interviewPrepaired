import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder } from '../models/PaymentOrder.model';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';
import { BILLING_MERCHANT_DISPLAY_NAME, BILLING_RECEIPT_DOCUMENT_LABEL, BILLING_GST_CONFIGURED } from '../constants/billingReceipt';

export interface SafePaymentOrder {
  id: string;
  purchaseType: 'subscription' | 'credit_pack';
  planCode?: string;
  creditPackCode?: string;
  amountPaise: number;
  currency: string;
  status: string;
  receiptReference: string;
  providerPaymentId?: string;
  failureCode?: string;
  failureMessage?: string;
  paidAt?: Date;
  cancelledAt?: Date;
  refundedAt?: Date;
  createdAt: Date;
}

export interface PaginatedOrders {
  orders: SafePaymentOrder[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Read-only order history/detail/receipt (PR-BILL-7). Every mapper here is
 * an explicit allow-list — provider secrets, raw signatures, raw webhook
 * payloads, and internal `metadata` are never included, by construction
 * (they are simply never read off the document).
 */
class BillingOrderService {
  toSafeOrder(order: IPaymentOrder): SafePaymentOrder {
    return {
      id: (order._id as Types.ObjectId).toString(),
      purchaseType: order.purchaseType,
      planCode: order.planCode,
      creditPackCode: order.creditPackCode,
      amountPaise: order.amountPaise,
      currency: order.currency,
      status: order.status,
      receiptReference: order.receiptReference,
      providerPaymentId: order.providerPaymentId,
      failureCode: order.failureCode,
      failureMessage: order.failureMessage,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      refundedAt: order.refundedAt,
      createdAt: order.createdAt,
    };
  }

  async listOrders(userId: string, options: { page?: number; limit?: number } = {}): Promise<PaginatedOrders> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const [orders, total] = await Promise.all([
      PaymentOrder.find({ userId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentOrder.countDocuments({ userId }),
    ]);

    return { orders: orders.map((o) => this.toSafeOrder(o)), page, limit, total };
  }

  /** Exact owner only — a mismatch is a 404, never leaking whether the order exists for a different user. */
  async getOwnedOrder(userId: string, orderId: string): Promise<IPaymentOrder> {
    const order = await PaymentOrder.findOne({ _id: orderId, userId });
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.PAYMENT_ORDER_NOT_FOUND);
    }
    return order;
  }

  async getReceipt(userId: string, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.getOwnedOrder(userId, orderId);
    if (order.status !== 'paid' && order.status !== 'refunded' && order.status !== 'partially_refunded') {
      throw new ApiError(400, 'A receipt is only available for a completed payment');
    }

    const user = await User.findById(userId).select('name email');

    return {
      documentLabel: BILLING_RECEIPT_DOCUMENT_LABEL,
      gstConfigured: BILLING_GST_CONFIGURED,
      merchant: { name: BILLING_MERCHANT_DISPLAY_NAME },
      receiptNumber: order.receiptReference,
      paymentDate: order.paidAt,
      customer: { name: user?.name, email: user?.email },
      purchase: {
        type: order.purchaseType,
        planCode: order.planCode,
        creditPackCode: order.creditPackCode,
      },
      amountPaise: order.amountPaise,
      currency: order.currency,
      paymentReference: order.providerPaymentId,
      paymentStatus: order.status,
    };
  }
}

export const billingOrderService = new BillingOrderService();
