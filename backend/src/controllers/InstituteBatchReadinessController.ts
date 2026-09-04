import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteBatchReadinessService } from '../services/InstituteBatchReadinessService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class InstituteBatchReadinessController {
  /** GET /api/v1/organizations/:organizationId/batches/:batchId/readiness */
  public getBatchReadiness = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;

    const analytics = await instituteBatchReadinessService.getBatchReadiness(context.organizationId, context.role, batchId);

    res.status(200).json(successResponse('Batch readiness analytics retrieved successfully', analytics));
  });
}

export default new InstituteBatchReadinessController();
