import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { OrganizationBillingProfile } from '../models/OrganizationBillingProfile.model';
import { organizationBillingCheckoutService } from '../services/OrganizationBillingCheckoutService';
import { organizationBillingOrderService } from '../services/OrganizationBillingOrderService';
import { organizationSubscriptionService } from '../services/OrganizationSubscriptionService';
import { organizationEntitlementService } from '../services/OrganizationEntitlementService';
import { organizationContractService } from '../services/OrganizationContractService';
import { getAllOrgBillingPlans, getInstituteBillingPlans, COMPANY_PLANS } from '../constants/organizationBillingPlan';
import { OrganizationType } from '../constants/organization';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present. */
export class OrganizationBillingController {
  private context(req: OrganizationAuthRequest) {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    return context;
  }

  /** GET /:organizationId/billing/plans — read-only catalog scoped to this org's type. */
  public getPlans = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const plans =
      context.organization.type === OrganizationType.INSTITUTE
        ? getInstituteBillingPlans()
        : context.organization.type === OrganizationType.COMPANY
          ? COMPANY_PLANS
          : getAllOrgBillingPlans();
    res.status(200).json(successResponse('Billing plans retrieved successfully', { plans }));
  });

  /** GET /:organizationId/billing/profile */
  public getBillingProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const profile = await OrganizationBillingProfile.findOne({ organizationId: context.organizationId });
    res.status(200).json(
      successResponse('Billing profile retrieved successfully', {
        organizationId: context.organizationId,
        billingType: profile?.billingType,
        billingEmail: profile?.billingEmail,
        legalName: profile?.legalName,
        billingAddress: profile?.billingAddress,
        taxId: profile?.taxId,
        gstin: profile?.gstin,
        currency: profile?.currency ?? 'INR',
        status: profile?.status ?? 'active',
      })
    );
  });

  /** PATCH /:organizationId/billing/profile — explicit, authorized-user-provided fields only; never auto-filled/fabricated. */
  public updateBillingProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const { billingEmail, legalName, billingAddress, taxId, gstin } = req.body;

    const defaultBillingType = context.organization.type === OrganizationType.INSTITUTE ? 'prepaid_credits' : 'subscription';

    const profile = await OrganizationBillingProfile.findOneAndUpdate(
      { organizationId: context.organizationId },
      {
        $setOnInsert: { organizationId: context.organizationId, billingType: defaultBillingType },
        $set: {
          ...(billingEmail !== undefined ? { billingEmail } : {}),
          ...(legalName !== undefined ? { legalName } : {}),
          ...(billingAddress !== undefined ? { billingAddress } : {}),
          ...(taxId !== undefined ? { taxId } : {}),
          ...(gstin !== undefined ? { gstin } : {}),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(
      successResponse('Billing profile updated successfully', {
        billingType: profile.billingType,
        billingEmail: profile.billingEmail,
        legalName: profile.legalName,
        billingAddress: profile.billingAddress,
        taxId: profile.taxId,
        gstin: profile.gstin,
        currency: profile.currency,
        status: profile.status,
      })
    );
  });

  /** POST /:organizationId/billing/checkout/credits — institute-only prepaid interview-credit checkout. */
  public checkoutCredits = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const { planCode, idempotencyKey } = req.body;
    const payload = await organizationBillingCheckoutService.createCreditsCheckout(
      context.organizationId,
      req.user!.id,
      planCode,
      idempotencyKey
    );
    res.status(200).json(successResponse('Checkout order created successfully', payload));
  });

  /** POST /:organizationId/billing/checkout/subscription — company-only monthly subscription checkout. */
  public checkoutSubscription = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const { planCode, idempotencyKey } = req.body;
    const payload = await organizationBillingCheckoutService.createSubscriptionCheckout(
      context.organizationId,
      req.user!.id,
      planCode,
      idempotencyKey
    );
    res.status(200).json(successResponse('Checkout order created successfully', payload));
  });

  /** GET /:organizationId/billing/subscription — current subscription + entitlements + any active contract (enterprise/contract-managed UI). */
  public getSubscriptionStatus = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const [subscription, entitlements, activeContract] = await Promise.all([
      organizationSubscriptionService.getCurrentSubscription(context.organizationId),
      organizationEntitlementService.getEntitlements(context.organizationId),
      organizationContractService.getActiveContract(context.organizationId),
    ]);

    res.status(200).json(
      successResponse('Subscription status retrieved successfully', {
        subscription: subscription
          ? {
              planCode: subscription.planCode,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              autoRenew: subscription.autoRenew,
              source: subscription.source,
              pendingNextPlanCode: subscription.pendingNextPlanCode,
            }
          : null,
        entitlements,
        contract: activeContract
          ? {
              contractCode: activeContract.contractCode,
              status: activeContract.status,
              startDate: activeContract.startDate,
              endDate: activeContract.endDate,
              billingModel: activeContract.billingModel,
              planCode: activeContract.planCode,
              creditAllowance: activeContract.creditAllowance,
            }
          : null,
      })
    );
  });

  /** POST /:organizationId/billing/subscription/downgrade */
  public scheduleDowngrade = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const { planCode } = req.body;
    if (!planCode || typeof planCode !== 'string') {
      throw new ApiError(400, 'planCode is required');
    }
    const subscription = await organizationSubscriptionService.scheduleDowngrade(context.organizationId, planCode);
    res.status(200).json(
      successResponse('Downgrade scheduled successfully', {
        status: subscription.status,
        planCode: subscription.planCode,
        pendingNextPlanCode: subscription.pendingNextPlanCode,
      })
    );
  });

  /** POST /:organizationId/billing/subscription/downgrade/cancel */
  public cancelScheduledDowngrade = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const subscription = await organizationSubscriptionService.cancelScheduledDowngrade(context.organizationId);
    if (!subscription) {
      res.status(200).json(successResponse('No scheduled downgrade to cancel'));
      return;
    }
    res.status(200).json(
      successResponse('Scheduled downgrade cancelled', {
        status: subscription.status,
        planCode: subscription.planCode,
        pendingNextPlanCode: subscription.pendingNextPlanCode,
      })
    );
  });

  /** POST /:organizationId/billing/subscription/cancel */
  public cancelSubscription = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const cancelAtPeriodEnd = req.body.cancelAtPeriodEnd === true;
    const subscription = await organizationSubscriptionService.cancelSubscription(context.organizationId, cancelAtPeriodEnd);
    if (!subscription) {
      res.status(200).json(successResponse('No subscription to cancel'));
      return;
    }
    res.status(200).json(
      successResponse('Subscription cancellation processed', {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      })
    );
  });

  /** GET /:organizationId/billing/orders */
  public listOrders = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const result = await organizationBillingOrderService.listOrgOrders(context.organizationId, { page, limit });
    res.status(200).json(successResponse('Billing history retrieved successfully', result));
  });

  /** GET /:organizationId/billing/orders/:orderId */
  public getOrder = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const order = await organizationBillingOrderService.getOrgOrder(context.organizationId, req.params.orderId);
    res.status(200).json(successResponse('Payment order retrieved successfully', organizationBillingOrderService.toSafeOrgOrder(order)));
  });

  /** GET /:organizationId/billing/orders/:orderId/receipt */
  public getReceipt = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const receipt = await organizationBillingOrderService.getOrgReceipt(context.organizationId, req.params.orderId);
    res.status(200).json(successResponse('Receipt retrieved successfully', receipt));
  });

  /** GET /:organizationId/billing/contract — read-only, for enterprise/contract-managed UI. */
  public getActiveContract = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = this.context(req);
    const contract = await organizationContractService.getActiveContract(context.organizationId);
    res.status(200).json(
      successResponse(
        'Active contract retrieved successfully',
        contract
          ? {
              contractCode: contract.contractCode,
              status: contract.status,
              startDate: contract.startDate,
              endDate: contract.endDate,
              billingModel: contract.billingModel,
              planCode: contract.planCode,
              creditAllowance: contract.creditAllowance,
              renewalTerms: contract.renewalTerms,
            }
          : null
      )
    );
  });
}

export default new OrganizationBillingController();
