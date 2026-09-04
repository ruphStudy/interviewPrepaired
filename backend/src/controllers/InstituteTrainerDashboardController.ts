import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerDashboardService } from '../services/InstituteTrainerDashboardService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(INTERVIEWS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class InstituteTrainerDashboardController {
  /**
   * GET /api/v1/organizations/:organizationId/trainer-dashboard
   * `trainerMembershipId` is always the caller's own trusted membership id
   * from organizationContext — never accepted from query/body.
   */
  public getDashboard = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const dashboard = await instituteTrainerDashboardService.getDashboard(
      context.organizationId,
      context.role,
      context.member._id
    );

    res.status(200).json(successResponse('Trainer dashboard retrieved successfully', dashboard));
  });
}

export default new InstituteTrainerDashboardController();
