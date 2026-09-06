import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerSkillEvidenceIntelligenceService } from '../services/EmployerSkillEvidenceIntelligenceService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerSkillEvidenceIntelligenceController {
  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/skill-intelligence — requires ORGANIZATION_VIEW. Never auto-builds. */
  public getSkillIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const intelligence = await employerSkillEvidenceIntelligenceService.getSkillIntelligence(
      context.organizationId,
      context.role,
      applicationId
    );

    res.status(200).json(successResponse('Skill intelligence retrieved successfully', intelligence));
  });

  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/skill-intelligence/build — requires INTERVIEWS_MANAGE. Requires an existing built 25A skill graph. */
  public buildSkillIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const intelligence = await employerSkillEvidenceIntelligenceService.buildApplicationSkillIntelligence(
      context.organizationId,
      context.role,
      applicationId
    );

    res.status(200).json(successResponse('Skill intelligence built successfully', intelligence));
  });
}

export default new EmployerSkillEvidenceIntelligenceController();
