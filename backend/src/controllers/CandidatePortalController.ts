import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { candidatePortalService } from '../services/CandidatePortalService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Candidate self-service portal. Every method here runs behind `protect`
 * only (see candidatePortal.routes.ts) — the sole identity used is the
 * authenticated `req.user._id`, never a query/body-supplied id, mirroring
 * StudentPortalController exactly.
 */
export class CandidatePortalController {
  /** GET /api/v1/candidate-portal/dashboard */
  public getDashboard = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }
    const result = await candidatePortalService.getDashboard(req.user._id.toString());
    res.status(200).json(successResponse('Candidate dashboard retrieved successfully', result));
  });

  /** GET /api/v1/candidate-portal/assessments */
  public listAssessments = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }
    const organizationId = req.query.organizationId as string | undefined;
    const status = req.query.status as any;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await candidatePortalService.listAssessments(req.user._id.toString(), { organizationId, status, page, limit });
    res.status(200).json(successResponse('Assessments retrieved successfully', result));
  });

  /** GET /api/v1/candidate-portal/assessments/:invitationId */
  public getAssessmentDetail = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }
    const { invitationId } = req.params;
    const assessment = await candidatePortalService.getAssessmentDetail(req.user._id.toString(), invitationId);
    res.status(200).json(successResponse('Assessment retrieved successfully', { assessment }));
  });

  /** GET /api/v1/candidate-portal/history */
  public getHistory = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }
    const organizationId = req.query.organizationId as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await candidatePortalService.getHistory(req.user._id.toString(), { organizationId, page, limit });
    res.status(200).json(successResponse('Assessment history retrieved successfully', result));
  });
}

export default new CandidatePortalController();
