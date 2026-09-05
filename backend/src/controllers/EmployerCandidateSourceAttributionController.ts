import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateSourceAttributionService } from '../services/EmployerCandidateSourceAttributionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateSourceAttributionController {
  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/source-attributions — requires ORGANIZATION_VIEW. */
  public getAttributions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const result = await employerCandidateSourceAttributionService.getAttributions(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Source attributions retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/source-attributions/:attributionId — requires ORGANIZATION_VIEW. */
  public getAttribution = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId, attributionId } = req.params;
    const attribution = await employerCandidateSourceAttributionService.getAttributionById(
      context.organizationId,
      context.role,
      candidateId,
      attributionId
    );

    res.status(200).json(successResponse('Source attribution retrieved successfully', { attribution }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/candidates/:candidateId/source-attributions
   * Requires INTERVIEWS_MANAGE. Append-only — no update/delete method exists.
   * `recordedByMembershipId` is always the caller's own trusted membership
   * id — never accepted from the request body.
   */
  public createAttribution = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const { source, sourceName, externalReferenceId, referrerName, referrerEmail, agencyName, jobPortalName, campaignName, sourceUrl, notes } =
      req.body;

    const attribution = await employerCandidateSourceAttributionService.createAttribution(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      candidateId,
      { source, sourceName, externalReferenceId, referrerName, referrerEmail, agencyName, jobPortalName, campaignName, sourceUrl, notes }
    );

    res.status(201).json(successResponse('Source attribution recorded successfully', { attribution }));
  });
}

export default new EmployerCandidateSourceAttributionController();
