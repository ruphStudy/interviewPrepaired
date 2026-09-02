import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { questionSetService } from '../services/QuestionSetService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

export class QuestionSetController {
  /**
   * POST /api/v1/question-sets
   * Create a reusable manual/saved question set for the authenticated user.
   */
  public createQuestionSet = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { name, description, questions } = req.body;

    const questionSet = await questionSetService.createQuestionSet({
      userId,
      name,
      description,
      questions,
    });

    res.status(201).json(successResponse('Question set created successfully', questionSet));
  });

  /**
   * GET /api/v1/question-sets
   * List the authenticated user's own question sets (lightweight, paginated).
   */
  public getQuestionSets = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await questionSetService.getQuestionSets({ userId, page, limit });

    res.status(200).json(successResponse('Question sets retrieved successfully', result));
  });

  /**
   * GET /api/v1/question-sets/:id
   * Full question set (including reference answers) — owner only.
   */
  public getQuestionSet = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    const questionSet = await questionSetService.getQuestionSet(userId, id);

    res.status(200).json(successResponse('Question set retrieved successfully', questionSet));
  });

  /**
   * PUT /api/v1/question-sets/:id
   * Update name/description and/or replace the saved question snapshot.
   */
  public updateQuestionSet = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    const { name, description, questions } = req.body;

    const questionSet = await questionSetService.updateQuestionSet({
      userId,
      questionSetId: id,
      name,
      description,
      questions,
    });

    res.status(200).json(successResponse('Question set updated successfully', questionSet));
  });

  /**
   * DELETE /api/v1/question-sets/:id
   * Deletes only the saved set — interviews previously started from it remain untouched.
   */
  public deleteQuestionSet = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;
    await questionSetService.deleteQuestionSet(userId, id);

    res.status(200).json(successResponse('Question set deleted successfully', null));
  });
}

export default new QuestionSetController();
