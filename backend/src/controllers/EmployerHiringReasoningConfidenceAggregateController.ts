import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringReasoningConfidenceAggregateService } from '../services/EmployerHiringReasoningConfidenceAggregateService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Deterministic (no AI) assessment-level aggregate over 26A-26D (26E). */
export class EmployerHiringReasoningConfidenceAggregateController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/reasoning-confidence-aggregate — requires ORGANIZATION_VIEW. Never builds. */
  public getAggregate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringReasoningConfidenceAggregateService.getAggregate(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Reasoning & confidence overview retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/reasoning-confidence-aggregate/build — requires INTERVIEWS_MANAGE. Deterministic, no client artifact IDs accepted. */
  public buildAggregate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringReasoningConfidenceAggregateService.buildAggregate(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Reasoning & confidence overview built successfully', result));
  });
}

export default new EmployerHiringReasoningConfidenceAggregateController();
