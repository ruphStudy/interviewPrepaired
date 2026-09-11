import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewInvitationService } from '../services/EmployerInterviewInvitationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { env } from '../config/environment';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerInterviewInvitationController {
  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation
   * Requires INTERVIEWS_MANAGE. Sends the candidate email automatically —
   * the raw token is included in the response ONLY outside production.
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

    res.status(201).json(successResponse('Interview invitation created successfully', this.hideTokenInProduction(result)));
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

    res.status(200).json(successResponse('Interview invitation regenerated successfully', this.hideTokenInProduction(result)));
  });

  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/interview-invitation/retry-email
   * Requires INTERVIEWS_MANAGE. Re-attempts sending the SAME active
   * invitation's most recent delivery immediately — never rotates the
   * token, never creates a duplicate invitation.
   */
  public retryInvitationEmail = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const invitation = await employerInterviewInvitationService.retryInvitationEmail(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Interview invitation email retried', { invitation }));
  });

  /** Never exposes the raw token in production — local/dev testing convenience only. */
  private hideTokenInProduction(result: { invitation: Record<string, unknown>; token: string }): Record<string, unknown> {
    if (env.nodeEnv === 'production') {
      return { invitation: result.invitation };
    }
    return result;
  }

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
