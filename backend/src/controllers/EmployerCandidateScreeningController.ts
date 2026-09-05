import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateScreeningService } from '../services/EmployerCandidateScreeningService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateScreeningController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/screening
   * Requires INTERVIEWS_MANAGE. No body. Screens against the CURRENT
   * finalized JD snapshot and resolved resume analysis only.
   */
  public screenApplication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const screening = await employerCandidateScreeningService.screenApplication(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Application screened successfully', { screening }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screening — requires ORGANIZATION_VIEW. */
  public getCurrentScreening = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const screening = await employerCandidateScreeningService.getCurrentScreening(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Screening retrieved successfully', { screening }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/screenings — requires ORGANIZATION_VIEW. Optional history. */
  public getScreeningHistory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerCandidateScreeningService.getScreeningHistory(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Screening history retrieved successfully', result));
  });
}

export default new EmployerCandidateScreeningController();
