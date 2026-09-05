import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationCollaborationService } from '../services/EmployerJobApplicationCollaborationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerJobApplicationCollaborationController {
  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/collaborators — requires ORGANIZATION_VIEW. */
  public getCollaborators = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerJobApplicationCollaborationService.getCollaborators(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Collaborators retrieved successfully', result));
  });

  /** POST/PUT /api/v1/organizations/:organizationId/applications/:applicationId/collaborators — requires INTERVIEWS_MANAGE. */
  public assignCollaborator = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { membershipId, collaborationRole } = req.body;

    const collaborator = await employerJobApplicationCollaborationService.assignCollaborator(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      { membershipId, collaborationRole }
    );

    res.status(200).json(successResponse('Collaborator assigned successfully', { collaborator }));
  });

  /** DELETE /api/v1/organizations/:organizationId/applications/:applicationId/collaborators/:membershipId — requires INTERVIEWS_MANAGE. */
  public removeCollaborator = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId, membershipId } = req.params;
    await employerJobApplicationCollaborationService.removeCollaborator(context.organizationId, context.role, applicationId, membershipId);

    res.status(200).json(successResponse('Collaborator removed successfully', null));
  });
}

export default new EmployerJobApplicationCollaborationController();
