import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationDecisionService } from '../services/EmployerJobApplicationDecisionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerJobApplicationDecisionController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/decisions — requires INTERVIEWS_MANAGE. */
  public createDecision = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { decisionType, reasonCode, notes } = req.body;

    const decision = await employerJobApplicationDecisionService.createDecision(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      decisionType,
      reasonCode,
      notes
    );

    res.status(201).json(successResponse('Decision recorded successfully', { decision }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/decisions — requires ORGANIZATION_VIEW. */
  public getDecisions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerJobApplicationDecisionService.getDecisions(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Decisions retrieved successfully', result));
  });
}

export default new EmployerJobApplicationDecisionController();
