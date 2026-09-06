import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewScenarioResponseEvaluationService } from '../services/EmployerInterviewScenarioResponseEvaluationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal scenario response evidence evaluation (28C) — never exposed to the candidate. */
export class EmployerInterviewScenarioResponseEvaluationController {
  /** GET .../responses/:questionSequence/evaluate — requires ORGANIZATION_VIEW. Never generates. */
  public getEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId, questionSequence } = req.params;
    const result = await employerInterviewScenarioResponseEvaluationService.getEvaluation(
      context.organizationId,
      context.role,
      interviewId,
      scenarioId,
      Number(questionSequence)
    );

    res.status(200).json(successResponse('Response evaluation retrieved successfully', result));
  });

  /** POST .../responses/:questionSequence/evaluate — requires INTERVIEWS_MANAGE. No client rubric/questionSet/application IDs. */
  public generateEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId, questionSequence } = req.params;
    const result = await employerInterviewScenarioResponseEvaluationService.generateEvaluation(
      context.organizationId,
      context.role,
      interviewId,
      scenarioId,
      Number(questionSequence)
    );

    res.status(200).json(successResponse('Response evaluation generated successfully', result));
  });
}

export default new EmployerInterviewScenarioResponseEvaluationController();
