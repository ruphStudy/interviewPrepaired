import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder, PaymentPurchaseType } from '../models/PaymentOrder.model';
import { OrganizationBillingProfile } from '../models/OrganizationBillingProfile.model';
import Organization from '../models/Organization.model';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';
import { BILLING_MERCHANT_DISPLAY_NAME, BILLING_RECEIPT_DOCUMENT_LABEL } from '../constants/billingReceipt';
import { env } from '../config/environment';

export interface SafeOrgPaymentOrder {
  id: string;
  organizationId: string;
  purchaseType: PaymentPurchaseType;
  planCode?: string;
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

export interface PaginatedOrgOrders {
  orders: SafeOrgPaymentOrder[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Organization-scoped read-only order history/detail/receipt
 * (PR-B2B-BILL-4) — mirrors BillingOrderService's exact safe-field
 * allowlist and receipt shape, but scoped by organizationId (never userId).
 * Cross-org access is denied by matching BOTH `_id` and `organizationId` in
 * the SAME query — never `_id` then checking organizationId after the fact.
 */
class OrganizationBillingOrderService {
  toSafeOrgOrder(order: IPaymentOrder): SafeOrgPaymentOrder {
    return {
      id: (order._id as Types.ObjectId).toString(),
      organizationId: order.organizationId ? order.organizationId.toString() : '',
      purchaseType: order.purchaseType,
      planCode: order.planCode,
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

  async listOrgOrders(organizationId: string, options: { page?: number; limit?: number } = {}): Promise<PaginatedOrgOrders> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const [orders, total] = await Promise.all([
      PaymentOrder.find({ organizationId, buyerType: 'organization' })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentOrder.countDocuments({ organizationId, buyerType: 'organization' }),
    ]);

    return { orders: orders.map((o) => this.toSafeOrgOrder(o)), page, limit, total };
  }

  /** Matches BOTH _id and organizationId in the same query — a cross-org order is a 404, never a data leak. */
  async getOrgOrder(organizationId: string, orderId: string): Promise<IPaymentOrder> {
    const order = await PaymentOrder.findOne({ _id: orderId, organizationId, buyerType: 'organization' });
    if (!order) {
      throw new ApiError(404, 'Payment order not found', undefined, BillingErrorCode.ORGANIZATION_PAYMENT_ORDER_NOT_FOUND);
    }
    return order;
  }

  async getOrgReceipt(organizationId: string, orderId: string): Promise<Record<string, unknown>> {
    const order = await this.getOrgOrder(organizationId, orderId);
    if (order.status !== 'paid' && order.status !== 'refunded' && order.status !== 'partially_refunded') {
      throw new ApiError(400, 'A receipt is only available for a completed payment');
    }

    const [organization, billingProfile] = await Promise.all([
      Organization.findById(organizationId).select('name'),
      OrganizationBillingProfile.findOne({ organizationId }).select('legalName billingAddress gstin'),
    ]);

    const legalName = billingProfile?.legalName || organization?.name;
    const billingAddress = billingProfile?.billingAddress;

    // Never a "Tax Invoice" unless BOTH a merchant GSTIN env var AND the
    // org's own billing profile gstin are present — and even then, B2C
    // receipts today have no real tax-invoice logic, so organization
    // receipts deliberately stay "Payment Receipt" too (no new GST/tax
    // logic is introduced here beyond reading these two optional env vars
    // for merchant display fields).
    const merchantGstin = env.billingGstin;
    const orgHasGstin = !!billingProfile?.gstin;
    const documentLabel = BILLING_RECEIPT_DOCUMENT_LABEL;

    return {
      documentLabel,
      gstConfigured: !!merchantGstin && orgHasGstin,
      merchant: {
        name: env.billingLegalName || BILLING_MERCHANT_DISPLAY_NAME,
        address: env.billingAddress,
        gstin: merchantGstin,
      },
      receiptNumber: order.receiptReference,
      paymentDate: order.paidAt,
      buyer: { name: legalName, address: billingAddress, gstin: billingProfile?.gstin },
      purchase: {
        type: order.purchaseType,
        planCode: order.planCode,
      },
      amountPaise: order.amountPaise,
      currency: order.currency,
      paymentReference: order.providerPaymentId,
      paymentStatus: order.status,
    };
  }
}

export const organizationBillingOrderService = new OrganizationBillingOrderService();
