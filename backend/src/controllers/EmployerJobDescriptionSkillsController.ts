import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobDescriptionSkillsService } from '../services/EmployerJobDescriptionSkillsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobDescriptionSkillsController {
  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/jd/skills/extract
   * Requires INTERVIEWS_MANAGE. No body. Extracts skills from the CURRENT
   * JD source's already-COMPLETED 17B analysis only. `createdByMembershipId`
   * (the extraction actor) is always the caller's own trusted membership id
   * — never accepted from the request body.
   */
  public extractCurrentSkills = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const skills = await employerJobDescriptionSkillsService.extractCurrentSkills(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId
    );

    res.status(200).json(successResponse('Job description skills extracted successfully', { skills }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/skills — requires ORGANIZATION_VIEW. */
  public getCurrentSkills = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const skills = await employerJobDescriptionSkillsService.getCurrentSkills(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job description skills retrieved successfully', { skills }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/:jdSourceId/skills — requires ORGANIZATION_VIEW. */
  public getSkillsForSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, jdSourceId } = req.params;
    const skills = await employerJobDescriptionSkillsService.getSkillsForSource(
      context.organizationId,
      context.role,
      jobId,
      jdSourceId
    );

    res.status(200).json(successResponse('Job description skills retrieved successfully', { skills }));
  });
}

export default new EmployerJobDescriptionSkillsController();
