import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerUnifiedTalentProfileService } from '../services/EmployerUnifiedTalentProfileService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) unified talent profile (32A). Employer-internal only. */
export class EmployerUnifiedTalentProfileController {
  public buildProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { candidateId } = req.params;
    const result = await employerUnifiedTalentProfileService.buildProfile(context.organizationId, context.role, candidateId);
    res.status(200).json(successResponse('Talent profile built successfully', result));
  });

  public getProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { candidateId } = req.params;
    const result = await employerUnifiedTalentProfileService.getProfile(context.organizationId, context.role, candidateId);
    res.status(200).json(successResponse('Talent profile retrieved successfully', result));
  });
}

export const employerUnifiedTalentProfileController = new EmployerUnifiedTalentProfileController();
export default employerUnifiedTalentProfileController;
