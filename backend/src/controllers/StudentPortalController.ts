import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { studentPortalService } from '../services/StudentPortalService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Student self-service portal (13A). Every method here runs behind
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
}

export default new StudentPortalController();
