import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringOutcomeService } from '../services/EmployerHiringOutcomeService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Structured, employer-entered hiring/employment outcome TRACKING (32C) — post-hoc observation only, never a prediction/decision. */
export class EmployerHiringOutcomeController {
  public updateOutcome = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { applicationId } = req.params;
    const { employmentOutcome, notes } = req.body ?? {};
    const result = await employerHiringOutcomeService.updateOutcome(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      { employmentOutcome, notes }
    );
    res.status(200).json(successResponse('Hiring outcome saved successfully', result));
  });

  public getOutcome = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { applicationId } = req.params;
    const result = await employerHiringOutcomeService.getOutcome(context.organizationId, context.role, applicationId);
    res.status(200).json(successResponse('Hiring outcome retrieved successfully', result));
  });
}

export const employerHiringOutcomeController = new EmployerHiringOutcomeController();
export default employerHiringOutcomeController;
