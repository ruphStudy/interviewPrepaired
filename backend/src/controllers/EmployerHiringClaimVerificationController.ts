import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringClaimVerificationService } from '../services/EmployerHiringClaimVerificationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only internal claim/evidence-alignment intelligence (26D) — never external fact-checking, never lie/deception detection. */
export class EmployerHiringClaimVerificationController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/claim-verification — requires ORGANIZATION_VIEW. Never generates. */
  public getClaimVerification = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringClaimVerificationService.getClaimVerification(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Claim evidence alignment retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/claim-verification/generate — requires INTERVIEWS_MANAGE. No source artifact IDs accepted from the client. */
  public generateClaimVerification = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringClaimVerificationService.generateClaimVerification(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Claim evidence alignment generated successfully', result));
  });
}

export default new EmployerHiringClaimVerificationController();
