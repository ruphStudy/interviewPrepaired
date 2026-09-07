import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingExecutionService } from '../services/EmployerCodingExecutionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Employer-internal, full execution detail including hidden test results (30C). Read-only; never triggers a run. */
export class EmployerCodingExecutionController {
  public getExecution = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId, submissionId } = req.params;
    const result = await employerCodingExecutionService.getExecutionForEmployer(context.organizationId, context.role, interviewId, submissionId);
    res.status(200).json(successResponse('Execution retrieved successfully', result));
  });
}

export const employerCodingExecutionController = new EmployerCodingExecutionController();
export default employerCodingExecutionController;
