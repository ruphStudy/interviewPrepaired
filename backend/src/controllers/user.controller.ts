import { Response } from 'express';
import { User } from '../models/user.model';
import { Interview } from '../models/interview.model';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';
import { accountDeletionService } from '../services/AccountDeletionService';
import { emailVerificationService } from '../services/EmailVerificationService';

export const getUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  const users = await User.find().skip(skip).limit(limit).select('-password');
  const total = await User.countDocuments();

  res.status(200).json(
    successResponse('Users retrieved successfully', users, {
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  );
});

export const getUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (req.user!.role !== 'admin' && req.user!.id !== req.params.id) {
    throw new ApiError(403, 'Not authorized to access this user');
  }

  res.status(200).json(successResponse('User retrieved successfully', user));
});

export const updateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'admin' && req.user!.id !== req.params.id) {
    throw new ApiError(403, 'Not authorized to update this user');
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  if (req.body.name) user.name = req.body.name;
  if (req.body.avatar) user.avatar = req.body.avatar;
  if (req.body.preferences) user.preferences = req.body.preferences;

  // Changing the email must never leave the NEW address falsely marked
  // verified — reset the verification challenge and send a fresh one to
  // the new address, mirroring /auth/profile's own email-change handling.
  const nextEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;
  const emailChanged = nextEmail !== undefined && nextEmail !== user.email;
  if (emailChanged) {
    user.email = nextEmail as string;
    user.isVerified = false;
    user.emailVerifiedAt = undefined;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpire = undefined;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationCodeExpire = undefined;
    user.emailVerificationCodeAttempts = 0;
  }

  if (req.user!.role === 'admin') {
    if (req.body.role) user.role = req.body.role;
    if (typeof req.body.isActive !== 'undefined') user.isActive = req.body.isActive;
  }

  await user.save();

  if (emailChanged) {
    await emailVerificationService.sendVerificationEmail(user);
    user.emailVerificationTokenHash = undefined as any;
    user.emailVerificationCodeHash = undefined as any;
  }

  user.password = undefined as any;
  res.status(200).json(successResponse('User updated successfully', user));
});

/**
 * Legacy admin-only DELETE /users/:id compatibility path. Never hard-delete
 * the User row: route through the same privacy-safe lifecycle used by the
 * main admin endpoint so sessions are revoked, PII is anonymized, cleanup is
 * queued, and financial/audit records remain intact.
 */
export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  await accountDeletionService.requestDeletionByAdmin(req.params.id, req.user!.id);
  res.status(202).json(
    successResponse('User account deletion is processing. Access has been revoked and personal data cleanup is queued.')
  );
});

export const getUserStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  const [user, interviews] = await Promise.all([
    User.findById(userId).select('-password'),
    Interview.find({ userId }),
  ]);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const completedInterviews = interviews.filter(
    (i) => i.status === 'completed' || i.status === 'evaluated'
  );

  const evaluatedInterviews = interviews.filter((i) => i.finalReport);

  const averageScore =
    evaluatedInterviews.length > 0
      ? evaluatedInterviews.reduce(
          (sum, i) => sum + (i.finalReport?.overallScore || 0),
          0
        ) / evaluatedInterviews.length
      : 0;

  const typeBreakdown = interviews.reduce((acc: any, interview) => {
    acc[interview.topic] = (acc[interview.topic] || 0) + 1;
    return acc;
  }, {});

  const difficultyBreakdown = interviews.reduce((acc: any, interview) => {
    acc[interview.difficulty] = (acc[interview.difficulty] || 0) + 1;
    return acc;
  }, {});

  const recentInterviews = interviews
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  const stats = {
    totalInterviews: interviews.length,
    completedInterviews: completedInterviews.length,
    evaluatedInterviews: evaluatedInterviews.length,
    averageScore: parseFloat(averageScore.toFixed(2)),
    lastInterviewDate: interviews.length > 0 ? interviews[interviews.length - 1].createdAt : null,
    typeBreakdown,
    difficultyBreakdown,
    recentInterviews,
  };

  user.stats = {
    totalInterviews: stats.totalInterviews,
    completedInterviews: stats.completedInterviews,
    averageScore: stats.averageScore,
    lastInterviewDate: stats.lastInterviewDate || undefined,
  };

  await user.save();

  res.status(200).json(successResponse('User stats retrieved successfully', stats));
});