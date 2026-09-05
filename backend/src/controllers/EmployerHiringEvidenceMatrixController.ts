import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringEvidenceMatrixService } from '../services/EmployerHiringEvidenceMatrixService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringEvidenceMatrixController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/evidence — requires INTERVIEWS_MANAGE. */
  public createMatrix = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const evidence = await employerHiringEvidenceMatrixService.createMatrix(context.organizationId, context.role, applicationId);

    res.status(201).json(successResponse('Evidence analysis generated successfully', { evidence }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session/evidence — requires ORGANIZATION_VIEW. */
  public getMatrix = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const evidence = await employerHiringEvidenceMatrixService.getMatrix(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Evidence analysis retrieved successfully', { evidence }));
  });
}

export default new EmployerHiringEvidenceMatrixController();
