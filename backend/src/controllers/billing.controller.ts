import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { catchAsync } from '../utils/catchAsync';
import { successResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { billingCheckoutService } from '../services/BillingCheckoutService';
import { billingVerificationService } from '../services/BillingVerificationService';
import { billingOrderService } from '../services/BillingOrderService';
import { razorpayWebhookService } from '../services/RazorpayWebhookService';
import { userSubscriptionService } from '../services/UserSubscriptionService';
import { creditPackService } from '../services/CreditPackService';

export const getCreditPacks = catchAsync(async (_req: AuthRequest, res: Response) => {
  const packs = await creditPackService.getActivePacks();
  const data = packs.map((pack) => ({
    code: pack.code,
    name: pack.name,
    description: pack.description,
    credits: pack.credits,
    priceInrPaise: pack.priceInrPaise,
    priceInr: pack.priceInrPaise / 100,
  }));
  res.status(200).json(successResponse('Credit packs retrieved successfully', data));
});

export const checkoutSubscription = catchAsync(async (req: AuthRequest, res: Response) => {
  const { planCode, idempotencyKey } = req.body;
  const payload = await billingCheckoutService.createSubscriptionCheckout(req.user!.id, planCode, idempotencyKey);
  res.status(200).json(successResponse('Checkout order created successfully', payload));
});

export const checkoutCreditPack = catchAsync(async (req: AuthRequest, res: Response) => {
  const { creditPackCode, idempotencyKey } = req.body;
  const payload = await billingCheckoutService.createCreditPackCheckout(req.user!.id, creditPackCode, idempotencyKey);
  res.status(200).json(successResponse('Checkout order created successfully', payload));
});

export const verifyPayment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { paymentOrderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const result = await billingVerificationService.verifyPayment(req.user!.id, {
    paymentOrderId,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });
  res.status(200).json(successResponse('Payment verified successfully', result));
});

/**
 * No `protect` middleware — Razorpay itself is the caller. `req.body` here
 * is the raw request Buffer (see app.ts's route-scoped express.raw()
 * mounted before the global JSON body parser), never the parsed JSON, so
 * the signature is always verified against the exact bytes Razorpay signed.
 */
export const handleRazorpayWebhook = catchAsync(async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const outcome = await razorpayWebhookService.handleWebhook(rawBody, signature);
  res.status(outcome.httpStatus).json(outcome.body);
});

export const listMyOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  const result = await billingOrderService.listOrders(req.user!.id, { page, limit });
  res.status(200).json(
    successResponse('Billing history retrieved successfully', {
      orders: result.orders,
      page: result.page,
      limit: result.limit,
      total: result.total,
    })
  );
});

export const getMyOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const order = await billingOrderService.getOwnedOrder(req.user!.id, req.params.id);
  res.status(200).json(successResponse('Payment order retrieved successfully', billingOrderService.toSafeOrder(order)));
});

export const getMyOrderReceipt = catchAsync(async (req: AuthRequest, res: Response) => {
  const receipt = await billingOrderService.getReceipt(req.user!.id, req.params.id);
  res.status(200).json(successResponse('Receipt retrieved successfully', receipt));
});

export const scheduleDowngrade = catchAsync(async (req: AuthRequest, res: Response) => {
  const { planCode } = req.body;
  if (!planCode || typeof planCode !== 'string') {
    throw new ApiError(400, 'planCode is required');
  }
  const subscription = await userSubscriptionService.scheduleDowngrade(req.user!.id, planCode);
  res.status(200).json(
    successResponse('Downgrade scheduled successfully', {
      status: subscription.status,
      planCode: subscription.planCode,
      pendingPlanCode: subscription.pendingPlanCode,
      pendingPlanEffectiveAt: subscription.pendingPlanEffectiveAt,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      autoRenew: subscription.autoRenew,
    })
  );
});

export const cancelScheduledDowngrade = catchAsync(async (req: AuthRequest, res: Response) => {
  const subscription = await userSubscriptionService.cancelScheduledDowngrade(req.user!.id);
  if (!subscription) {
    res.status(200).json(successResponse('No scheduled downgrade to cancel'));
    return;
  }
  res.status(200).json(
    successResponse('Scheduled downgrade cancelled', {
      status: subscription.status,
      planCode: subscription.planCode,
      pendingPlanCode: subscription.pendingPlanCode,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      autoRenew: subscription.autoRenew,
    })
  );
});
