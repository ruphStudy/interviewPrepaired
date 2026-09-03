import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerService } from '../services/InstituteTrainerService';
import { OrganizationMemberStatus } from '../constants/organizationMember';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteTrainerController {
  /**
   * GET /api/v1/organizations/:organizationId/trainers
   * Requires MEMBERS_VIEW.
   */
  public getTrainers = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as OrganizationMemberStatus | undefined;
    const search = req.query.search as string | undefined;

    const result = await instituteTrainerService.getTrainers(context.organizationId, context.role, {
      page,
      limit,
      status,
      search,
    });

    res.status(200).json(successResponse('Institute trainers retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/trainers/:membershipId
   * Requires MEMBERS_VIEW.
   */
  public getTrainer = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { membershipId } = req.params;
    const trainer = await instituteTrainerService.getTrainerByMembershipId(context.organizationId, context.role, membershipId);

    res.status(200).json(successResponse('Institute trainer retrieved successfully', { trainer }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/trainers/:membershipId/profile
   * Requires MEMBERS_MANAGE. PATCH-like merge; creates the profile lazily if absent.
   */
  public updateTrainerProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { membershipId } = req.params;
    const { employeeCode, designation, department, specialization, bio } = req.body;

    const trainer = await instituteTrainerService.updateTrainerProfile(context.organizationId, context.role, membershipId, {
      employeeCode,
      designation,
      department,
      specialization,
      bio,
    });

    res.status(200).json(successResponse('Trainer profile updated successfully', { trainer }));
  });
}

export default new InstituteTrainerController();
