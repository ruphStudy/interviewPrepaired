import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAssessmentResultService } from '../services/EmployerHiringAssessmentResultService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringAssessmentResultController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/result — requires INTERVIEWS_MANAGE. */
  public createResult = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerHiringAssessmentResultService.createResult(context.organizationId, context.role, applicationId);

    res.status(201).json(successResponse('Assessment result generated successfully', { result }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/result — requires ORGANIZATION_VIEW. */
  public getResult = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerHiringAssessmentResultService.getResult(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Assessment result retrieved successfully', { result }));
  });
}

export default new EmployerHiringAssessmentResultController();
