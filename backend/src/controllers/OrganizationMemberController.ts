import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { organizationMemberService } from '../services/OrganizationMemberService';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

export class OrganizationMemberController {
  /**
   * GET /api/v1/organizations/:organizationId/members
   * Owner-only. Sprint 8B — no RBAC yet.
   */
  public getMembers = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { organizationId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const role = req.query.role as OrganizationMemberRole | undefined;
    const status = req.query.status as OrganizationMemberStatus | undefined;

    const result = await organizationMemberService.getMembers(userId, organizationId, { page, limit, role, status });

    res.status(200).json(successResponse('Organization members retrieved successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/members
   * Adds an existing, active registered user. Owner-only.
   */
  public addMember = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { organizationId } = req.params;
    const { userId: targetUserId, role } = req.body;

    const member = await organizationMemberService.addMember(userId, organizationId, { userId: targetUserId, role });

    res.status(201).json(successResponse('Member added successfully', { member }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/members/:memberId
   * Owner-only. Role and/or status.
   */
  public updateMember = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { organizationId, memberId } = req.params;
    const { role, status } = req.body;

    const member = await organizationMemberService.updateMember(userId, organizationId, memberId, { role, status });

    res.status(200).json(successResponse('Member updated successfully', { member }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/members/:memberId
   * Soft deactivate only. Owner-only.
   */
  public removeMember = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { organizationId, memberId } = req.params;
    await organizationMemberService.removeMember(userId, organizationId, memberId);

    res.status(200).json(successResponse('Member removed successfully', null));
  });
}

export default new OrganizationMemberController();
