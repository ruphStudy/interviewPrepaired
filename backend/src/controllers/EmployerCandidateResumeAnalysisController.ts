import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateResumeAnalysisService } from '../services/EmployerCandidateResumeAnalysisService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateResumeAnalysisController {
  /**
   * POST /api/v1/organizations/:organizationId/candidates/:candidateId/resumes/analyze
   * Requires INTERVIEWS_MANAGE. No body. Parses the CURRENT resume only.
   * `createdByMembershipId` (the parse actor) is always the caller's own
   * trusted membership id — never accepted from the request body.
   */
  public analyzeCurrentResume = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const analysis = await employerCandidateResumeAnalysisService.analyzeCurrentResume(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      candidateId
    );

    res.status(200).json(successResponse('Resume analyzed successfully', { analysis }));
  });

  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/resumes/analysis — requires ORGANIZATION_VIEW. */
  public getCurrentAnalysis = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const analysis = await employerCandidateResumeAnalysisService.getCurrentAnalysis(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Resume analysis retrieved successfully', { analysis }));
  });

  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/resumes/:resumeSourceId/analysis — requires ORGANIZATION_VIEW. */
  public getAnalysisForSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId, resumeSourceId } = req.params;
    const analysis = await employerCandidateResumeAnalysisService.getAnalysisForSource(
      context.organizationId,
      context.role,
      candidateId,
      resumeSourceId
    );

    res.status(200).json(successResponse('Resume analysis retrieved successfully', { analysis }));
  });
}

export default new EmployerCandidateResumeAnalysisController();
