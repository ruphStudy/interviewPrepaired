import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { organizationService } from '../services/OrganizationService';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

export class OrganizationController {
  /**
   * POST /api/v1/organizations
   * Create an organization owned by the authenticated user. Owner-only until
   * Sprint 8 membership/RBAC exists.
   */
  public createOrganization = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const {
      name,
      type,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    } = req.body;

    const organization = await organizationService.createOrganization({
      userId,
      name,
      type,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    });

    res.status(201).json(successResponse('Organization created successfully', { organization }));
  });

  /**
   * GET /api/v1/organizations
   * List organizations owned by the authenticated user.
   */
  public getOrganizations = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const type = req.query.type as OrganizationType | undefined;
    const status = req.query.status as OrganizationStatus | undefined;

    const result = await organizationService.getOrganizations({ userId, page, limit, type, status });

    res.status(200).json(successResponse('Organizations retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:id
   * Owner-scoped detail — includes only the profile matching the org's type.
   */
  public getOrganization = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    const organization = await organizationService.getOrganization(userId, id);

    res.status(200).json(successResponse('Organization retrieved successfully', { organization }));
  });

  /**
   * PUT /api/v1/organizations/:id
   * Owner-scoped update. ownerUserId/slug/type/status are immutable here.
   */
  public updateOrganization = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    const {
      name,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    } = req.body;

    const organization = await organizationService.updateOrganization({
      userId,
      organizationId: id,
      name,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    });

    res.status(200).json(successResponse('Organization updated successfully', { organization }));
  });

  /**
   * DELETE /api/v1/organizations/:id
   * Soft archive only — never a physical delete, no cascade.
   */
  public deleteOrganization = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    await organizationService.deleteOrganization(userId, id);

    res.status(200).json(successResponse('Organization archived successfully', null));
  });
}

export default new OrganizationController();
