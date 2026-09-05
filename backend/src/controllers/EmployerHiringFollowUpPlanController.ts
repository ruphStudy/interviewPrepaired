import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringFollowUpPlanService } from '../services/EmployerHiringFollowUpPlanService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringFollowUpPlanController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/follow-up-plan — requires INTERVIEWS_MANAGE. */
  public createPlan = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const followUpPlan = await employerHiringFollowUpPlanService.createPlan(context.organizationId, context.role, applicationId);

    res.status(201).json(successResponse('Follow-up plan generated successfully', { followUpPlan }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/follow-up-plan — requires ORGANIZATION_VIEW. */
  public getPlan = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const followUpPlan = await employerHiringFollowUpPlanService.getPlan(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Follow-up plan retrieved successfully', { followUpPlan }));
  });
}

export default new EmployerHiringFollowUpPlanController();
