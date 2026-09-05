import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringPipelineService } from '../services/EmployerHiringPipelineService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringPipelineController {
  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/pipeline — requires ORGANIZATION_VIEW. */
  public getJobPipeline = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const pipeline = await employerHiringPipelineService.getJobPipeline(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Hiring pipeline retrieved successfully', pipeline));
  });

  /**
   * PATCH /api/v1/organizations/:organizationId/applications/:applicationId/pipeline-stage
   * Requires INTERVIEWS_MANAGE. Pure pass-through to
   * `EmployerJobApplicationService.updateApplicationStatus` — the single
   * lifecycle authority; its own transition map/409 behavior applies unchanged.
   */
  public moveApplicationStage = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { status } = req.body;

    const application = await employerHiringPipelineService.moveApplicationStage(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      status
    );

    res.status(200).json(successResponse('Application stage updated successfully', { application }));
  });
}

export default new EmployerHiringPipelineController();
