import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewBlueprintService } from '../services/EmployerInterviewBlueprintService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerInterviewBlueprintController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprint
   * Requires INTERVIEWS_MANAGE. No body. Generates against the CURRENT
   * applicable screening/score/(optional) gap and finalized JD snapshot only.
   */
  public generateBlueprint = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const blueprint = await employerInterviewBlueprintService.generateBlueprint(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Interview blueprint generated successfully', { blueprint }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprint — requires ORGANIZATION_VIEW. */
  public getCurrentBlueprint = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const blueprint = await employerInterviewBlueprintService.getCurrentBlueprint(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview blueprint retrieved successfully', { blueprint }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-blueprints — requires ORGANIZATION_VIEW. Optional history. */
  public getBlueprintHistory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerInterviewBlueprintService.getBlueprintHistory(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview blueprint history retrieved successfully', result));
  });
}

export default new EmployerInterviewBlueprintController();
