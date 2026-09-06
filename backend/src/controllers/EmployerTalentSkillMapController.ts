import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerTalentSkillMapService, EmployerTalentSearchFilters } from '../services/EmployerTalentSkillMapService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-internal talent discovery (25E) — search/read only, never ranking/recommendation. */
export class EmployerTalentSkillMapController {
  /** GET /api/v1/organizations/:organizationId/talent/skill-map — requires ANALYTICS_VIEW. Aggregate-only; never returns candidate identities. */
  public getSkillMap = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const skillMap = await employerTalentSkillMapService.getOrgSkillMap(context.organizationId, context.role);

    res.status(200).json(successResponse('Talent skill map retrieved successfully', skillMap));
  });

  /** GET /api/v1/organizations/:organizationId/talent/skill-search — requires ORGANIZATION_VIEW. Deterministic discovery only — never candidate ranking. */
  public searchTalent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { search, skillNodeIds, classification, recencyBucket, minEvidenceStrength, page, limit } = req.query;

    const filters: EmployerTalentSearchFilters = {
      search: typeof search === 'string' ? search : undefined,
      skillNodeIds:
        typeof skillNodeIds === 'string'
          ? skillNodeIds
              .split(',')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
          : undefined,
      classification: typeof classification === 'string' ? (classification as EmployerTalentSearchFilters['classification']) : undefined,
      recencyBucket: typeof recencyBucket === 'string' ? (recencyBucket as EmployerTalentSearchFilters['recencyBucket']) : undefined,
      minEvidenceStrength: typeof minEvidenceStrength === 'string' ? Number(minEvidenceStrength) : undefined,
      page: typeof page === 'string' ? Number(page) : undefined,
      limit: typeof limit === 'string' ? Number(limit) : undefined,
    };

    const results = await employerTalentSkillMapService.searchTalent(context.organizationId, context.role, filters);

    res.status(200).json(successResponse('Talent skill search completed successfully', results));
  });
}

export default new EmployerTalentSkillMapController();
