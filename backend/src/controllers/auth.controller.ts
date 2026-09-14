import { Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';
import { userSubscriptionService } from '../services/UserSubscriptionService';
import { transactionalEmailService } from '../services/TransactionalEmailService';
import { renderPasswordResetEmail } from '../emails/templates';
import { EmailTemplateCode } from '../constants/email';
import { env } from '../config/environment';
import { authSessionService } from '../services/AuthSessionService';
import { authSecurityEventService } from '../services/AuthSecurityEventService';
import { emailVerificationService } from '../services/EmailVerificationService';
import { LOGIN_LOCKOUT_DURATION_MS, shouldLockAccount } from '../constants/authSecurity';
import { userConsentService } from '../services/UserConsentService';

const PASSWORD_RESET_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MINUTES = PASSWORD_RESET_EXPIRY_MS / (60 * 1000);
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account exists for this email, password reset instructions have been sent.';
const GENERIC_INVALID_CREDENTIALS = 'Invalid credentials';

const sendTokenResponse = async (user: any, statusCode: number, res: Response, userAgent?: string) => {
  const { token } = await authSessionService.createSession(user, userAgent);

  res.status(statusCode).json(
    statusCode === 201
      ? createdResponse('User registered successfully', { token, user })
      : successResponse('Login successful', { token, user })
  );
};

export const register = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'User already exists with this email');
  }

  const user = await User.create({
    name,
    email,
    password,
  });

  // Registration succeeds on core user creation alone — a FREE subscription
  // failure must never block account creation, only be logged clearly.
  try {
    await userSubscriptionService.ensureFreeSubscription(user._id.toString());
  } catch (error) {
    console.error('[auth.register] Failed to initialize FREE subscription for new user:', error);
  }

  // Best-effort (PR-PRIVACY-4) — route validators already require both
  // flags to be exactly `true`, so this always records an accepted consent
  // row; a failure here must never destroy the just-created user.
  try {
    await Promise.all([
      userConsentService.recordConsent(user._id.toString(), 'terms', env.termsVersion, true, 'registration'),
      userConsentService.recordConsent(user._id.toString(), 'privacy_policy', env.privacyPolicyVersion, true, 'registration'),
    ]);
  } catch (error) {
    console.error('[auth.register] Failed to record registration consent:', error);
  }

  // Best-effort — a provider outage must never destroy the just-created
  // user; the email is queued/retried through the existing PR-COMM
  // infrastructure regardless.
  await emailVerificationService.sendVerificationEmail(user);

  // `sendVerificationEmail` mutates this same in-memory document with the
  // verification token's hash/expiry — `select: false` on the schema only
  // suppresses these fields from future queries, not from a document
  // instance already held in memory, so they must be stripped explicitly
  // before the response is serialized (same reason `password` is stripped
  // below).
  user.password = undefined as any;
  user.emailVerificationTokenHash = undefined as any;
  await sendTokenResponse(user, 201, res, req.headers['user-agent']);
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const email = String(req.body.email).trim().toLowerCase();
  const { password } = req.body;
  const userAgent = req.headers['user-agent'];

  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +loginLockedUntil');

  // A deleted account gets the EXACT same response as a nonexistent one —
  // never a distinct "this account was deleted" message, and its
  // anonymized email will never match a real login attempt again anyway.
  if (!user || user.isDeleted) {
    await authSecurityEventService.record('login_failure', { userAgent, metadata: { reason: 'unknown_account' } });
    throw new ApiError(401, GENERIC_INVALID_CREDENTIALS, undefined, 'INVALID_CREDENTIALS');
  }

  // A locked account rejects EVERY attempt (even a correct password) until
  // the lock naturally expires — the response is identical to a wrong
  // password, so a locked account is never distinguishable from one that
  // simply exists with a different password.
  if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) {
    await authSecurityEventService.record('login_failure', { userId: user._id, userAgent, metadata: { reason: 'locked' } });
    throw new ApiError(401, GENERIC_INVALID_CREDENTIALS, undefined, 'INVALID_CREDENTIALS');
  }

  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    let justLocked = false;
    if (shouldLockAccount(user.failedLoginAttempts)) {
      user.loginLockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS);
      justLocked = true;
    }
    await user.save({ validateBeforeSave: false });
    await authSecurityEventService.record(justLocked ? 'account_temporarily_locked' : 'login_failure', {
      userId: user._id,
      userAgent,
    });
    throw new ApiError(401, GENERIC_INVALID_CREDENTIALS, undefined, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new ApiError(401, 'Your account has been deactivated', undefined, 'ACCOUNT_INACTIVE');
  }

  // Successful login resets brute-force counters.
  user.failedLoginAttempts = 0;
  user.loginLockedUntil = undefined;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  user.password = undefined as any;
  const { token, sessionId } = await authSessionService.createSession(user, userAgent);
  await authSecurityEventService.record('login_success', { userId: user._id, sessionId, userAgent });

  res.status(200).json(successResponse('Login successful', { token, user }));
});

/** Revokes ONLY the session this request's token belongs to — a pre-PR-AUTH-3 token has no sessionId and simply expires on its own JWT `exp`. */
export const logout = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.sessionId) {
    await authSessionService.revokeSession(req.sessionId, 'logout');
    await authSecurityEventService.record('logout', { userId: req.user?._id, sessionId: req.sessionId });
  }
  res.status(200).json(successResponse('Logged out successfully'));
});

/** POST /auth/logout-all — revokes every active session for the current user, including this one. */
export const logoutAll = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!._id.toString();
  await authSessionService.revokeAllSessions(userId, 'logout_all');
  await authSecurityEventService.record('logout_all', { userId: req.user!._id, sessionId: req.sessionId });
  res.status(200).json(successResponse('Signed out of all devices successfully'));
});

export const getMe = catchAsync(async (_req: AuthRequest, res: Response) => {
  const user = await User.findById(_req.user!.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json(successResponse('User retrieved successfully', user));
});

export const updateProfile = catchAsync(async (req: AuthRequest, res: Response) => {
  const fieldsToUpdate = {
    name: req.body.name,
    email: req.body.email,
    avatar: req.body.avatar,
    preferences: req.body.preferences,
  };

  const user = await User.findByIdAndUpdate(req.user!.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json(successResponse('Profile updated successfully', user));
});

/**
 * Safe default: revokes EVERY session (including the one making this
 * request) rather than trying to selectively keep the caller signed in —
 * the frontend clears its local token and sends the user back to login.
 */
export const updatePassword = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.user!.id).select('+password');

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    const isPasswordMatch = await user.comparePassword(req.body.currentPassword);

    if (!isPasswordMatch) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    user.password = req.body.newPassword;
    await user.save();

    await authSessionService.revokeAllSessions(user._id.toString(), 'password_changed');
    await authSecurityEventService.record('password_changed', { userId: user._id, userAgent: req.headers['user-agent'] });

    res.status(200).json(
      successResponse('Password changed successfully. Please sign in again.', { requiresReauthentication: true })
    );
  }
);

/**
 * Same generic response for both existing and non-existing accounts —
 * never reveals whether an account exists. The raw reset token exists in
 * memory only long enough to build the email link; only its SHA-256 hash
 * is ever persisted, and it is never logged, returned, or included in the
 * email delivery's metadata.
 */
export const forgotPassword = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const email = String(req.body.email).trim().toLowerCase();
    const user = await User.findOne({ email });

    // A deleted account's original email will never match its (anonymized)
    // stored email anyway, but this is an explicit second guard — there is
    // no account-recovery path for a deleted account, ever.
    if (user && !user.isDeleted) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      user.resetPasswordToken = resetPasswordToken;
      user.resetPasswordExpire = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${env.frontendUrl.replace(/\/$/, '')}/reset-password/${resetToken}`;
      const { subject, html, text } = renderPasswordResetEmail({
        resetUrl,
        expiryMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
      });

      try {
        await transactionalEmailService.sendTransactionalEmail({
          to: user.email,
          templateCode: EmailTemplateCode.PASSWORD_RESET,
          subject,
          html,
          text,
          // Keyed on the token's own hash (not the raw token) — a NEW
          // forgot-password request always produces a new hash, so a
          // deliberate re-request sends a fresh email, while a retried
          // HTTP call for the SAME request never double-sends.
          idempotencyKey: `password-reset:${user._id.toString()}:${resetPasswordToken}`,
          relatedEntityType: 'User',
          relatedEntityId: user._id.toString(),
        });
      } catch (error) {
        console.error('[auth.forgotPassword] Failed to enqueue password reset email', {
          userId: user._id.toString(),
        });
      }
      // `resetToken` goes out of scope here — it is never logged or returned.
    }

    res.status(200).json(successResponse(GENERIC_FORGOT_PASSWORD_MESSAGE));
  }
);

export const resetPassword = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    }).select('+resetPasswordToken');

    if (!user) {
      throw new ApiError(400, 'Invalid or expired reset token', undefined, 'PASSWORD_RESET_INVALID');
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Mandatory — a reset must invalidate every previously issued session,
    // otherwise a stolen JWT would remain usable after the password changes.
    await authSessionService.revokeAllSessions(user._id.toString(), 'password_reset');
    await authSecurityEventService.record('password_reset', { userId: user._id, userAgent: req.headers['user-agent'] });

    res.status(200).json(successResponse('Password reset successfully. Please sign in with your new password.'));
  }
);

/** GET /auth/verify-email/:token — public. Never leaks whether any account exists beyond invalid-vs-expired. */
export const verifyEmail = catchAsync(async (req: AuthRequest, res: Response) => {
  const outcome = await emailVerificationService.verifyToken(req.params.token);
  const message = outcome === 'already_verified' ? 'This email is already verified.' : 'Email verified successfully.';
  res.status(200).json(successResponse(message, { status: outcome }));
});

/** POST /auth/resend-verification — authenticated only, so there is no email-based enumeration surface at all. */
export const resendVerification = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const outcome = await emailVerificationService.resendVerification(user);
  const messages: Record<string, string> = {
    sent: 'Verification email sent.',
    already_verified: 'This email is already verified.',
    cooldown: 'A verification email was just sent — please check your inbox before requesting another.',
  };
  res.status(200).json(successResponse(messages[outcome], { status: outcome }));
});
