import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteStudentInterviewAssignmentService } from '../services/InstituteStudentInterviewAssignmentService';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteStudentInterviewAssignmentController {
  /**
   * POST /api/v1/organizations/:organizationId/interview-assignments
   * Requires INTERVIEWS_MANAGE. `assignedByMembershipId` is always the
   * caller's own trusted membership id — never accepted from the body.
   */
  public assignInterview = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { templateId, studentIds, dueAt, instructions } = req.body;

    const result = await instituteStudentInterviewAssignmentService.assignInterview(
      context.organizationId,
      context.role,
      context.member._id,
      { templateId, studentIds, dueAt, instructions }
    );

    res.status(200).json(successResponse('Interview assignment processed', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/interview-assignments
   * Requires INTERVIEWS_VIEW.
   */
  public getAssignments = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const studentId = req.query.studentId as string | undefined;
    const templateId = req.query.templateId as string | undefined;
    const status = req.query.status as InstituteStudentInterviewAssignmentStatus | undefined;

    const result = await instituteStudentInterviewAssignmentService.getAssignments(context.organizationId, context.role, {
      page,
      limit,
      studentId,
      templateId,
      status,
    });

    res.status(200).json(successResponse('Interview assignments retrieved successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/interview-assignments/:assignmentId/start
   * Requires INTERVIEWS_MANAGE. Creates the real Interview (no B2C credit
   * involvement) and transitions the assignment to IN_PROGRESS.
   */
  public startAssignment = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { assignmentId } = req.params;
    const assignment = await instituteStudentInterviewAssignmentService.startAssignment(
      context.organizationId,
      context.role,
      assignmentId
    );

    res.status(200).json(successResponse('Interview assignment started successfully', { assignment }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/interview-assignments/:assignmentId/cancel
   * Requires INTERVIEWS_MANAGE.
   */
  public cancelAssignment = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { assignmentId } = req.params;
    const assignment = await instituteStudentInterviewAssignmentService.cancelAssignment(
      context.organizationId,
      context.role,
      assignmentId
    );

    res.status(200).json(successResponse('Interview assignment cancelled successfully', { assignment }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/interview-assignments/:assignmentId
   * Requires INTERVIEWS_VIEW.
   */
  public getAssignment = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { assignmentId } = req.params;
    const assignment = await instituteStudentInterviewAssignmentService.getAssignmentById(
      context.organizationId,
      context.role,
      assignmentId
    );

    res.status(200).json(successResponse('Interview assignment retrieved successfully', { assignment }));
  });
}

export default new InstituteStudentInterviewAssignmentController();
