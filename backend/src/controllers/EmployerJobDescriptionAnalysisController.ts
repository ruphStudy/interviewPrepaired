import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobDescriptionAnalysisService } from '../services/EmployerJobDescriptionAnalysisService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobDescriptionAnalysisController {
  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/jd/analyze
   * Requires INTERVIEWS_MANAGE. No body. Parses the CURRENT JD source only.
   * `createdByMembershipId` (the parse actor) is always the caller's own
   * trusted membership id — never accepted from the request body.
   */
  public analyzeCurrentJobDescription = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const analysis = await employerJobDescriptionAnalysisService.analyzeCurrentJobDescription(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId
    );

    res.status(200).json(successResponse('Job description analyzed successfully', { analysis }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/analysis — requires ORGANIZATION_VIEW. */
  public getCurrentAnalysis = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const analysis = await employerJobDescriptionAnalysisService.getCurrentAnalysis(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job description analysis retrieved successfully', { analysis }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/:jdSourceId/analysis — requires ORGANIZATION_VIEW. */
  public getAnalysisForSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, jdSourceId } = req.params;
    const analysis = await employerJobDescriptionAnalysisService.getAnalysisForSource(
      context.organizationId,
      context.role,
      jobId,
      jdSourceId
    );

    res.status(200).json(successResponse('Job description analysis retrieved successfully', { analysis }));
  });
}

export default new EmployerJobDescriptionAnalysisController();
