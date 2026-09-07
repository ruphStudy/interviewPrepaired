import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerAssessmentIntegrityService } from '../services/EmployerAssessmentIntegrityService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) integrity signal review (31B). Never a cheating score. */
export class EmployerAssessmentIntegrityController {
  public buildSummary = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerAssessmentIntegrityService.buildSummary(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Integrity review built successfully', result));
  });

  public getSummary = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerAssessmentIntegrityService.getSummary(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Integrity review retrieved successfully', result));
  });
}

export const employerAssessmentIntegrityController = new EmployerAssessmentIntegrityController();
export default employerAssessmentIntegrityController;
