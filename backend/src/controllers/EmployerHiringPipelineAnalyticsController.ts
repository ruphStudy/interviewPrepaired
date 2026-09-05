import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringPipelineAnalyticsService } from '../services/EmployerHiringPipelineAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringPipelineAnalyticsController {
  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/pipeline-analytics — requires ORGANIZATION_VIEW. Live, deterministic — no mutation, no persisted analytics. */
  public getJobPipelineAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const analytics = await employerHiringPipelineAnalyticsService.getJobPipelineAnalytics(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Pipeline analytics retrieved successfully', analytics));
  });
}

export default new EmployerHiringPipelineAnalyticsController();
