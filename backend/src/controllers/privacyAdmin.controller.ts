import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { accountDeletionService } from '../services/AccountDeletionService';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Compatibility handler for the long-standing DELETE /admin/users/:id API.
 * The legacy admin controller hard-deleted the User row and bypassed the
 * privacy/session/financial-retention lifecycle. This handler deliberately
 * routes that public contract through AccountDeletionService instead.
 */
export const privacySafeAdminDeleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  await accountDeletionService.requestDeletionByAdmin(req.params.id, req.user!.id);
  res.status(202).json(
    successResponse('User account deletion is processing. Access has been revoked and personal data cleanup is queued.')
  );
});
