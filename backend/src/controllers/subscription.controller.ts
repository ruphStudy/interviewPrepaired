import { Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { successResponse } from '../utils/ApiResponse';
import { subscriptionPlanService } from '../services/SubscriptionPlanService';

export const getActivePlans = catchAsync(async (_req: Request, res: Response) => {
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
