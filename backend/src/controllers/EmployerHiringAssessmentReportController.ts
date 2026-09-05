import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAssessmentReportService } from '../services/EmployerHiringAssessmentReportService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringAssessmentReportController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/report — requires INTERVIEWS_MANAGE. */
  public createReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const hiringReport = await employerHiringAssessmentReportService.createReport(context.organizationId, context.role, applicationId);

    res.status(201).json(successResponse('Hiring report generated successfully', { hiringReport }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/report — requires ORGANIZATION_VIEW. */
  public getReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const hiringReport = await employerHiringAssessmentReportService.getReport(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Hiring report retrieved successfully', { hiringReport }));
  });
}

export default new EmployerHiringAssessmentReportController();
