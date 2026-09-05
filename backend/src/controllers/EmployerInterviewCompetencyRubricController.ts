import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewCompetencyRubricService } from '../services/EmployerInterviewCompetencyRubricService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerInterviewCompetencyRubricController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprint/rubric
   * Requires INTERVIEWS_MANAGE. No body, no AI call — deterministic only.
   */
  public generateRubric = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const rubric = await employerInterviewCompetencyRubricService.generateRubric(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Interview evaluation rubric generated successfully', { rubric }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprint/rubric — requires ORGANIZATION_VIEW. */
  public getCurrentRubric = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const rubric = await employerInterviewCompetencyRubricService.getCurrentRubric(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview evaluation rubric retrieved successfully', { rubric }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprints/:blueprintId/rubric — requires ORGANIZATION_VIEW. Optional historical read. */
  public getRubricForBlueprint = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId, blueprintId } = req.params;
    const rubric = await employerInterviewCompetencyRubricService.getRubricForBlueprint(
      context.organizationId,
      context.role,
      applicationId,
      blueprintId
    );

    res.status(200).json(successResponse('Interview evaluation rubric retrieved successfully', { rubric }));
  });
}

export default new EmployerInterviewCompetencyRubricController();
