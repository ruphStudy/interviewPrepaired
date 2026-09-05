import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobDescriptionCompetencyService } from '../services/EmployerJobDescriptionCompetencyService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobDescriptionCompetencyController {
  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/jd/competencies/generate
   * Requires INTERVIEWS_MANAGE. No body. Generates competencies from the
   * CURRENT JD source's already-COMPLETED 17B analysis and 17C skills only.
   * `createdByMembershipId` (the generation actor) is always the caller's
   * own trusted membership id — never accepted from the request body.
   */
  public generateCurrentCompetencies = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const competencies = await employerJobDescriptionCompetencyService.generateCurrentCompetencies(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId
    );

    res.status(200).json(successResponse('Job description competencies generated successfully', { competencies }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/competencies — requires ORGANIZATION_VIEW. */
  public getCurrentCompetencies = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const competencies = await employerJobDescriptionCompetencyService.getCurrentCompetencies(
      context.organizationId,
      context.role,
      jobId
    );

    res.status(200).json(successResponse('Job description competencies retrieved successfully', { competencies }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/:jdSourceId/competencies — requires ORGANIZATION_VIEW. */
  public getCompetenciesForSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, jdSourceId } = req.params;
    const competencies = await employerJobDescriptionCompetencyService.getCompetenciesForSource(
      context.organizationId,
      context.role,
      jobId,
      jdSourceId
    );

    res.status(200).json(successResponse('Job description competencies retrieved successfully', { competencies }));
  });
}

export default new EmployerJobDescriptionCompetencyController();
