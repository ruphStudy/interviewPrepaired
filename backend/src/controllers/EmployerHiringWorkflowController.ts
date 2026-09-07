import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringWorkflowService } from '../services/EmployerHiringWorkflowService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Manual workflow re-evaluation + execution history (31C). */
export class EmployerHiringWorkflowController {
  public evaluateTrigger = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { applicationId } = req.params;
    const { trigger, interviewId } = req.body ?? {};
    const result = await employerHiringWorkflowService.evaluateTrigger({
      organizationId: context.organizationId,
      applicationId,
      interviewId: typeof interviewId === 'string' ? interviewId : undefined,
      trigger,
    });
    res.status(200).json(successResponse('Workflow evaluation processed', result));
  });

  public listExecutions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { applicationId } = req.params;
    const result = await employerHiringWorkflowService.listExecutions(context.organizationId, context.role, applicationId);
    res.status(200).json(successResponse('Workflow executions retrieved successfully', result));
  });
}

export const employerHiringWorkflowController = new EmployerHiringWorkflowController();
export default employerHiringWorkflowController;
