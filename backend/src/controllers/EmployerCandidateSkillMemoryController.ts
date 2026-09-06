import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateSkillMemoryService } from '../services/EmployerCandidateSkillMemoryService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Employer-only, organization-scoped candidate skill memory (25C) — never shared across tenants. */
export class EmployerCandidateSkillMemoryController {
  /** GET /api/v1/organizations/:organizationId/candidates/:candidateId/skill-memory — requires ORGANIZATION_VIEW. Never refreshes. */
  public getSkillMemory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const memory = await employerCandidateSkillMemoryService.getSkillMemory(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Skill memory retrieved successfully', memory));
  });

  /** POST /api/v1/organizations/:organizationId/candidates/:candidateId/skill-memory/refresh — requires INTERVIEWS_MANAGE. Uses only existing 25B intelligence. */
  public refreshSkillMemory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const memory = await employerCandidateSkillMemoryService.refreshCandidateSkillMemory(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Skill memory refreshed successfully', memory));
  });
}

export default new EmployerCandidateSkillMemoryController();
