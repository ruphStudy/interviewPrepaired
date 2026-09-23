import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerService } from '../services/InstituteTrainerService';
import { OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationInvitationStatus } from '../constants/organizationInvitation';
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
   * POST /api/v1/organizations/:organizationId/trainers/invite
   * Requires MEMBERS_MANAGE (enforced inside createInvitation). Onboards a
   * Trainer whose email may or may not already have a User account.
   */
  public inviteTrainer = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, email } = req.body;
    const invitation = await instituteTrainerService.inviteTrainer(context.organizationId, context.role, req.user!.id, { name, email });

    res.status(201).json(successResponse('Trainer invitation sent successfully', { invitation }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/trainers/invitations
   * Requires MEMBERS_VIEW. Lists pending/all TRAINER-role invitations (not yet reflected as an active membership).
   */
  public getTrainerInvitations = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as OrganizationInvitationStatus | undefined;

    const result = await instituteTrainerService.listTrainerInvitations(context.organizationId, context.role, { page, limit, status });

    res.status(200).json(successResponse('Trainer invitations retrieved successfully', result));
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
