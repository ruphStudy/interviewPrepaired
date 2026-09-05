import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAssessmentFinalizationService } from '../services/EmployerHiringAssessmentFinalizationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringAssessmentFinalizationController {
  /** POST .../interview-session/finalization — requires INTERVIEWS_MANAGE. No request body required. */
  public createFinalization = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const finalization = await employerHiringAssessmentFinalizationService.createFinalization(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(201).json(successResponse('Assessment package finalized successfully', { finalization }));
  });

  /** GET .../interview-session/finalization — requires ORGANIZATION_VIEW. Returns readiness checklist + existing finalization (or null). */
  public getFinalization = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerHiringAssessmentFinalizationService.getReadiness(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Finalization readiness retrieved successfully', result));
  });
}

export default new EmployerHiringAssessmentFinalizationController();
