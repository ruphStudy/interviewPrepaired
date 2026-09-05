import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateScreeningScoreService } from '../services/EmployerCandidateScreeningScoreService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateScreeningScoreController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/screening/score
   * Requires INTERVIEWS_MANAGE. No body. Deterministic — if a score already
   * exists for the current completed screening, it is returned as-is.
   */
  public generateScore = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const score = await employerCandidateScreeningScoreService.generateScore(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Explainable score calculated successfully', { score }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screening/score — requires ORGANIZATION_VIEW. Read-only. */
  public getScore = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const score = await employerCandidateScreeningScoreService.getScore(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Explainable score retrieved successfully', { score }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screenings/:screeningId/score — requires ORGANIZATION_VIEW. Optional historical read. */
  public getScoreForScreening = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { screeningId } = req.params;
    const score = await employerCandidateScreeningScoreService.getScoreForScreening(context.organizationId, context.role, screeningId);

    res.status(200).json(successResponse('Explainable score retrieved successfully', { score }));
  });
}

export default new EmployerCandidateScreeningScoreController();
