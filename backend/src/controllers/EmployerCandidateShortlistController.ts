import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateShortlistService } from '../services/EmployerCandidateShortlistService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateShortlistController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/shortlist
   * Requires INTERVIEWS_MANAGE. No body — an explicit recruiter action, never automatic.
   */
  public shortlistApplication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const decision = await employerCandidateShortlistService.shortlistApplication(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Candidate shortlisted successfully', { decision }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/shortlist — requires ORGANIZATION_VIEW. */
  public getApplicationShortlist = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const decision = await employerCandidateShortlistService.getCurrentShortlistDecision(
      context.organizationId,
      context.role,
      applicationId
    );

    res.status(200).json(successResponse('Shortlist decision retrieved successfully', { decision }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/shortlist — requires ORGANIZATION_VIEW. */
  public getJobShortlist = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const result = await employerCandidateShortlistService.getJobShortlist(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job shortlist retrieved successfully', result));
  });
}

export default new EmployerCandidateShortlistController();
