import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerAssessmentProctoringEventService } from '../services/EmployerAssessmentProctoringEventService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Employer-internal, read-only proctoring event history (31A). */
export class EmployerAssessmentProctoringEventController {
  public listEvents = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerAssessmentProctoringEventService.listEvents(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Proctoring events retrieved successfully', result));
  });
}

export const employerAssessmentProctoringEventController = new EmployerAssessmentProctoringEventController();
export default employerAssessmentProctoringEventController;
