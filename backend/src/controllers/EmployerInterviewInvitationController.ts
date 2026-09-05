import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewInvitationService } from '../services/EmployerInterviewInvitationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerInterviewInvitationController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation
   * Requires INTERVIEWS_MANAGE. Returns the raw token ONLY in this response — never persisted, never returned again.
   */
  public createInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { expiresInDays, message } = req.body;

    const result = await employerInterviewInvitationService.createInvitation(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      { expiresInDays, message }
    );

    res.status(201).json(successResponse('Interview invitation created successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation — requires ORGANIZATION_VIEW. */
  public getCurrentInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const invitation = await employerInterviewInvitationService.getCurrentInvitation(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview invitation retrieved successfully', { invitation }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation/regenerate
   * Requires INTERVIEWS_MANAGE. Only when the existing invitation is expired or revoked.
   */
  public regenerateInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerInterviewInvitationService.regenerateInvitation(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview invitation regenerated successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation/revoke
   * Requires INTERVIEWS_MANAGE. Only when the existing invitation is active. No hard delete.
   */
  public revokeInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const invitation = await employerInterviewInvitationService.revokeInvitation(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview invitation revoked successfully', { invitation }));
  });
}

export default new EmployerInterviewInvitationController();
