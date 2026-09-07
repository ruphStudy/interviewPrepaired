import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewKnowledgeAnalyticsService } from '../services/EmployerInterviewKnowledgeAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) knowledge-grounding analytics (29E). */
export class EmployerInterviewKnowledgeAnalyticsController {
  public buildAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewKnowledgeAnalyticsService.buildAnalytics(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Knowledge analytics built successfully', result));
  });

  public getAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewKnowledgeAnalyticsService.getAnalytics(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Knowledge analytics retrieved successfully', result));
  });
}

export const employerInterviewKnowledgeAnalyticsController = new EmployerInterviewKnowledgeAnalyticsController();
export default employerInterviewKnowledgeAnalyticsController;
