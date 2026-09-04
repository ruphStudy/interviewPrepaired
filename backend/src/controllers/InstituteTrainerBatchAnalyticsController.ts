import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerBatchAnalyticsService } from '../services/InstituteTrainerBatchAnalyticsService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class InstituteTrainerBatchAnalyticsController {
  /** GET /api/v1/organizations/:organizationId/trainer-batches/:batchId/analytics */
  public getBatchAnalytics = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;

    const analytics = await instituteTrainerBatchAnalyticsService.getBatchAnalytics(
      context.organizationId,
      context.role,
      context.member._id,
      batchId
    );

    res.status(200).json(successResponse('Batch analytics retrieved successfully', analytics));
  });
}

export default new InstituteTrainerBatchAnalyticsController();
