import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
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
   * Discovery list — every organization the authenticated user can access:
   * ones they own, plus ones where they hold an ACTIVE membership. This is
   * discovery only; per-organization RBAC is unchanged (still enforced by
   * requireOrganizationPermission on every org-scoped route).
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
   * Requires ORGANIZATION_VIEW — any active member, not just the owner (8D).
   * Detail includes only the profile matching the org's type.
   */
  public getOrganization = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const organization = await organizationService.getOrganizationById(context.organizationId, context.role);

    res.status(200).json(successResponse('Organization retrieved successfully', { organization }));
  });

  /**
   * PUT /api/v1/organizations/:id
   * Requires ORGANIZATION_UPDATE (owner/admin). ownerUserId/slug/type/status
   * remain immutable here.
   */
  public updateOrganization = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

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

    const organization = await organizationService.updateOrganizationTrusted(context.organizationId, context.role, {
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
   * GET /api/v1/organizations/:organizationId/settings
   * Requires ORGANIZATION_VIEW. Read-only — returns effective settings
   * (stored values merged with defaults for anything missing).
   */
  public getOrganizationSettings = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const settings = await organizationService.getSettingsTrusted(context.organizationId, context.role);

    res.status(200).json(successResponse('Organization settings retrieved successfully', { settings }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/settings
   * Requires ORGANIZATION_UPDATE. PATCH-like merge — omitted fields keep
   * their current effective value.
   */
  public updateOrganizationSettings = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { timezone, locale, dateFormat, timeFormat, defaultInterviewLanguage } = req.body;
    const settings = await organizationService.updateSettingsTrusted(context.organizationId, context.role, {
      timezone,
      locale,
      dateFormat,
      timeFormat,
      defaultInterviewLanguage,
    });

    res.status(200).json(successResponse('Organization settings updated successfully', { settings }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/institute-profile
   * Requires ORGANIZATION_VIEW. 400 if the organization is not an institute.
   */
  public getInstituteProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const result = await organizationService.getInstituteProfileTrusted(context.organizationId, context.role);

    res.status(200).json(successResponse('Institute profile retrieved successfully', result));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/institute-profile
   * Requires ORGANIZATION_UPDATE. PATCH-like merge — omitted fields keep
   * their current value. 400 if not an institute, 409 if archived.
   */
  public updateInstituteProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const {
      instituteKind,
      officialName,
      instituteCode,
      affiliation,
      accreditation,
      universityName,
      establishedYear,
      studentCount,
      description,
      website,
      placementEmail,
      placementPhone,
    } = req.body;

    const result = await organizationService.updateInstituteProfileTrusted(context.organizationId, context.role, {
      instituteKind,
      officialName,
      instituteCode,
      affiliation,
      accreditation,
      universityName,
      establishedYear,
      studentCount,
      description,
      website,
      placementEmail,
      placementPhone,
    });

    res.status(200).json(successResponse('Institute profile updated successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/company-profile
   * Requires ORGANIZATION_VIEW. 400 if the organization is not a company.
   */
  public getCompanyProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const result = await organizationService.getCompanyProfileTrusted(context.organizationId, context.role);

    res.status(200).json(successResponse('Company profile retrieved successfully', result));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/company-profile
   * Requires ORGANIZATION_UPDATE. PATCH-like merge — omitted fields keep
   * their current value. 400 if not a company, 409 if archived.
   */
  public updateCompanyProfile = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const {
      industry,
      companySize,
      establishedYear,
      officialName,
      companyCode,
      description,
      website,
      careersUrl,
      headquarters,
      linkedinUrl,
      hiringEmail,
      hiringPhone,
    } = req.body;

    const result = await organizationService.updateCompanyProfileTrusted(context.organizationId, context.role, {
      industry,
      companySize,
      establishedYear,
      officialName,
      companyCode,
      description,
      website,
      careersUrl,
      headquarters,
      linkedinUrl,
      hiringEmail,
      hiringPhone,
    });

    res.status(200).json(successResponse('Company profile updated successfully', result));
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
