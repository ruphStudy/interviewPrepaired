import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationInvitationService } from '../services/OrganizationInvitationService';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { ApiError } from '../utils/ApiError';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Org-scoped methods run behind `requireOrganizationPermission(MEMBERS_MANAGE)` (see organization.routes.ts) — `req.organizationContext` is always present by the time those run. */
export class OrganizationInvitationController {
  /**
   * POST /api/v1/organizations/:organizationId/invitations
   * Requires MEMBERS_MANAGE. Returns the raw token exactly once — there is
   * no email-delivery layer yet, so the caller (an admin UI) is responsible
   * for relaying the acceptance link to the invitee out of band.
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

    res.status(201).json(createdResponse('Invitation created successfully', { invitation, token }));
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

    const result = await organizationInvitationService.getInvitations(context.organizationId, context.role, {
      page,
      limit,
      status,
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
    const invitation = await organizationInvitationService.acceptInvitation(token, userId, userEmail);

    res.status(200).json(successResponse('Invitation accepted successfully', { invitation }));
  });
}

export default new OrganizationInvitationController();
