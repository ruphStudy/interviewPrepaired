import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingAssessmentReportService } from '../services/EmployerCodingAssessmentReportService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) aggregate coding assessment report (30E). Never candidate/public-reachable. */
export class EmployerCodingAssessmentReportController {
  public buildReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerCodingAssessmentReportService.buildReport(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Coding assessment report built successfully', result));
  });

  public getReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerCodingAssessmentReportService.getReport(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Coding assessment report retrieved successfully', result));
  });
}

export const employerCodingAssessmentReportController = new EmployerCodingAssessmentReportController();
export default employerCodingAssessmentReportController;
