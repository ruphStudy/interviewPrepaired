import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerHiringReportReviewService } from '../services/EmployerHiringReportReviewService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerHiringReportReviewController {
  /** GET .../interview-session/report/reviews — requires ORGANIZATION_VIEW. */
  public getReviews = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const reviewSummary = await employerHiringReportReviewService.getReviewSummary(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId
    );

    res.status(200).json(successResponse('Review summary retrieved successfully', { reviewSummary }));
  });

  /** POST .../interview-session/report/reviews — requires INTERVIEWS_MANAGE. Upserts only the ACTING member's own review. */
  public upsertReview = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { reviewNotes } = req.body;
    const reviewSummary = await employerHiringReportReviewService.upsertReview(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      reviewNotes
    );

    res.status(200).json(successResponse('Review saved successfully', { reviewSummary }));
  });
}

export default new EmployerHiringReportReviewController();
