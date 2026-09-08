import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerOutcomeQualityAnalyticsService } from '../services/EmployerOutcomeQualityAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) organization-level outcome/quality analytics (32D). */
export class EmployerOutcomeQualityAnalyticsController {
  public buildAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const result = await employerOutcomeQualityAnalyticsService.buildAnalytics(context.organizationId, context.role);
    res.status(200).json(successResponse('Outcome quality analytics built successfully', result));
  });

  public getAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
    const result = await employerOutcomeQualityAnalyticsService.getAnalytics(context.organizationId, context.role, { jobId });
    res.status(200).json(successResponse('Outcome quality analytics retrieved successfully', result));
  });
}

export const employerOutcomeQualityAnalyticsController = new EmployerOutcomeQualityAnalyticsController();
export default employerOutcomeQualityAnalyticsController;
