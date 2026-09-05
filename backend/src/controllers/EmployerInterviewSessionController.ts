import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewSessionService } from '../services/EmployerInterviewSessionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerInterviewSessionController {
  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-session — requires ORGANIZATION_VIEW. */
  public getCurrentSession = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const session = await employerInterviewSessionService.getCurrentSession(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview session retrieved successfully', { session }));
  });
}

export default new EmployerInterviewSessionController();
