import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerStudentReportService } from '../services/InstituteTrainerStudentReportService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(REPORTS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteTrainerStudentReportController {
  /** GET /api/v1/organizations/:organizationId/trainer-students/:studentId/reports */
  public getReports = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await instituteTrainerStudentReportService.getReports(
      context.organizationId,
      context.role,
      context.member._id,
      studentId,
      { page, limit }
    );

    res.status(200).json(successResponse('Student reports retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/trainer-students/:studentId/reports/:assignmentId */
  public getReportDetail = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId, assignmentId } = req.params;

    const result = await instituteTrainerStudentReportService.getReportDetail(
      context.organizationId,
      context.role,
      context.member._id,
      studentId,
      assignmentId
    );

    res.status(200).json(successResponse('Student report retrieved successfully', result));
  });
}

export default new InstituteTrainerStudentReportController();
