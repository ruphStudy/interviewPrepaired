import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerBatchReadinessService } from '../services/InstituteTrainerBatchReadinessService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class InstituteTrainerBatchReadinessController {
  /** GET /api/v1/organizations/:organizationId/trainer-batches/:batchId/readiness */
  public getBatchReadiness = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;

    const analytics = await instituteTrainerBatchReadinessService.getBatchReadiness(
      context.organizationId,
      context.role,
      context.member._id,
      batchId
    );

    res.status(200).json(successResponse('Batch readiness analytics retrieved successfully', analytics));
  });
}

export default new InstituteTrainerBatchReadinessController();
