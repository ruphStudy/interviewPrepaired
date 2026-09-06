import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCollaborationAnalyticsService } from '../services/EmployerCollaborationAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Live, deterministic, never persisted. */
export class EmployerCollaborationAnalyticsController {
  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/collaboration-analytics */
  public getJobAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const analytics = await employerCollaborationAnalyticsService.getJobAnalytics(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Collaboration analytics retrieved successfully', analytics));
  });
}

export default new EmployerCollaborationAnalyticsController();
