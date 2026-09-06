import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewGraphAnalyticsService } from '../services/EmployerInterviewGraphAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, deterministic (no AI) dynamic interview graph analytics (27E) — routing/traversal behavior only, never a candidate performance score. Never exposed to any public/candidate-facing API. */
export class EmployerInterviewGraphAnalyticsController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/graph-analytics — requires ANALYTICS_VIEW. Never builds. */
  public getAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewGraphAnalyticsService.getAnalytics(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Interview graph analytics retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/graph-analytics/build — requires INTERVIEWS_MANAGE. Deterministic; no client artifact IDs accepted. */
  public buildAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewGraphAnalyticsService.buildAnalytics(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Interview graph analytics built successfully', result));
  });
}

export default new EmployerInterviewGraphAnalyticsController();
