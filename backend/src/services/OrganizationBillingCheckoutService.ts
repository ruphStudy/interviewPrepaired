import crypto from 'crypto';
import { Types } from 'mongoose';
import { PaymentOrder, IPaymentOrder, PaymentOrderStatus, PaymentPurchaseType } from '../models/PaymentOrder.model';
import Organization from '../models/Organization.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { getInstitutePlan, InstitutePlanCode } from '../constants/institutePlan';
import { getCompanyPlan, CompanyPlanCode } from '../constants/organizationBillingPlan';
import { organizationSubscriptionService } from './OrganizationSubscriptionService';
import { getPaymentProvider } from '../payments';
import { ApiError } from '../utils/ApiError';
import { BillingErrorCode } from '../constants/billing';

const USABLE_STATUSES: PaymentOrderStatus[] = ['created', 'provider_created', 'payment_pending'];
const RETRYABLE_STATUSES: PaymentOrderStatus[] = ['failed', 'cancelled', 'expired'];

export interface OrganizationCheckoutPayload {
  paymentOrderId: string;
  providerOrderId?: string;
  amountPaise: number;
  currency: string;
  purchaseType: PaymentPurchaseType;
  organizationId: string;
  planCode?: string;
  keyId: string;
}

interface CreateOrgOrderInput {
  organizationId: string;
  actingUserId: string;
  purchaseType: 'organization_credit_pack' | 'organization_subscription';
  planCode: string;
  amountPaise: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

/**
 * Organization (B2B) checkout / order creation (PR-B2B-BILL-2/3). Mirrors
 * BillingCheckoutService's exact idempotency/order-creation/provider-order
 * pattern, but idempotency-scoped by organizationId (not userId) and always
 * server-derives amount/plan from the relevant plan catalog — the client
 * never supplies amount/currency/credit-quantity, only a planCode +
 * idempotencyKey. `userId` on the created PaymentOrder row is always the
 * ACTING/initiating member's user id (never blank), which keeps
 * BillingVerificationService's existing `{_id, userId}` lookup correct with
 * zero changes to that file.
 */
class OrganizationBillingCheckoutService {
  /** Institute-only: prepaid interview-credit pack checkout. */
  async createCreditsCheckout(
    organizationId: string,
    actingUserId: string,
    planCode: string,
    idempotencyKey: string
  ): Promise<OrganizationCheckoutPayload> {
    const organization = await this.loadActiveOrganization(organizationId);
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(
        400,
        'Interview credit checkout is only available for institute organizations',
        undefined,
        BillingErrorCode.ORGANIZATION_BILLING_NOT_ALLOWED
      );
    }

    const plan = getInstitutePlan(planCode);
    if (
      !plan ||
      plan.customPrice === true ||
      plan.interviewCredits === null ||
      plan.interviewCredits === undefined ||
      plan.priceINR === null ||
      plan.priceINR === undefined ||
      plan.code === InstitutePlanCode.ENTERPRISE
    ) {
      throw new ApiError(
        400,
        `Plan "${planCode}" is not available for self-service checkout. Enterprise plans are custom — contact sales.`,
        undefined,
        BillingErrorCode.ORGANIZATION_CREDIT_PLAN_INVALID
      );
    }

    const amountPaise = plan.priceINR * 100;

    return this.createOrder({
      organizationId,
      actingUserId,
      purchaseType: 'organization_credit_pack',
      planCode: plan.code,
      amountPaise,
      idempotencyKey,
      metadata: { creditsGranted: plan.interviewCredits },
    });
  }

  /** Company-only: seat/feature monthly subscription checkout. */
  async createSubscriptionCheckout(
    organizationId: string,
    actingUserId: string,
    planCode: string,
    idempotencyKey: string
  ): Promise<OrganizationCheckoutPayload> {
    const organization = await this.loadActiveOrganization(organizationId);
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(
        400,
        'Subscription checkout is only available for company organizations',
        undefined,
        BillingErrorCode.ORGANIZATION_BILLING_NOT_ALLOWED
      );
    }

    const plan = getCompanyPlan(planCode);
    if (!plan || !plan.active || plan.customPrice === true || plan.priceInrPaise === null || plan.code === CompanyPlanCode.COMPANY_ENTERPRISE) {
      throw new ApiError(
        400,
        `Plan "${planCode}" is not available for self-service checkout. Enterprise plans are custom — contact sales.`,
        undefined,
        BillingErrorCode.ORGANIZATION_PLAN_INVALID
      );
    }

    const current = await organizationSubscriptionService.getCurrentSubscription(organizationId);
    if (current && current.planCode === plan.code && current.status === 'active' && !current.cancelAtPeriodEnd) {
      throw new ApiError(
        400,
        'This organization already has this plan active',
        undefined,
        BillingErrorCode.ORGANIZATION_SUBSCRIPTION_ALREADY_ACTIVE
      );
    }

    return this.createOrder({
      organizationId,
      actingUserId,
      purchaseType: 'organization_subscription',
      planCode: plan.code,
      amountPaise: plan.priceInrPaise,
      idempotencyKey,
    });
  }

  private async loadActiveOrganization(organizationId: string) {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ApiError(
        409,
        'This organization is archived or suspended and cannot make a purchase',
        undefined,
        BillingErrorCode.ORGANIZATION_ARCHIVED
      );
    }
    return organization;
  }

  private async createOrder(input: CreateOrgOrderInput): Promise<OrganizationCheckoutPayload> {
    const existing = await PaymentOrder.findOne({ organizationId: input.organizationId, idempotencyKey: input.idempotencyKey });
    if (existing) {
      return this.resolveExisting(existing, input);
    }

    const receiptReference = `orcpt_${crypto.randomBytes(10).toString('hex')}`;

    let order: IPaymentOrder;
    try {
      order = await PaymentOrder.create({
        userId: input.actingUserId,
        buyerType: 'organization',
        organizationId: input.organizationId,
        purchaseType: input.purchaseType,
        planCode: input.planCode,
        amountPaise: input.amountPaise,
        currency: 'INR',
        provider: 'razorpay',
        status: 'created',
        idempotencyKey: input.idempotencyKey,
        receiptReference,
        metadata: input.metadata,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        // Race: a concurrent request with the same key won — treat it the
        // same way we treat an already-existing order.
        const winner = await PaymentOrder.findOne({ organizationId: input.organizationId, idempotencyKey: input.idempotencyKey });
        if (winner) {
          return this.resolveExisting(winner, input);
        }
      }
      throw error;
    }

    return this.ensureProviderOrder(order);
  }

  /** Same key + same product => return the existing usable order (or a fresh retry if it previously failed). Same key + different product => 409 conflict. */
  private async resolveExisting(existing: IPaymentOrder, input: CreateOrgOrderInput): Promise<OrganizationCheckoutPayload> {
    const sameProduct =
      existing.purchaseType === input.purchaseType &&
      existing.planCode === input.planCode &&
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
      existing.status = 'created';
      existing.providerOrderId = undefined;
      existing.providerPaymentId = undefined;
      existing.failureCode = undefined;
      existing.failureMessage = undefined;
      existing.receiptReference = `orcpt_${crypto.randomBytes(10).toString('hex')}`;
      await existing.save();
    }

    return this.ensureProviderOrder(existing);
  }

  private async ensureProviderOrder(order: IPaymentOrder): Promise<OrganizationCheckoutPayload> {
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
        organizationId: order.organizationId ? order.organizationId.toString() : '',
      },
    });

    order.providerOrderId = providerOrder.id;
    order.status = 'provider_created';
    await order.save();

    return this.toCheckoutPayload(order);
  }

  private toCheckoutPayload(order: IPaymentOrder): OrganizationCheckoutPayload {
    const provider = getPaymentProvider();
    return {
      paymentOrderId: (order._id as Types.ObjectId).toString(),
      providerOrderId: order.providerOrderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
      purchaseType: order.purchaseType,
      organizationId: order.organizationId ? order.organizationId.toString() : '',
      planCode: order.planCode,
      keyId: provider?.publicKeyId ?? '',
    };
  }
}

export const organizationBillingCheckoutService = new OrganizationBillingCheckoutService();
