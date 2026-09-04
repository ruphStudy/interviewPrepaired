import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobHiringTeamService } from '../services/EmployerJobHiringTeamService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobHiringTeamController {
  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/hiring-team — requires ORGANIZATION_VIEW. */
  public getHiringTeam = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const hiringTeam = await employerJobHiringTeamService.getHiringTeam(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Hiring team retrieved successfully', { hiringTeam }));
  });

  /** GET /api/v1/organizations/:organizationId/jobs/:jobId/hiring-team/available-members — requires INTERVIEWS_MANAGE. */
  public getAvailableMembers = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const members = await employerJobHiringTeamService.getAvailableMembers(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Available members retrieved successfully', { members }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/hiring-team
   * Requires INTERVIEWS_MANAGE. `addedByMembershipId` is always the
   * caller's own trusted membership id — never accepted from the request body.
   */
  public addHiringTeamMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const { membershipId, role } = req.body;

    const teamMember = await employerJobHiringTeamService.addHiringTeamMember(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId,
      { membershipId, role }
    );

    res.status(201).json(successResponse('Hiring team member added successfully', { teamMember }));
  });

  /** PUT /api/v1/organizations/:organizationId/jobs/:jobId/hiring-team/:teamMemberId — requires INTERVIEWS_MANAGE. Only `role` is mutable. */
  public updateHiringTeamMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, teamMemberId } = req.params;
    const { role } = req.body;

    const teamMember = await employerJobHiringTeamService.updateHiringTeamMemberRole(
      context.organizationId,
      context.role,
      jobId,
      teamMemberId,
      role
    );

    res.status(200).json(successResponse('Hiring team member updated successfully', { teamMember }));
  });

  /** DELETE /api/v1/organizations/:organizationId/jobs/:jobId/hiring-team/:teamMemberId — requires INTERVIEWS_MANAGE. */
  public removeHiringTeamMember = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, teamMemberId } = req.params;
    await employerJobHiringTeamService.removeHiringTeamMember(context.organizationId, context.role, jobId, teamMemberId);

    res.status(200).json(successResponse('Hiring team member removed successfully', null));
  });
}

export default new EmployerJobHiringTeamController();
