import { Response } from 'express';
import { User } from '../models/user.model';
import { Interview } from '../models/interview.model';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';
import {
  getInterviewUsage,
  getUserUsage,
  getGlobalUsage,
  UsageDateRange,
} from '../services/AIUsageService';
import { userSubscriptionService } from '../services/UserSubscriptionService';
import { interviewCreditService } from '../services/InterviewCreditService';

/** Shared by the three usage endpoints — malformed from/to must fail clearly rather than silently produce a wrong range. */
function parseUsageDateRange(query: Record<string, unknown>): UsageDateRange {
  const range: UsageDateRange = {};
  if (query.from !== undefined) {
    const from = new Date(String(query.from));
    if (isNaN(from.getTime())) throw new ApiError(400, 'Invalid "from" date');
    range.from = from;
  }
  if (query.to !== undefined) {
    const to = new Date(String(query.to));
    if (isNaN(to.getTime())) throw new ApiError(400, 'Invalid "to" date');
    range.to = to;
  }
  return range;
}

/**
 * Admin Dashboard Statistics
 * GET /api/admin/dashboard
 */
export const getDashboardStats = catchAsync(
  async (_req: AuthRequest, res: Response) => {
    // Total users
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    // Total interviews
    const totalInterviews = await Interview.countDocuments();
    const completedInterviews = await Interview.countDocuments({ status: 'completed' });
    const evaluatedInterviews = await Interview.countDocuments({ status: 'evaluated' });
    
    // Average score across all interviews
    const scoreAggregation = await Interview.aggregate([
      { $match: { 'finalReport.averageOverallScore': { $exists: true } } },
      {
        $group: {
          _id: null,
          averageScore: { $avg: '$finalReport.averageOverallScore' },
        },
      },
    ]);
    
    const averageScore = scoreAggregation.length > 0 
      ? parseFloat(scoreAggregation[0].averageScore.toFixed(2)) 
      : 0;
    
    // Most popular topics
    const topicAggregation = await Interview.aggregate([
      {
        $group: {
          _id: '$topic',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);
    
    // Recent interviews
    const recentInterviews = await Interview.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'name email')
      .lean();
    
    res.status(200).json(
      successResponse('Dashboard statistics retrieved successfully', {
        stats: {
          totalUsers,
          activeUsers,
          totalInterviews,
          completedInterviews,
          evaluatedInterviews,
          averageScore,
        },
        topicStats: topicAggregation.map((t) => ({
          topic: t._id,
          count: t.count,
        })),
        recentInterviews: recentInterviews.map((interview: any) => ({
          id: interview._id.toString(),
          topic: interview.topic,
          difficulty: interview.difficulty,
          status: interview.status,
          userName: interview.userId?.name || 'Unknown',
          userEmail: interview.userId?.email || 'Unknown',
          createdAt: interview.createdAt,
        })),
      })
    );
  }
);

/**
 * Get All Users (with pagination and search)
 * GET /api/admin/users
 */
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const search = req.query.search as string;
  const role = req.query.role as string;
  
  const query: any = {};
  
  if (search) {
    query.$or = [
      { name: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }
  
  if (role && ['user', 'admin'].includes(role)) {
    query.role = role;
  }
  
  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  
  res.status(200).json(
    successResponse('Users retrieved successfully', {
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  );
});

/**
 * Get User by ID
 * GET /api/admin/users/:id
 */
export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Get user's interview statistics
  const interviewStats = await Interview.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        evaluated: {
          $sum: { $cond: [{ $eq: ['$status', 'evaluated'] }, 1, 0] },
        },
        averageScore: { $avg: '$finalReport.averageOverallScore' },
      },
    },
  ]);
  
  const stats = interviewStats.length > 0 ? interviewStats[0] : {
    total: 0,
    completed: 0,
    evaluated: 0,
    averageScore: 0,
  };
  
  res.status(200).json(
    successResponse('User retrieved successfully', {
      user,
      interviewStats: stats,
    })
  );
});

/**
 * Update User
 * PUT /api/admin/users/:id
 */
export const updateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, email, role, isActive } = req.body;
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    {
      name,
      email,
      role,
      isActive,
      updatedAt: new Date(),
    },
    { new: true, runValidators: true }
  ).select('-password');
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  res.status(200).json(successResponse('User updated successfully', user));
});

/**
 * Delete User
 * DELETE /api/admin/users/:id
 */
export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndDelete(req.params.id);
  
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  
  // Also delete all user's interviews
  await Interview.deleteMany({ userId: user._id });
  
  res.status(200).json(
    successResponse('User and associated interviews deleted successfully')
  );
});

/**
 * Get All Interviews (Admin view)
 * GET /api/admin/interviews
 */
export const getAllInterviews = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const topic = req.query.topic as string;
    
    const query: any = {};
    
    if (status) {
      query.status = status;
    }
    
    if (topic) {
      query.topic = new RegExp(topic, 'i');
    }
    
    const total = await Interview.countDocuments(query);
    const interviews = await Interview.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    
    res.status(200).json(
      successResponse('Interviews retrieved successfully', {
        interviews: interviews.map((interview: any) => ({
          id: interview._id.toString(),
          topic: interview.topic,
          difficulty: interview.difficulty,
          status: interview.status,
          totalQuestions: interview.totalQuestions,
          currentQuestion: interview.currentQuestion,
          overallScore: interview.finalReport?.averageOverallScore || 0,
          userName: interview.userId?.name || 'Unknown',
          userEmail: interview.userId?.email || 'Unknown',
          createdAt: interview.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      })
    );
  }
);

/**
 * Delete Interview (Admin)
 * DELETE /api/admin/interviews/:id
 */
export const deleteInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await Interview.findByIdAndDelete(req.params.id);
    
    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }
    
    res.status(200).json(successResponse('Interview deleted successfully'));
  }
);

/**
 * Get Analytics Data
 * GET /api/admin/analytics
 */
export const getAnalytics = catchAsync(async (_req: AuthRequest, res: Response) => {
  // Interviews over time (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const interviewTrend = await Interview.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  
  // Score distribution
  const scoreDistribution = await Interview.aggregate([
    { $match: { 'finalReport.averageOverallScore': { $exists: true } } },
    {
      $bucket: {
        groupBy: '$finalReport.averageOverallScore',
        boundaries: [0, 2, 4, 6, 8, 10],
        default: 'Other',
        output: {
          count: { $sum: 1 },
        },
      },
    },
  ]);
  
  // Average scores by difficulty
  const scoresByDifficulty = await Interview.aggregate([
    { $match: { 'finalReport.averageOverallScore': { $exists: true } } },
    {
      $group: {
        _id: '$difficulty',
        averageScore: { $avg: '$finalReport.averageOverallScore' },
        count: { $sum: 1 },
      },
    },
  ]);
  
  res.status(200).json(
    successResponse('Analytics data retrieved successfully', {
      interviewTrend,
      scoreDistribution,
      scoresByDifficulty,
    })
  );
});

/**
 * Get AI usage/cost for one interview
 * GET /api/admin/usage/interview/:interviewId
 */
export const getInterviewAIUsage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { interviewId } = req.params;
  const usage = await getInterviewUsage(interviewId);
  if (!usage) {
    throw new ApiError(404, 'Interview not found');
  }
  res.status(200).json(successResponse('Interview AI usage retrieved successfully', usage));
});

/**
 * Get AI usage/cost aggregated across one user's interviews
 * GET /api/admin/usage/user/:userId?from=&to=
 */
export const getUserAIUsage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const range = parseUsageDateRange(req.query as Record<string, unknown>);
  const usage = await getUserUsage(userId, range);
  if (!usage) {
    throw new ApiError(400, 'Invalid user ID');
  }
  res.status(200).json(successResponse('User AI usage retrieved successfully', usage));
});

/**
 * Get AI usage/cost aggregated across all interviews
 * GET /api/admin/usage?from=&to=
 */
export const getGlobalAIUsage = catchAsync(async (req: AuthRequest, res: Response) => {
  const range = parseUsageDateRange(req.query as Record<string, unknown>);
  const usage = await getGlobalUsage(range);
  res.status(200).json(successResponse('Global AI usage retrieved successfully', usage));
});

// ============================================================================
// User Subscription / Interview Credit Admin Controls
// ============================================================================

/**
 * Get a user's current subscription, plan, and credit balance.
 * GET /api/admin/users/:userId/subscription
 */
export const getUserSubscriptionAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select('name email');
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Lazily backfills a FREE subscription/credit for a legacy user with none.
  const { plan, subscription } = await userSubscriptionService.getSubscriptionDetails(userId);
  const balance = await interviewCreditService.getBalance(userId);

  res.status(200).json(
    successResponse('User subscription retrieved successfully', {
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
      },
      plan: {
        code: plan.code,
        name: plan.name,
        priceInrPaise: plan.priceInrPaise,
        billingInterval: plan.billingInterval,
        includedInterviews: plan.includedInterviews,
      },
      subscription: {
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        startedAt: subscription.startedAt,
        cancelledAt: subscription.cancelledAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        source: subscription.source,
      },
      credits: { balance },
    })
  );
});

/**
 * Manually assign/change a user's plan (admin operation — no payment verification).
 * POST /api/admin/users/:userId/subscription/plan
 */
export const changeUserPlanAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { planCode } = req.body;

  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    throw new ApiError(404, 'User not found');
  }

  // Plan-credit grant behavior lives entirely inside UserSubscriptionService/
  // InterviewCreditService — not duplicated here.
  const subscription = await userSubscriptionService.changePlan(userId, planCode, 'admin');
  const balance = await interviewCreditService.getBalance(userId);

  res.status(200).json(
    successResponse('User plan updated successfully', {
      subscription: {
        planCode: subscription.planCode,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        startedAt: subscription.startedAt,
        source: subscription.source,
      },
      credits: { balance },
    })
  );
});

/**
 * Manually add or remove interview credits for a user.
 * POST /api/admin/users/:userId/credits/adjust
 */
export const adjustUserCreditsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;
  const { amount, reason, idempotencyKey } = req.body;

  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    throw new ApiError(404, 'User not found');
  }

  const transaction = await interviewCreditService.adjustCredits({
    userId,
    amount,
    reason,
    adminUserId: req.user?.id,
    idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
  });

  res.status(200).json(
    successResponse('Credit adjustment applied successfully', {
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      description: transaction.description,
      createdAt: transaction.createdAt,
    })
  );
});

/**
 * Get a user's credit balance + paginated transaction history.
 * GET /api/admin/users/:userId/credits?page=&limit=
 */
export const getUserCreditsAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    throw new ApiError(404, 'User not found');
  }

  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

  const [balance, ledgerPage] = await Promise.all([
    interviewCreditService.getBalance(userId),
    interviewCreditService.getLedger(userId, { page, limit }),
  ]);

  res.status(200).json(
    successResponse('User credit history retrieved successfully', {
      balance,
      page: ledgerPage.page,
      limit: ledgerPage.limit,
      total: ledgerPage.total,
      transactions: ledgerPage.transactions.map((tx) => ({
        type: tx.type,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        description: tx.description,
        referenceType: tx.referenceType,
        createdAt: tx.createdAt,
      })),
    })
  );
});

/**
 * Cancel a user's current subscription (admin operation — no refund).
 * POST /api/admin/users/:userId/subscription/cancel
 */
export const cancelUserSubscriptionAdmin = catchAsync(async (req: AuthRequest, res: Response) => {
  const { userId } = req.params;

  const userExists = await User.exists({ _id: userId });
  if (!userExists) {
    throw new ApiError(404, 'User not found');
  }

  const cancelAtPeriodEnd = req.body?.cancelAtPeriodEnd === true;
  const subscription = await userSubscriptionService.cancelSubscription(userId, cancelAtPeriodEnd);

  if (!subscription) {
    res.status(200).json(successResponse('No active subscription to cancel'));
    return;
  }

  res.status(200).json(
    successResponse('User subscription cancelled successfully', {
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      cancelledAt: subscription.cancelledAt,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
  );
});
