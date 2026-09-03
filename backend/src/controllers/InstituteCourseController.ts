import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteCourseService } from '../services/InstituteCourseService';
import { InstituteCourseStatus } from '../constants/instituteCourse';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteCourseController {
  /**
   * GET /api/v1/organizations/:organizationId/courses
   * Requires ORGANIZATION_VIEW.
   */
  public getCourses = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as InstituteCourseStatus | undefined;
    const branchId = req.query.branchId as string | undefined;

    const result = await instituteCourseService.getCourses(context.organizationId, context.role, {
      page,
      limit,
      status,
      branchId,
    });

    res.status(200).json(successResponse('Institute courses retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/courses/:courseId
   * Requires ORGANIZATION_VIEW.
   */
  public getCourse = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { courseId } = req.params;
    const course = await instituteCourseService.getCourseById(context.organizationId, context.role, courseId);

    res.status(200).json(successResponse('Institute course retrieved successfully', { course }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/courses
   * Requires ORGANIZATION_UPDATE.
   */
  public createCourse = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, branchId, code, description, durationMonths } = req.body;

    const course = await instituteCourseService.createCourse(context.organizationId, context.role, {
      name,
      branchId,
      code,
      description,
      durationMonths,
    });

    res.status(201).json(successResponse('Institute course created successfully', { course }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/courses/:courseId
   * Requires ORGANIZATION_UPDATE. PATCH-like merge; status is never accepted here.
   */
  public updateCourse = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { courseId } = req.params;
    const { name, branchId, code, description, durationMonths } = req.body;

    const course = await instituteCourseService.updateCourse(context.organizationId, context.role, courseId, {
      name,
      branchId,
      code,
      description,
      durationMonths,
    });

    res.status(200).json(successResponse('Institute course updated successfully', { course }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/courses/:courseId
   * Requires ORGANIZATION_UPDATE. Soft deactivate only.
   */
  public removeCourse = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { courseId } = req.params;
    await instituteCourseService.removeCourse(context.organizationId, context.role, courseId);

    res.status(200).json(successResponse('Institute course removed successfully', null));
  });
}

export default new InstituteCourseController();
