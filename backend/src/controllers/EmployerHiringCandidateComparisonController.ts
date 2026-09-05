import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringCandidateComparisonService } from '../services/EmployerHiringCandidateComparisonService';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringCandidateComparisonController {
  /**
   * GET /api/v1/organizations/:organizationId/jobs/:jobId/candidate-comparison
   * Requires ORGANIZATION_VIEW. Read-only, live, deterministic — no
   * mutation, no persisted comparison document. Query: status?, minOverallScore?, search?, finalizedOnly?.
   */
  public getComparison = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const status = req.query.status as EmployerJobApplicationStatus | undefined;
    const minOverallScore = req.query.minOverallScore !== undefined ? parseFloat(req.query.minOverallScore as string) : undefined;
    const search = req.query.search as string | undefined;
    const finalizedOnly = req.query.finalizedOnly !== undefined ? req.query.finalizedOnly === 'true' : undefined;

    const comparison = await employerHiringCandidateComparisonService.getComparison(context.organizationId, context.role, jobId, {
      status,
      minOverallScore,
      search,
      finalizedOnly,
    });

    res.status(200).json(successResponse('Candidate comparison retrieved successfully', comparison));
  });
}

export default new EmployerHiringCandidateComparisonController();
