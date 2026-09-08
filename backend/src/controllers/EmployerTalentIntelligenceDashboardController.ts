import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerTalentIntelligenceDashboardService } from '../services/EmployerTalentIntelligenceDashboardService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` — `req.organizationContext` is always present by the time this runs. Read-only, deterministic (NO AI) unified talent intelligence dashboard (32E). */
export class EmployerTalentIntelligenceDashboardController {
  public getDashboard = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const result = await employerTalentIntelligenceDashboardService.getDashboard(context.organizationId, context.role);
    res.status(200).json(successResponse('Talent intelligence dashboard retrieved successfully', result));
  });
}

export const employerTalentIntelligenceDashboardController = new EmployerTalentIntelligenceDashboardController();
export default employerTalentIntelligenceDashboardController;
