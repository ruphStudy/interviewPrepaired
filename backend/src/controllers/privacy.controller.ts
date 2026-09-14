import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { privacyExportService } from '../services/PrivacyExportService';
import { accountDeletionService } from '../services/AccountDeletionService';
import { userConsentService } from '../services/UserConsentService';
import { fileStorageService } from '../services/FileStorageService';
import { env } from '../config/environment';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { PrivacyErrorCode } from '../constants/privacy';

function toSafeExportRequest(request: any): Record<string, unknown> {
  return {
    id: request._id.toString(),
    status: request.status,
    requestedAt: request.requestedAt,
    completedAt: request.completedAt,
    expiresAt: request.expiresAt,
    failureReason: request.failureReason,
  };
}

/** POST /api/v1/privacy/export — always keyed on req.user.id, NEVER a body/param userId. */
export const requestExport = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await privacyExportService.requestExport(req.user!.id);
  res.status(202).json(successResponse('Data export requested', toSafeExportRequest(request)));
});

/** GET /api/v1/privacy/export — the caller's own export request history only. */
export const listExports = catchAsync(async (req: AuthRequest, res: Response) => {
  const requests = await privacyExportService.listRequests(req.user!.id);
  res.status(200).json(successResponse('Export requests retrieved', { requests: requests.map(toSafeExportRequest) }));
});

/**
 * GET /api/v1/privacy/export/:requestId — a mismatch (another user's
 * request id, or a nonexistent one) is always the SAME generic 404, never
 * leaking whether the id exists for someone else. A completed,
 * not-yet-expired export streams the file back via the same server-side
 * proxy pattern already used for candidate resume downloads (never a
 * public/persistent URL); anything else returns the current status.
 */
export const getExport = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await privacyExportService.getOwnedRequest(req.user!.id, req.params.requestId);

  if (request.status === 'completed' && request.objectKey) {
    if (request.expiresAt && request.expiresAt.getTime() < Date.now()) {
      throw new ApiError(410, 'This data export has expired — please request a new one', undefined, PrivacyErrorCode.PRIVACY_EXPORT_EXPIRED);
    }
    const buffer = await fileStorageService.downloadFile(request.objectKey);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="privacy-export-${request._id.toString()}.json"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
    return;
  }

  res.status(200).json(successResponse('Export status retrieved', toSafeExportRequest(request)));
});

/**
 * POST /api/v1/privacy/delete-account — protect only. Body:
 * {confirmation: 'DELETE', currentPassword}. The synchronous part
 * (session revocation + User anonymization) has already completed by the
 * time this responds; the response never claims full completion.
 */
export const deleteAccount = catchAsync(async (req: AuthRequest, res: Response) => {
  const { confirmation, currentPassword } = req.body;

  if (confirmation !== 'DELETE') {
    throw new ApiError(400, 'Type DELETE to confirm account deletion', undefined, PrivacyErrorCode.PRIVACY_DELETE_CONFIRMATION_REQUIRED);
  }
  if (!currentPassword || typeof currentPassword !== 'string') {
    throw new ApiError(401, 'Current password is required', undefined, PrivacyErrorCode.PRIVACY_REAUTH_REQUIRED);
  }

  const result = await accountDeletionService.requestDeletion(req.user!.id, currentPassword);
  res.status(202).json(successResponse('Account deletion in progress', result));
});

/** GET /api/v1/privacy/consent — the caller's own consent history only. */
export const getConsent = catchAsync(async (req: AuthRequest, res: Response) => {
  const consents = await userConsentService.getUserConsents(req.user!.id);
  res.status(200).json(successResponse('Consent history retrieved', { consents }));
});

/**
 * GET /api/v1/privacy/policy-config — fully public. URLs are omitted
 * (never a fabricated/placeholder link) when not genuinely configured.
 */
export const getPolicyConfig = catchAsync(async (_req: AuthRequest, res: Response) => {
  res.status(200).json(
    successResponse('Policy configuration retrieved', {
      termsVersion: env.termsVersion,
      privacyPolicyVersion: env.privacyPolicyVersion,
      termsUrl: env.termsUrl || null,
      privacyPolicyUrl: env.privacyPolicyUrl || null,
    })
  );
});
