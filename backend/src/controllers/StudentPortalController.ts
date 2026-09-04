import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { studentPortalService } from '../services/StudentPortalService';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Student self-service portal (13A/13B). Every method here runs behind
 * `protect` only (see studentPortal.routes.ts) — the sole identity used is
 * the authenticated `req.user._id`, never a query/body-supplied id.
 */
export class StudentPortalController {
  /** GET /api/v1/student-portal/dashboard */
  public getDashboard = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    const result = await studentPortalService.getDashboard(req.user._id.toString());

    res.status(200).json(successResponse('Student dashboard retrieved successfully', result));
  });

  /** GET /api/v1/student-portal/assignments */
  public getAssignments = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    const status = req.query.status as InstituteStudentInterviewAssignmentStatus | undefined;
    const organizationId = req.query.organizationId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await studentPortalService.getAssignments(req.user._id.toString(), {
      status,
      organizationId,
      page,
      limit,
    });

    res.status(200).json(successResponse('Assignments retrieved successfully', result));
  });

  /** GET /api/v1/student-portal/assignments/:assignmentId */
  public getAssignmentDetail = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    const { assignmentId } = req.params;
    const assignment = await studentPortalService.getAssignmentDetail(req.user._id.toString(), assignmentId);

    res.status(200).json(successResponse('Assignment retrieved successfully', { assignment }));
  });
}

export default new StudentPortalController();
