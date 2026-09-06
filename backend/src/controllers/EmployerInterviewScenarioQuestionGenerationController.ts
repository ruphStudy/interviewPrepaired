import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewScenarioQuestionGenerationService } from '../services/EmployerInterviewScenarioQuestionGenerationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal scenario question-plan generation (28B) — no candidate execution, no response evaluation. */
export class EmployerInterviewScenarioQuestionGenerationController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/scenarios/:scenarioId/questions — requires ORGANIZATION_VIEW. Never generates. */
  public getScenarioQuestions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioQuestionGenerationService.getScenarioQuestions(
      context.organizationId,
      context.role,
      interviewId,
      scenarioId
    );

    res.status(200).json(successResponse('Scenario questions retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/scenarios/:scenarioId/questions/generate — requires INTERVIEWS_MANAGE. No client rubric/application/job IDs. */
  public generateScenarioQuestions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioQuestionGenerationService.generateScenarioQuestions(
      context.organizationId,
      context.role,
      interviewId,
      scenarioId
    );

    res.status(200).json(successResponse('Scenario questions generated successfully', result));
  });
}

export default new EmployerInterviewScenarioQuestionGenerationController();
