import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAnswerConfidenceService } from '../services/EmployerHiringAnswerConfidenceService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only, observable confidence/uncertainty intelligence (26B) — never lie detection, never a truth/personality score. */
export class EmployerHiringAnswerConfidenceController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionId/confidence-signals — requires ORGANIZATION_VIEW. Never generates. */
  public getConfidenceSignals = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionId } = req.params;
    const result = await employerHiringAnswerConfidenceService.getAnswerConfidenceSignals(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionId)
    );

    res.status(200).json(successResponse('Confidence signals retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionId/confidence-signals/generate — requires INTERVIEWS_MANAGE. No client artifact IDs accepted. */
  public generateConfidenceSignals = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionId } = req.params;
    const result = await employerHiringAnswerConfidenceService.generateAnswerConfidenceSignals(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionId)
    );

    res.status(200).json(successResponse('Confidence signals generated successfully', result));
  });
}

export default new EmployerHiringAnswerConfidenceController();
