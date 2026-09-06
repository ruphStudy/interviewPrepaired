import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewAdaptiveRoutingService } from '../services/EmployerInterviewAdaptiveRoutingService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, deterministic (no AI) adaptive question-selection routing (27D). Never exposed to any public/candidate-facing API. */
export class EmployerInterviewAdaptiveRoutingController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/adaptive-routes — requires ORGANIZATION_VIEW. Read-only chronological history. */
  public getRouteHistory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewAdaptiveRoutingService.getRouteHistory(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Adaptive route history retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/adaptive-route — requires INTERVIEWS_MANAGE. Body may ONLY carry an optional `sourceQuestionIndex`; no candidate artifact IDs. */
  public selectNextQuestion = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const rawSourceQuestionIndex = req.body?.sourceQuestionIndex;
    const sourceQuestionIndex = typeof rawSourceQuestionIndex === 'number' ? rawSourceQuestionIndex : undefined;

    const result = await employerInterviewAdaptiveRoutingService.selectNextQuestion(
      context.organizationId,
      context.role,
      interviewId,
      sourceQuestionIndex
    );

    res.status(200).json(successResponse('Adaptive route selected successfully', result));
  });
}

export default new EmployerInterviewAdaptiveRoutingController();
