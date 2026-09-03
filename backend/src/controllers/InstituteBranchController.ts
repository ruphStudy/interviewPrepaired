import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteBranchService } from '../services/InstituteBranchService';
import { InstituteBranchStatus } from '../constants/instituteBranch';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteBranchController {
  /**
   * GET /api/v1/organizations/:organizationId/branches
   * Requires ORGANIZATION_VIEW.
   */
  public getBranches = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as InstituteBranchStatus | undefined;

    const result = await instituteBranchService.getBranches(context.organizationId, context.role, {
      page,
      limit,
      status,
    });

    res.status(200).json(successResponse('Institute branches retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/branches/:branchId
   * Requires ORGANIZATION_VIEW.
   */
  public getBranch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { branchId } = req.params;
    const branch = await instituteBranchService.getBranchById(context.organizationId, context.role, branchId);

    res.status(200).json(successResponse('Institute branch retrieved successfully', { branch }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/branches
   * Requires ORGANIZATION_UPDATE.
   */
  public createBranch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, code, addressLine1, addressLine2, city, state, country, postalCode, contactEmail, contactPhone } = req.body;

    const branch = await instituteBranchService.createBranch(context.organizationId, context.role, {
      name,
      code,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
      contactEmail,
      contactPhone,
    });

    res.status(201).json(successResponse('Institute branch created successfully', { branch }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/branches/:branchId
   * Requires ORGANIZATION_UPDATE. PATCH-like merge; status is never accepted here.
   */
  public updateBranch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { branchId } = req.params;
    const { name, code, addressLine1, addressLine2, city, state, country, postalCode, contactEmail, contactPhone } = req.body;

    const branch = await instituteBranchService.updateBranch(context.organizationId, context.role, branchId, {
      name,
      code,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      postalCode,
      contactEmail,
      contactPhone,
    });

    res.status(200).json(successResponse('Institute branch updated successfully', { branch }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/branches/:branchId
   * Requires ORGANIZATION_UPDATE. Soft deactivate only.
   */
  public removeBranch = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { branchId } = req.params;
    await instituteBranchService.removeBranch(context.organizationId, context.role, branchId);

    res.status(200).json(successResponse('Institute branch removed successfully', null));
  });
}

export default new InstituteBranchController();
