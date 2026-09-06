import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewFollowUpRouteService } from '../services/EmployerInterviewFollowUpRouteService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal dynamic follow-up routing (27B) — hiring-assessment routing, never coaching. Never exposed to any public/candidate-facing API. */
export class EmployerInterviewFollowUpRouteController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionIndex/follow-up-route — requires ORGANIZATION_VIEW. Never generates. */
  public getFollowUpRoute = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionIndex } = req.params;
    const result = await employerInterviewFollowUpRouteService.getFollowUpRoute(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionIndex)
    );

    res.status(200).json(successResponse('Follow-up route retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/questions/:questionIndex/follow-up-route — requires INTERVIEWS_MANAGE. No client graph/rubric/evaluation IDs accepted. */
  public generateFollowUpRoute = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId, questionIndex } = req.params;
    const result = await employerInterviewFollowUpRouteService.generateFollowUpRoute(
      context.organizationId,
      context.role,
      interviewId,
      Number(questionIndex)
    );

    res.status(200).json(successResponse('Follow-up route generated successfully', result));
  });
}

export default new EmployerInterviewFollowUpRouteController();
