import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationMemberService } from '../services/OrganizationMemberService';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class OrganizationMemberController {
  /**
   * GET /api/v1/organizations/:organizationId/members
   * Requires MEMBERS_VIEW.
   */
  public getMembers = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const role = req.query.role as OrganizationMemberRole | undefined;
    const status = req.query.status as OrganizationMemberStatus | undefined;

    const result = await organizationMemberService.getMembers(context.organizationId, context.role, {
      page,
      limit,
      role,
      status,
    });

    res.status(200).json(successResponse('Organization members retrieved successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/members
   * Requires MEMBERS_MANAGE. Adds an existing, active registered user.
   */
  public addMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { userId: targetUserId, role } = req.body;
    const member = await organizationMemberService.addMember(context.organizationId, context.role, {
      userId: targetUserId,
      role,
    });

    res.status(201).json(successResponse('Member added successfully', { member }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/members/:memberId
   * Requires MEMBERS_MANAGE. Role and/or status.
   */
  public updateMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { memberId } = req.params;
    const { role, status } = req.body;

    const member = await organizationMemberService.updateMember(context.organizationId, context.role, memberId, {
      role,
      status,
    });

    res.status(200).json(successResponse('Member updated successfully', { member }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/members/:memberId
   * Requires MEMBERS_MANAGE. Soft deactivate only.
   */
  public removeMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { memberId } = req.params;
    await organizationMemberService.removeMember(context.organizationId, context.role, memberId);

    res.status(200).json(successResponse('Member removed successfully', null));
  });
}

export default new OrganizationMemberController();
