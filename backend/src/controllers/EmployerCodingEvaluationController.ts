import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingEvaluationService } from '../services/EmployerCodingEvaluationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Employer-internal AI coding evaluation (30D). Never candidate/public-reachable. */
export class EmployerCodingEvaluationController {
  public generateEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId, submissionId } = req.params;
    const result = await employerCodingEvaluationService.generateEvaluation(context.organizationId, context.role, interviewId, submissionId);
    res.status(200).json(successResponse('Coding evaluation processed', result));
  });

  public getEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId, submissionId } = req.params;
    const result = await employerCodingEvaluationService.getEvaluation(context.organizationId, context.role, interviewId, submissionId);
    res.status(200).json(successResponse('Coding evaluation retrieved', result));
  });
}

export const employerCodingEvaluationController = new EmployerCodingEvaluationController();
export default employerCodingEvaluationController;
