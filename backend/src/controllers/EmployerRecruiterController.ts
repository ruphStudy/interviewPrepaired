import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerRecruiterService } from '../services/EmployerRecruiterService';
import { OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerRecruiterController {
  /**
   * GET /api/v1/organizations/:organizationId/recruiters
   * Requires MEMBERS_VIEW.
   */
  public getRecruiters = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as OrganizationMemberStatus | undefined;
    const search = req.query.search as string | undefined;

    const result = await employerRecruiterService.getRecruiters(context.organizationId, context.role, { page, limit, status, search });

    res.status(200).json(successResponse('Employer recruiters retrieved successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/recruiters/invite
   * Requires MEMBERS_MANAGE (enforced inside createInvitation). Onboards a
   * Recruiter whose email may or may not already have a User account.
   */
  public inviteRecruiter = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, email } = req.body;
    const invitation = await employerRecruiterService.inviteRecruiter(context.organizationId, context.role, req.user!.id, { name, email });

    res.status(201).json(successResponse('Recruiter invitation sent successfully', { invitation }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/recruiters/invitations
   * Requires MEMBERS_VIEW. Lists pending/all RECRUITER-role invitations (not yet reflected as an active membership).
   */
  public getRecruiterInvitations = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as OrganizationInvitationStatus | undefined;

    const result = await employerRecruiterService.listRecruiterInvitations(context.organizationId, context.role, { page, limit, status });

    res.status(200).json(successResponse('Recruiter invitations retrieved successfully', result));
  });
}

export default new EmployerRecruiterController();
