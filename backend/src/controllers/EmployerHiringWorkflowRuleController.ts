import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringWorkflowRuleService } from '../services/EmployerHiringWorkflowRuleService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) hiring workflow rule CRUD (31C). Fixed, closed vocabularies only. */
export class EmployerHiringWorkflowRuleController {
  public createRule = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { jobId } = req.params;
    const result = await employerHiringWorkflowRuleService.createRule(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId,
      req.body
    );
    res.status(201).json(successResponse('Workflow rule created successfully', result));
  });

  public listRules = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { jobId } = req.params;
    const result = await employerHiringWorkflowRuleService.listRules(context.organizationId, context.role, jobId);
    res.status(200).json(successResponse('Workflow rules retrieved successfully', result));
  });

  public updateRule = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { jobId, ruleId } = req.params;
    const result = await employerHiringWorkflowRuleService.updateRule(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId,
      ruleId,
      req.body
    );
    res.status(200).json(successResponse('Workflow rule updated successfully', result));
  });

  public archiveRule = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { jobId, ruleId } = req.params;
    const result = await employerHiringWorkflowRuleService.archiveRule(context.organizationId, context.role, jobId, ruleId);
    res.status(200).json(successResponse('Workflow rule archived successfully', result));
  });
}

export const employerHiringWorkflowRuleController = new EmployerHiringWorkflowRuleController();
export default employerHiringWorkflowRuleController;
