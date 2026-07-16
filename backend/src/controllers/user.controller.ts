import { Response } from 'express';
import { User } from '../models/user.model';
import { Interview } from '../models/interview.model';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';

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

  const fieldsToUpdate: any = {};

  if (req.body.name) fieldsToUpdate.name = req.body.name;
  if (req.body.email) fieldsToUpdate.email = req.body.email;
  if (req.body.avatar) fieldsToUpdate.avatar = req.body.avatar;
  if (req.body.preferences) fieldsToUpdate.preferences = req.body.preferences;

  if (req.user!.role === 'admin') {
    if (req.body.role) fieldsToUpdate.role = req.body.role;
    if (typeof req.body.isActive !== 'undefined')
      fieldsToUpdate.isActive = req.body.isActive;
  }

  const user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
    new: true,
    runValidators: true,
  }).select('-password');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  res.status(200).json(successResponse('User updated successfully', user));
});

export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  await user.deleteOne();

  res.status(200).json(successResponse('User deleted successfully'));
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
    lastInterviewDate:
      interviews.length > 0
        ? interviews[interviews.length - 1].createdAt
        : null,
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
