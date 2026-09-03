import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerAssignmentService } from '../services/InstituteTrainerAssignmentService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteTrainerAssignmentController {
  /**
   * GET /api/v1/organizations/:organizationId/trainers/:membershipId/assignments
   * Requires MEMBERS_VIEW.
   */
  public getAssignments = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { membershipId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await instituteTrainerAssignmentService.getAssignments(context.organizationId, context.role, membershipId, {
      page,
      limit,
    });

    res.status(200).json(successResponse('Trainer assignments retrieved successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/trainers/:membershipId/assignments
   * Requires MEMBERS_MANAGE. Body: exactly one of courseId or batchId.
   */
  public createAssignment = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { membershipId } = req.params;
    const { courseId, batchId } = req.body;

    const assignment = await instituteTrainerAssignmentService.createAssignment(
      context.organizationId,
      context.role,
      membershipId,
      { courseId, batchId }
    );

    res.status(201).json(successResponse('Trainer assignment created successfully', { assignment }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/trainers/:membershipId/assignments/:assignmentId
   * Requires MEMBERS_MANAGE. Physical delete — this is only a relationship record.
   */
  public deleteAssignment = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { membershipId, assignmentId } = req.params;
    await instituteTrainerAssignmentService.deleteAssignment(context.organizationId, context.role, membershipId, assignmentId);

    res.status(200).json(successResponse('Trainer assignment deleted successfully', null));
  });
}

export default new InstituteTrainerAssignmentController();
