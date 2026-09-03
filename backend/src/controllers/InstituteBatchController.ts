import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteBatchService } from '../services/InstituteBatchService';
import { InstituteBatchStatus } from '../constants/instituteBatch';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteBatchController {
  /**
   * GET /api/v1/organizations/:organizationId/batches
   * Requires ORGANIZATION_VIEW.
   */
  public getBatches = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as InstituteBatchStatus | undefined;
    const courseId = req.query.courseId as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    const result = await instituteBatchService.getBatches(context.organizationId, context.role, {
      page,
      limit,
      status,
      courseId,
      branchId,
    });

    res.status(200).json(successResponse('Institute batches retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/batches/:batchId
   * Requires ORGANIZATION_VIEW.
   */
  public getBatch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;
    const batch = await instituteBatchService.getBatchById(context.organizationId, context.role, batchId);

    res.status(200).json(successResponse('Institute batch retrieved successfully', { batch }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/batches
   * Requires ORGANIZATION_UPDATE.
   */
  public createBatch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, courseId, branchId, code, academicYear, startDate, endDate, capacity } = req.body;

    const batch = await instituteBatchService.createBatch(context.organizationId, context.role, {
      name,
      courseId,
      branchId,
      code,
      academicYear,
      startDate,
      endDate,
      capacity,
    });

    res.status(201).json(successResponse('Institute batch created successfully', { batch }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/batches/:batchId
   * Requires ORGANIZATION_UPDATE. PATCH-like merge; status is never accepted here.
   */
  public updateBatch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;
    const { name, courseId, branchId, code, academicYear, startDate, endDate, capacity } = req.body;

    const batch = await instituteBatchService.updateBatch(context.organizationId, context.role, batchId, {
      name,
      courseId,
      branchId,
      code,
      academicYear,
      startDate,
      endDate,
      capacity,
    });

    res.status(200).json(successResponse('Institute batch updated successfully', { batch }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/batches/:batchId
   * Requires ORGANIZATION_UPDATE. Soft deactivate only.
   */
  public removeBatch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;
    await instituteBatchService.removeBatch(context.organizationId, context.role, batchId);

    res.status(200).json(successResponse('Institute batch removed successfully', null));
  });
}

export default new InstituteBatchController();
