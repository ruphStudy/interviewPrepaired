import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewScenarioReportService } from '../services/EmployerInterviewScenarioReportService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, deterministic (no AI) scenario performance report (28E). Never exposed to any public/candidate-facing API. */
export class EmployerInterviewScenarioReportController {
  /** GET .../scenarios/:scenarioId/report — requires REPORTS_VIEW. Never builds. */
  public getScenarioReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioReportService.getScenarioReport(context.organizationId, context.role, interviewId, scenarioId);

    res.status(200).json(successResponse('Scenario report retrieved successfully', result));
  });

  /** POST .../scenarios/:scenarioId/report/build — requires INTERVIEWS_MANAGE. Deterministic; no client session/questionSet/rubric/application/job IDs accepted. */
  public buildScenarioReport = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioReportService.buildScenarioReport(context.organizationId, context.role, interviewId, scenarioId);

    res.status(200).json(successResponse('Scenario report built successfully', result));
  });
}

export default new EmployerInterviewScenarioReportController();
