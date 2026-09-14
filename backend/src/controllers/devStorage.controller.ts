import { Request, Response, NextFunction } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { ApiError } from '../utils/ApiError';
import { getLocalObjectStorageProvider } from '../storage';

/**
 * Backs the LOCAL object storage provider's "signed read URL" (PR-STORAGE-2)
 * — development/tests only. A production deployment never selects the
 * local provider (see storage/index.ts), so this route is inert there
 * regardless of whether it's mounted. The HMAC signature + expiry are
 * verified before any byte is streamed; the query string carries no
 * authorization beyond that signature (never a session/JWT — this URL is
 * meant to be handed to a browser <a>/<iframe> the same way a real cloud
 * presigned URL would be).
 */
export const readDevStorageObject = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const provider = getLocalObjectStorageProvider();
  if (!provider) {
    throw new ApiError(503, 'Local dev storage is not active', undefined, 'STORAGE_PROVIDER_UNAVAILABLE');
  }

  const key = typeof req.query.key === 'string' ? req.query.key : '';
  const exp = typeof req.query.exp === 'string' ? parseInt(req.query.exp, 10) : NaN;
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

  if (!key || !sig || !provider.verifySignedAccess(key, exp, sig)) {
    throw new ApiError(403, 'This link has expired or is invalid', undefined, 'FILE_ACCESS_DENIED');
  }

  const absolutePath = provider.resolveAbsolutePath(key);
  res.sendFile(absolutePath, (error) => {
    if (error && !res.headersSent) {
      next(new ApiError(404, 'File not found', undefined, 'FILE_NOT_FOUND'));
    }
  });
});
