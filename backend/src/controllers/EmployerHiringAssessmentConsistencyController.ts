import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringAssessmentConsistencyService } from '../services/EmployerHiringAssessmentConsistencyService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only, observable answer-to-answer consistency intelligence (26C) — never deception/lie detection. */
export class EmployerHiringAssessmentConsistencyController {
  /** GET /api/v1/organizations/:organizationId/interviews/:interviewId/consistency — requires ORGANIZATION_VIEW. Never generates. */
  public getConsistency = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringAssessmentConsistencyService.getAssessmentConsistency(context.organizationId, context.role, interviewId);

    res.status(200).json(successResponse('Consistency analysis retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interviews/:interviewId/consistency/generate — requires INTERVIEWS_MANAGE. No client artifact IDs accepted. */
  public generateConsistency = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerHiringAssessmentConsistencyService.generateAssessmentConsistency(
      context.organizationId,
      context.role,
      interviewId
    );

    res.status(200).json(successResponse('Consistency analysis generated successfully', result));
  });
}

export default new EmployerHiringAssessmentConsistencyController();
