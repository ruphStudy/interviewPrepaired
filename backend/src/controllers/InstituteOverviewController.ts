import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteOverviewService } from '../services/InstituteOverviewService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

export class InstituteOverviewController {
  /**
   * GET /api/v1/organizations/:organizationId/institute-overview
   * Requires ORGANIZATION_VIEW. 400 if the organization is not an institute.
   */
  public getOverview = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const overview = await instituteOverviewService.getOverview(context.organizationId, context.role);

    res.status(200).json(successResponse('Institute overview retrieved successfully', overview));
  });
}

export default new InstituteOverviewController();
