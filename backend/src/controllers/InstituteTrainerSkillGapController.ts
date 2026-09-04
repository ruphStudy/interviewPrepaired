import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteTrainerSkillGapService } from '../services/InstituteTrainerSkillGapService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ANALYTICS_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class InstituteTrainerSkillGapController {
  /** GET /api/v1/organizations/:organizationId/trainer-batches/:batchId/skill-gaps */
  public getSkillGaps = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { batchId } = req.params;

    const analytics = await instituteTrainerSkillGapService.getSkillGaps(
      context.organizationId,
      context.role,
      context.member._id,
      batchId
    );

    res.status(200).json(successResponse('Skill gap analytics retrieved successfully', analytics));
  });
}

export default new InstituteTrainerSkillGapController();
