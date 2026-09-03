import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteStudentService } from '../services/InstituteStudentService';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteStudentController {
  /**
   * GET /api/v1/organizations/:organizationId/students
   * Requires ORGANIZATION_VIEW.
   */
  public getStudents = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as InstituteStudentStatus | undefined;
    const batchId = req.query.batchId as string | undefined;
    const courseId = req.query.courseId as string | undefined;
    const branchId = req.query.branchId as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await instituteStudentService.getStudents(context.organizationId, context.role, {
      page,
      limit,
      status,
      batchId,
      courseId,
      branchId,
      search,
    });

    res.status(200).json(successResponse('Institute students retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/students/:studentId
   * Requires ORGANIZATION_VIEW.
   */
  public getStudent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    const student = await instituteStudentService.getStudentById(context.organizationId, context.role, studentId);

    res.status(200).json(successResponse('Institute student retrieved successfully', { student }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/students
   * Requires ORGANIZATION_UPDATE.
   */
  public createStudent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { firstName, lastName, email, phone, enrollmentNumber, graduationYear, batchId, courseId, branchId } = req.body;

    const student = await instituteStudentService.createStudent(context.organizationId, context.role, {
      firstName,
      lastName,
      email,
      phone,
      enrollmentNumber,
      graduationYear,
      batchId,
      courseId,
      branchId,
    });

    res.status(201).json(successResponse('Institute student created successfully', { student }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/students/:studentId
   * Requires ORGANIZATION_UPDATE. PATCH-like merge; status is never accepted here.
   */
  public updateStudent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    const { firstName, lastName, email, phone, enrollmentNumber, graduationYear, batchId, courseId, branchId } = req.body;

    const student = await instituteStudentService.updateStudent(context.organizationId, context.role, studentId, {
      firstName,
      lastName,
      email,
      phone,
      enrollmentNumber,
      graduationYear,
      batchId,
      courseId,
      branchId,
    });

    res.status(200).json(successResponse('Institute student updated successfully', { student }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/students/:studentId
   * Requires ORGANIZATION_UPDATE. Soft deactivate only.
   */
  public removeStudent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    await instituteStudentService.removeStudent(context.organizationId, context.role, studentId);

    res.status(200).json(successResponse('Institute student removed successfully', null));
  });

  /**
   * POST /api/v1/organizations/:organizationId/students/:studentId/link-user
   * Requires ORGANIZATION_UPDATE. Links to an EXISTING active User — never creates one.
   */
  public linkUser = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    const { userId } = req.body;

    const student = await instituteStudentService.linkUser(context.organizationId, context.role, studentId, userId);

    res.status(200).json(successResponse('Student linked to user account successfully', { student }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/students/:studentId/link-user
   * Requires ORGANIZATION_UPDATE. Unlinks only — never deletes/deactivates the User.
   */
  public unlinkUser = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { studentId } = req.params;
    const student = await instituteStudentService.unlinkUser(context.organizationId, context.role, studentId);

    res.status(200).json(successResponse('Student unlinked from user account successfully', { student }));
  });
}

export default new InstituteStudentController();
