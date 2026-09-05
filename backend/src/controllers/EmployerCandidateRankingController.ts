import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateRankingService } from '../services/EmployerCandidateRankingService';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerCandidateRankingController {
  /**
   * GET /api/v1/organizations/:organizationId/jobs/:jobId/ranking
   * Requires ORGANIZATION_VIEW. Read-only, live, deterministic — no
   * mutation, no persisted ranking document. Query: status?, minScore?, search?.
   */
  public getJobRanking = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const status = req.query.status as EmployerJobApplicationStatus | undefined;
    const minScore = req.query.minScore !== undefined ? parseFloat(req.query.minScore as string) : undefined;
    const search = req.query.search as string | undefined;

    const ranking = await employerCandidateRankingService.getJobRanking(context.organizationId, context.role, jobId, {
      status,
      minScore,
      search,
    });

    res.status(200).json(successResponse('Candidate ranking retrieved successfully', ranking));
  });
}

export default new EmployerCandidateRankingController();
