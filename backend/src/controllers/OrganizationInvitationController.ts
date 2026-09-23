import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationInvitationService } from '../services/OrganizationInvitationService';
import { organizationProvisioningAuditService } from '../services/OrganizationProvisioningAuditService';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { ApiError } from '../utils/ApiError';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { env } from '../config/environment';

/** Org-scoped methods run behind `requireOrganizationPermission(MEMBERS_MANAGE)` (see organization.routes.ts) — `req.organizationContext` is always present by the time those run. */
export class OrganizationInvitationController {
  /**
   * POST /api/v1/organizations/:organizationId/invitations
   * Requires MEMBERS_MANAGE. Sends the invitation email — the raw token is
   * included in the response ONLY outside production (local/dev testing
   * convenience); a production deployment never exposes it, so the
   * invitee's own email is the only path to the acceptance link.
   */
  public createInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { email, role } = req.body;
    const { invitation, token } = await organizationInvitationService.createInvitation(
      context.organizationId,
      context.role,
      context.member.userId.toString(),
      { email, role }
    );

    const payload: Record<string, unknown> = { invitation };
    if (env.nodeEnv !== 'production') {
      payload.token = token;
    }

    res.status(201).json(createdResponse('Invitation created successfully', payload));
  });

  /**
   * GET /api/v1/organizations/:organizationId/invitations
   * Requires MEMBERS_MANAGE — invitation visibility is administrative, not MEMBERS_VIEW.
   */
  public getInvitations = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as OrganizationInvitationStatus | undefined;
    const role = req.query.role as OrganizationMemberRole | undefined;

    const result = await organizationInvitationService.getInvitations(context.organizationId, context.role, {
      page,
      limit,
      status,
      role,
    });

    res.status(200).json(successResponse('Invitations retrieved successfully', result));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/invitations/:invitationId
   * Requires MEMBERS_MANAGE. Revokes, never deletes.
   */
  public revokeInvitation = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { invitationId } = req.params;
    const invitation = await organizationInvitationService.revokeInvitation(
      context.organizationId,
      context.role,
      invitationId
    );

    res.status(200).json(successResponse('Invitation revoked successfully', { invitation }));
  });

  /**
   * GET /api/v1/organization-invitations/:token
   * Public — no auth. Returns a masked-safe summary so a not-yet-registered
   * invitee can see what they're accepting before signing in.
   */
  public getInvitationByToken = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const summary = await organizationInvitationService.getInvitationByToken(token);
    res.status(200).json(successResponse('Invitation retrieved successfully', summary));
  });

  /**
   * POST /api/v1/organization-invitations/:token/accept
   * Requires an authenticated user whose account email matches the invite.
   */
  public acceptInvitation = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!userId || !userEmail) {
      throw new ApiError(401, 'Authentication required');
    }

    const { token } = req.params;
    const result = await organizationInvitationService.acceptInvitation(token, userId, userEmail);

    // D3 — an existing owner accepting their notification invitation (never
    // a regular member invite) is a provisioning-domain event worth
    // auditing. Best-effort, never blocks the response.
    const membership = (result as any).membership;
    if (membership?.role === OrganizationMemberRole.OWNER) {
      await organizationProvisioningAuditService.record('owner_invitation_accepted', {
        actorUserId: userId,
        organizationId: (result as any).organization?.id,
        targetUserId: userId,
      });
    }

    res.status(200).json(successResponse('Invitation accepted successfully', result));
  });

  /**
   * POST /api/v1/organization-invitations/:token/activate
   * Public — no auth (D2). Only for a NEW Super-Admin-provisioned owner
   * completing account activation: sets their real password and returns a
   * login token so the frontend can land them straight in their
   * organization dashboard. A regular member invite (any non-OWNER role)
   * is rejected here — those invitees already have an account and use
   * the `/accept` endpoint above instead.
   */
  public activateOwnerAccount = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const { password } = req.body;
    const result = await organizationInvitationService.activateOwnerAccount(token, password);
    const activatedUserId = (result.user as any)?._id?.toString();

    await organizationProvisioningAuditService.record('owner_activation_completed', {
      actorUserId: activatedUserId,
      organizationId: (result.organization as any)?.id,
      targetUserId: activatedUserId,
    });

    res.status(200).json(successResponse('Account activated successfully', result));
  });
}

export default new OrganizationInvitationController();
