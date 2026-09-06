import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewGraphService } from '../services/EmployerInterviewGraphService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, deterministic (no AI) interview structure graph (27A). Never exposed to any public/candidate-facing API. */
export class EmployerInterviewGraphController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/graph — requires ORGANIZATION_VIEW. Never builds. */
  public getGraph = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewGraphService.getInterviewGraph(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Interview graph retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/graph/build — requires INTERVIEWS_MANAGE. Deterministic; no client artifact IDs accepted. */
  public buildGraph = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewGraphService.buildInterviewGraph(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Interview graph built successfully', result));
  });
}

export default new EmployerInterviewGraphController();
