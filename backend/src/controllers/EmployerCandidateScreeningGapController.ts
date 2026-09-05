import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateScreeningGapService } from '../services/EmployerCandidateScreeningGapService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateScreeningGapController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/screening/gaps
   * Requires INTERVIEWS_MANAGE. No body. Deterministic — if a gap analysis
   * already exists for the current completed screening, it is returned as-is.
   */
  public generateGaps = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const gap = await employerCandidateScreeningGapService.generateGaps(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Gap analysis generated successfully', { gap }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screening/gaps — requires ORGANIZATION_VIEW. Read-only. */
  public getGaps = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const gap = await employerCandidateScreeningGapService.getGaps(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Gap analysis retrieved successfully', { gap }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screenings/:screeningId/gaps — requires ORGANIZATION_VIEW. Optional historical read. */
  public getGapsForScreening = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { screeningId } = req.params;
    const gap = await employerCandidateScreeningGapService.getGapsForScreening(context.organizationId, context.role, screeningId);

    res.status(200).json(successResponse('Gap analysis retrieved successfully', { gap }));
  });
}

export default new EmployerCandidateScreeningGapController();
