import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { successResponse } from '../utils/ApiResponse';
import { subscriptionPlanService } from '../services/SubscriptionPlanService';
import { userSubscriptionService } from '../services/UserSubscriptionService';
import { AuthRequest } from '../middleware/auth';

export const getActivePlans = catchAsync(async (_req: AuthRequest, res: Response) => {
  const plans = await subscriptionPlanService.getActivePlans();

  const data = plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceInrPaise: plan.priceInrPaise,
    priceInr: plan.priceInrPaise / 100,
    billingInterval: plan.billingInterval,
    includedInterviews: plan.includedInterviews,
    features: plan.features,
  }));

  res.status(200).json(successResponse('Subscription plans retrieved successfully', data));
});

export const getMySubscription = catchAsync(async (req: AuthRequest, res: Response) => {
  const { plan, subscription } = await userSubscriptionService.getSubscriptionDetails(req.user!.id);

  res.status(200).json(
    successResponse('Current subscription retrieved successfully', {
      plan: {
        code: plan.code,
        name: plan.name,
        priceInrPaise: plan.priceInrPaise,
        priceInr: plan.priceInrPaise / 100,
        billingInterval: plan.billingInterval,
        includedInterviews: plan.includedInterviews,
        features: plan.features,
      },
      subscription: {
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        startedAt: subscription.startedAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        cancelledAt: subscription.cancelledAt,
      },
    })
  );
});

export const cancelMySubscription = catchAsync(async (req: AuthRequest, res: Response) => {
  const cancelAtPeriodEnd = req.body?.cancelAtPeriodEnd === true;

  const subscription = await userSubscriptionService.cancelSubscription(req.user!.id, cancelAtPeriodEnd);

  if (!subscription) {
    res.status(200).json(successResponse('No active subscription to cancel'));
    return;
  }

  res.status(200).json(
    successResponse('Subscription cancelled successfully', {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
  );
});
