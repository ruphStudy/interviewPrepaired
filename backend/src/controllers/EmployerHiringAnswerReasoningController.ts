import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAnswerReasoningService } from '../services/EmployerHiringAnswerReasoningService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only, observable-reasoning-evidence intelligence (26A) — never chain-of-thought, never hiring recommendation. */
export class EmployerHiringAnswerReasoningController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionId/reasoning-signals — requires ORGANIZATION_VIEW. Never generates. */
  public getReasoningSignals = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionId } = req.params;
    const result = await employerHiringAnswerReasoningService.getAnswerReasoningSignals(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionId)
    );

    res.status(200).json(successResponse('Reasoning signals retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionId/reasoning-signals/generate — requires INTERVIEWS_MANAGE. No client artifact IDs accepted. */
  public generateReasoningSignals = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionId } = req.params;
    const result = await employerHiringAnswerReasoningService.generateAnswerReasoningSignals(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionId)
    );

    res.status(200).json(successResponse('Reasoning signals generated successfully', result));
  });
}

export default new EmployerHiringAnswerReasoningController();
