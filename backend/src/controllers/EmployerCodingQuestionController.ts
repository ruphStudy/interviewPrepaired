import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingQuestionService } from '../services/EmployerCodingQuestionService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Coding question foundation (30A) — definitions only, no execution, no AI. */
export class EmployerCodingQuestionController {
  public createQuestion = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const result = await employerCodingQuestionService.createQuestion(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      req.body
    );
    res.status(201).json(successResponse('Coding question created successfully', result));
  });

  public listQuestions = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { jobId, interviewId, status } = req.query;
    const result = await employerCodingQuestionService.listQuestions(context.organizationId, context.role, {
      jobId: typeof jobId === 'string' ? jobId : undefined,
      interviewId: typeof interviewId === 'string' ? interviewId : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.status(200).json(successResponse('Coding questions retrieved successfully', result));
  });

  public getQuestion = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingQuestionService.getQuestion(context.organizationId, context.role, codingQuestionId);
    res.status(200).json(successResponse('Coding question retrieved successfully', result));
  });

  public updateQuestion = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingQuestionService.updateQuestion(context.organizationId, context.role, codingQuestionId, req.body);
    res.status(200).json(successResponse('Coding question updated successfully', result));
  });

  public markReady = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingQuestionService.markReady(context.organizationId, context.role, codingQuestionId);
    res.status(200).json(successResponse('Coding question marked ready successfully', result));
  });

  public archiveQuestion = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingQuestionService.archiveQuestion(context.organizationId, context.role, codingQuestionId);
    res.status(200).json(successResponse('Coding question archived successfully', result));
  });
}

export const employerCodingQuestionController = new EmployerCodingQuestionController();
export default employerCodingQuestionController;
