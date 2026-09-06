import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerSkillGraphService } from '../services/EmployerSkillGraphService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerSkillGraphController {
  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/skill-graph — requires ORGANIZATION_VIEW. Read-only, never auto-builds. */
  public getSkillGraph = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const graph = await employerSkillGraphService.getSkillGraph(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Skill graph retrieved successfully', graph));
  });

  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/skill-graph/build — requires INTERVIEWS_MANAGE. Idempotent deterministic rebuild. */
  public buildSkillGraph = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const graph = await employerSkillGraphService.buildApplicationSkillGraph(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Skill graph built successfully', graph));
  });
}

export default new EmployerSkillGraphController();
