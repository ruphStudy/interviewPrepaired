import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingAssessmentSessionService } from '../services/EmployerCodingAssessmentSessionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Employer-internal coding assessment session management (30B). No execution. */
export class EmployerCodingAssessmentSessionController {
  public createOrUpdateSession = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const { codingQuestionIds } = req.body;
    const result = await employerCodingAssessmentSessionService.createOrUpdateSession(
      context.organizationId,
      context.role,
      interviewId,
      Array.isArray(codingQuestionIds) ? codingQuestionIds : []
    );
    res.status(200).json(successResponse('Coding assessment session saved successfully', result));
  });

  public getSession = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerCodingAssessmentSessionService.getSession(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Coding assessment session retrieved successfully', result));
  });
}

export const employerCodingAssessmentSessionController = new EmployerCodingAssessmentSessionController();
export default employerCodingAssessmentSessionController;
