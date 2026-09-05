import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationNoteService } from '../services/EmployerJobApplicationNoteService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerCollaborationMentionsController {
  /** GET /api/v1/organizations/:organizationId/collaboration/mentions — requires ORGANIZATION_VIEW. In-app discoverability only — no email/SMS/push. */
  public getMentions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await employerJobApplicationNoteService.getMentionsForMember(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      page,
      limit
    );

    res.status(200).json(successResponse('Mentions retrieved successfully', result));
  });
}

export default new EmployerCollaborationMentionsController();
