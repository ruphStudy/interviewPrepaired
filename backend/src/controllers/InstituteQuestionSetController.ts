import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteQuestionSetService } from '../services/InstituteQuestionSetService';
import { ApiError } from '../utils/ApiError';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteQuestionSetController {
  /** POST /api/v1/organizations/:organizationId/question-sets */
  public createQuestionSet = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, description, questions } = req.body;
    const questionSet = await instituteQuestionSetService.createQuestionSet(
      context.organizationId,
      context.role,
      context.member.userId.toString(),
      { name, description, questions }
    );

    res.status(201).json(createdResponse('Question set created successfully', { questionSet }));
  });

  /** GET /api/v1/organizations/:organizationId/question-sets */
  public getQuestionSets = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await instituteQuestionSetService.getQuestionSets(context.organizationId, context.role, {
      page,
      limit,
    });

    res.status(200).json(successResponse('Question sets retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/question-sets/:questionSetId */
  public getQuestionSet = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { questionSetId } = req.params;
    const questionSet = await instituteQuestionSetService.getQuestionSet(context.organizationId, context.role, questionSetId);

    res.status(200).json(successResponse('Question set retrieved successfully', { questionSet }));
  });

  /** PUT /api/v1/organizations/:organizationId/question-sets/:questionSetId */
  public updateQuestionSet = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { questionSetId } = req.params;
    const { name, description, questions } = req.body;
    const questionSet = await instituteQuestionSetService.updateQuestionSet(
      context.organizationId,
      context.role,
      questionSetId,
      { name, description, questions }
    );

    res.status(200).json(successResponse('Question set updated successfully', { questionSet }));
  });

  /** DELETE /api/v1/organizations/:organizationId/question-sets/:questionSetId */
  public deleteQuestionSet = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { questionSetId } = req.params;
    await instituteQuestionSetService.deleteQuestionSet(context.organizationId, context.role, questionSetId);

    res.status(200).json(successResponse('Question set deleted successfully', null));
  });
}

export default new InstituteQuestionSetController();
