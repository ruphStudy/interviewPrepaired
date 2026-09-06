import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewScenarioSessionService } from '../services/EmployerInterviewScenarioSessionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal, read-only scenario session progress (28D). */
export class EmployerInterviewScenarioSessionController {
  /** GET .../scenarios/:scenarioId/session — requires ORGANIZATION_VIEW. */
  public getSessionDetail = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, scenarioId } = req.params;
    const result = await employerInterviewScenarioSessionService.getSessionDetail(context.organizationId, context.role, interviewId, scenarioId);

    res.status(200).json(successResponse('Scenario session retrieved successfully', result));
  });
}

export default new EmployerInterviewScenarioSessionController();
