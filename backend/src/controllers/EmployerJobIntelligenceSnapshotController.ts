import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobIntelligenceSnapshotService } from '../services/EmployerJobIntelligenceSnapshotService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobIntelligenceSnapshotController {
  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/jd/intelligence/finalize
   * Requires INTERVIEWS_MANAGE. No body. Finalizes the CURRENT JD source
   * only. `finalizedByMembershipId` is always the caller's own trusted
   * membership id — never accepted from the request body. NO AI call.
   */
  public finalizeCurrentIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const snapshot = await employerJobIntelligenceSnapshotService.finalizeCurrentIntelligence(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId
    );

    res.status(200).json(successResponse('Job description intelligence finalized successfully', { snapshot }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/intelligence — requires ORGANIZATION_VIEW. Includes a DB-derived readiness checklist. */
  public getCurrentIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const result = await employerJobIntelligenceSnapshotService.getCurrentIntelligence(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job description intelligence retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/jd/:jdSourceId/intelligence — requires ORGANIZATION_VIEW. */
  public getIntelligenceForSource = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, jdSourceId } = req.params;
    const snapshot = await employerJobIntelligenceSnapshotService.getIntelligenceForSource(
      context.organizationId,
      context.role,
      jobId,
      jdSourceId
    );

    res.status(200).json(successResponse('Job description intelligence retrieved successfully', { snapshot }));
  });
}

export default new EmployerJobIntelligenceSnapshotController();
