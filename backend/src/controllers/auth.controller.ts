import { Response } from 'express';
import crypto from 'crypto';
import { User } from '../models/user.model';
import { ApiError } from '../utils/ApiError';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';
import { userSubscriptionService } from '../services/UserSubscriptionService';

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

export const forgotPassword = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      throw new ApiError(404, 'No user found with that email');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

    await user.save({ validateBeforeSave: false });

    res.status(200).json(
      successResponse('Password reset token sent', {
        resetToken,
        message:
          'In production, this token would be sent via email. For development, use this token.',
      })
    );
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
