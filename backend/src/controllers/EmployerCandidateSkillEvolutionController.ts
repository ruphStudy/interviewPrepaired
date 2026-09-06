import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateSkillEvolutionService } from '../services/EmployerCandidateSkillEvolutionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only, organization-scoped skill evidence evolution (25D). */
export class EmployerCandidateSkillEvolutionController {
  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/skill-evolution — requires ORGANIZATION_VIEW. Never refreshes. */
  public getSkillEvolution = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const evolution = await employerCandidateSkillEvolutionService.getSkillEvolution(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Skill evolution retrieved successfully', evolution));
  });

  /** POST /api/v1/organizations/:organizationId/candidates/:candidateId/skill-evolution/refresh — requires INTERVIEWS_MANAGE. Requires existing 25C skill memory. */
  public refreshSkillEvolution = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const evolution = await employerCandidateSkillEvolutionService.refreshCandidateSkillEvolution(
      context.organizationId,
      context.role,
      candidateId
    );

    res.status(200).json(successResponse('Skill evolution refreshed successfully', evolution));
  });
}

export default new EmployerCandidateSkillEvolutionController();
