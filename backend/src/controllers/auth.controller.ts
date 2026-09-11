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

const PASSWORD_RESET_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MINUTES = PASSWORD_RESET_EXPIRY_MS / (60 * 1000);
const GENERIC_FORGOT_PASSWORD_MESSAGE = 'If an account exists for this email, password reset instructions have been sent.';

const sendTokenResponse = (user: any, statusCode: number, res: Response) => {
  const token = user.generateToken();

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

  user.password = undefined as any;
  sendTokenResponse(user, 201, res);
});

export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  if (!user.isActive) {
    throw new ApiError(401, 'Your account has been deactivated');
  }

  user.lastLogin = new Date();
  await user.save();

  user.password = undefined as any;
  sendTokenResponse(user, 200, res);
});

export const logout = catchAsync(async (_req: AuthRequest, res: Response) => {
  res.status(200).json(successResponse('Logged out successfully'));
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

    user.password = undefined as any;
    sendTokenResponse(user, 200, res);
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

    if (user) {
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
    });

    if (!user) {
      throw new ApiError(400, 'Invalid or expired reset token');
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    user.password = undefined as any;
    sendTokenResponse(user, 200, res);
  }
);
