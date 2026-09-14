import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/user.model';
import { ApiError } from '../utils/ApiError';
import { catchAsync } from '../utils/catchAsync';
import { env } from '../config/environment';
import { authSessionService } from '../services/AuthSessionService';

export interface AuthRequest extends Request {
  user?: IUser;
  /** Present only for a token minted after PR-AUTH-3 — a pre-rollout JWT has no sessionId and is allowed through on signature/expiry alone until it naturally expires. */
  sessionId?: string;
}

export const protect = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    let decoded: { id: string; role: string; sessionId?: string };
    try {
      decoded = jwt.verify(token, env.jwtSecret) as { id: string; role: string; sessionId?: string };
    } catch (error) {
      throw new ApiError(401, 'Your session has expired. Please sign in again.', undefined, 'AUTH_SESSION_EXPIRED');
    }

    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    if (!user.isActive) {
      throw new ApiError(401, 'Your account has been deactivated', undefined, 'ACCOUNT_INACTIVE');
    }

    // Belt-and-suspenders (PR-PRIVACY-3): account deletion already revokes
    // every AuthSession directly, but this is a second, independent guard
    // so ANY session/JWT belonging to a deleted user is rejected here too
    // — same generic message as a revoked session, never a distinct
    // "this account was deleted" message.
    if (user.isDeleted) {
      throw new ApiError(401, 'Your session has expired or was signed out. Please sign in again.', undefined, 'AUTH_SESSION_REVOKED');
    }

    // A token minted before PR-AUTH-3 carries no sessionId — let it through
    // on signature/expiry alone (it will stop working once it naturally
    // expires) rather than logging out every existing user at deploy time.
    if (decoded.sessionId) {
      const valid = await authSessionService.isSessionValid(decoded.sessionId, user._id.toString());
      if (!valid) {
        throw new ApiError(401, 'Your session has expired or was signed out. Please sign in again.', undefined, 'AUTH_SESSION_REVOKED');
      }
      req.sessionId = decoded.sessionId;
    }

    req.user = user;
    next();
  }
);

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized to access this route');
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `User role '${req.user.role}' is not authorized to access this route`
      );
    }

    next();
  };
};

/** Applied only to high-value routes (PR-AUTH-1) — never scattered ad hoc; runs after `protect`. */
export const requireVerifiedEmail = (req: AuthRequest, _res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new ApiError(401, 'Not authorized to access this route');
  }
  if (!req.user.isVerified) {
    throw new ApiError(403, 'Please verify your email to continue', undefined, 'EMAIL_NOT_VERIFIED');
  }
  next();
};
