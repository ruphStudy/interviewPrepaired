import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewCompetencyCoverageService } from '../services/EmployerInterviewCompetencyCoverageService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, deterministic (no AI) LIVE competency coverage overlay (27C). Never exposed to any public/candidate-facing API. */
export class EmployerInterviewCompetencyCoverageController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/competency-coverage — requires ORGANIZATION_VIEW. Never builds. */
  public getCoverage = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewCompetencyCoverageService.getCoverage(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Competency coverage retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/competency-coverage/build — requires INTERVIEWS_MANAGE. Deterministic; no client graph/question IDs accepted. */
  public buildCoverage = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewCompetencyCoverageService.buildCoverage(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Competency coverage built successfully', result));
  });
}

export default new EmployerInterviewCompetencyCoverageController();
