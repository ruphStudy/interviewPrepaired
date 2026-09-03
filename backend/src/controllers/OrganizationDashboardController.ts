import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationDashboardService } from '../services/OrganizationDashboardService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class OrganizationDashboardController {
  /**
   * GET /api/v1/organizations/:organizationId/dashboard
   * Read-only aggregation — no database queries here, all in the service.
   */
  public getDashboard = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const dashboard = await organizationDashboardService.getDashboard(context.organizationId, {
      role: context.role,
      permissions: context.permissions,
      membershipId: context.member._id.toString(),
    });

    res.status(200).json(successResponse('Organization dashboard retrieved successfully', dashboard));
  });
}

export default new OrganizationDashboardController();
