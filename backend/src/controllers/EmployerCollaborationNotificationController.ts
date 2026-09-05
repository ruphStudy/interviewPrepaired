import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCollaborationNotificationService } from '../services/EmployerCollaborationNotificationService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(ORGANIZATION_VIEW)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. In-app only — no email/SMS/push. */
export class EmployerCollaborationNotificationController {
  /** GET /api/v1/organizations/:organizationId/collaboration/notifications */
  public listNotifications = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const unreadOnly = req.query.unreadOnly === 'true';

    const result = await employerCollaborationNotificationService.listNotifications(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      page,
      limit,
      unreadOnly
    );

    res.status(200).json(successResponse('Notifications retrieved successfully', result));
  });

  /** PATCH /api/v1/organizations/:organizationId/collaboration/notifications/:notificationId/read */
  public markRead = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { notificationId } = req.params;
    const result = await employerCollaborationNotificationService.markRead(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      notificationId
    );

    res.status(200).json(successResponse('Notification marked as read', result));
  });

  /** POST /api/v1/organizations/:organizationId/collaboration/notifications/read-all */
  public markAllRead = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const result = await employerCollaborationNotificationService.markAllRead(
      context.organizationId,
      context.role,
      context.member._id.toString()
    );

    res.status(200).json(successResponse('All notifications marked as read', result));
  });
}

export default new EmployerCollaborationNotificationController();
