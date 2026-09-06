import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewScenarioService } from '../services/EmployerInterviewScenarioService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal scenario definitions (28A) — no AI, manual employer input only. */
export class EmployerInterviewScenarioController {
  public createScenario = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewScenarioService.createScenario(
      context.organizationId,
      context.role,
      interviewId,
      context.member._id.toString(),
      req.body
    );

    res.status(201).json(successResponse('Scenario created successfully', result));
  });

  public updateScenario = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioService.updateScenario(context.organizationId, context.role, interviewId, scenarioId, req.body);

    res.status(200).json(successResponse('Scenario updated successfully', result));
  });

  public archiveScenario = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioService.archiveScenario(context.organizationId, context.role, interviewId, scenarioId);

    res.status(200).json(successResponse('Scenario archived successfully', result));
  });

  public listScenarios = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewScenarioService.listScenarios(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Scenarios retrieved successfully', result));
  });

  public getScenario = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioService.getScenario(context.organizationId, context.role, interviewId, scenarioId);

    res.status(200).json(successResponse('Scenario retrieved successfully', result));
  });
}

export default new EmployerInterviewScenarioController();
