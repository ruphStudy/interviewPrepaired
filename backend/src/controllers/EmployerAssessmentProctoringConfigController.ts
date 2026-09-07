import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerAssessmentProctoringConfigService } from '../services/EmployerAssessmentProctoringConfigService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Proctoring foundation (31A) — event-type toggles only, no camera/mic/screen capture. */
export class EmployerAssessmentProctoringConfigController {
  public getConfig = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerAssessmentProctoringConfigService.getConfig(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Proctoring configuration retrieved successfully', result));
  });

  public updateConfig = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const { enabled, capture, enforcement } = req.body ?? {};
    const result = await employerAssessmentProctoringConfigService.updateConfig(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      interviewId,
      { enabled: Boolean(enabled), capture, enforcement }
    );
    res.status(200).json(successResponse('Proctoring configuration saved successfully', result));
  });
}

export const employerAssessmentProctoringConfigController = new EmployerAssessmentProctoringConfigController();
export default employerAssessmentProctoringConfigController;
