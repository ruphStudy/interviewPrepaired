import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobDescriptionService } from '../services/EmployerJobDescriptionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobDescriptionController {
  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd — requires ORGANIZATION_VIEW. */
  public getJobDescription = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const result = await employerJobDescriptionService.getJobDescription(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job description retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/:jdSourceId — requires ORGANIZATION_VIEW. */
  public getJobDescriptionSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, jdSourceId } = req.params;
    const source = await employerJobDescriptionService.getJobDescriptionSourceById(
      context.organizationId,
      context.role,
      jobId,
      jdSourceId
    );

    res.status(200).json(successResponse('Job description version retrieved successfully', { source }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/jd
   * Requires INTERVIEWS_MANAGE. Always creates a NEW version — never
   * overwrites. `createdByMembershipId` is always the caller's own trusted
   * membership id — never accepted from the request body.
   */
  public createJobDescriptionSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const { rawText, sourceType } = req.body;

    const source = await employerJobDescriptionService.createJobDescriptionSource(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId,
      { rawText, sourceType }
    );

    res.status(201).json(successResponse('Job description version created successfully', { source }));
  });
}

export default new EmployerJobDescriptionController();
