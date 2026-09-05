import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationTimelineService } from '../services/EmployerJobApplicationTimelineService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerJobApplicationTimelineController {
  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/timeline — requires ORGANIZATION_VIEW. */
  public getTimeline = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const timeline = await employerJobApplicationTimelineService.getTimeline(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Application timeline retrieved successfully', timeline));
  });
}

export default new EmployerJobApplicationTimelineController();
