import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringKnowledgeGroundedEvaluationService } from '../services/EmployerHiringKnowledgeGroundedEvaluationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Optional, employer-internal knowledge-grounded answer evaluation (29E). Never exposed to any candidate/public API. */
export class EmployerHiringKnowledgeGroundedEvaluationController {
  public generateEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionIndex } = req.params;
    const result = await employerHiringKnowledgeGroundedEvaluationService.generateEvaluation(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionIndex)
    );
    res.status(200).json(successResponse('Knowledge-grounded evaluation processed', result));
  });

  public getEvaluation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionIndex } = req.params;
    const result = await employerHiringKnowledgeGroundedEvaluationService.getEvaluation(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionIndex)
    );
    res.status(200).json(successResponse('Knowledge-grounded evaluation retrieved', result));
  });
}

export const employerHiringKnowledgeGroundedEvaluationController = new EmployerHiringKnowledgeGroundedEvaluationController();
export default employerHiringKnowledgeGroundedEvaluationController;
