import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteInterviewTemplateService } from '../services/InstituteInterviewTemplateService';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteInterviewTemplateController {
  /**
   * GET /api/v1/organizations/:organizationId/interview-templates
   * Requires QUESTION_SETS_VIEW.
   */
  public getTemplates = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as InstituteInterviewTemplateStatus | undefined;
    const courseId = req.query.courseId as string | undefined;
    const batchId = req.query.batchId as string | undefined;

    const result = await instituteInterviewTemplateService.getTemplates(context.organizationId, context.role, {
      page,
      limit,
      status,
      courseId,
      batchId,
    });

    res.status(200).json(successResponse('Institute interview templates retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/interview-templates/:templateId
   * Requires QUESTION_SETS_VIEW.
   */
  public getTemplate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { templateId } = req.params;
    const template = await instituteInterviewTemplateService.getTemplateById(context.organizationId, context.role, templateId);

    res.status(200).json(successResponse('Institute interview template retrieved successfully', { template }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/interview-templates
   * Requires QUESTION_SETS_MANAGE.
   */
  public createTemplate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { name, description, questionSetId, courseId, batchId, interviewConfig } = req.body;

    const template = await instituteInterviewTemplateService.createTemplate(context.organizationId, context.role, {
      name,
      description,
      questionSetId,
      courseId,
      batchId,
      interviewConfig,
    });

    res.status(201).json(successResponse('Institute interview template created successfully', { template }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/interview-templates/:templateId
   * Requires QUESTION_SETS_MANAGE. PATCH-like merge; status is never accepted here.
   */
  public updateTemplate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { templateId } = req.params;
    const { name, description, questionSetId, courseId, batchId, interviewConfig } = req.body;

    const template = await instituteInterviewTemplateService.updateTemplate(context.organizationId, context.role, templateId, {
      name,
      description,
      questionSetId,
      courseId,
      batchId,
      interviewConfig,
    });

    res.status(200).json(successResponse('Institute interview template updated successfully', { template }));
  });

  /**
   * DELETE /api/v1/organizations/:organizationId/interview-templates/:templateId
   * Requires QUESTION_SETS_MANAGE. Soft deactivate only.
   */
  public removeTemplate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { templateId } = req.params;
    await instituteInterviewTemplateService.removeTemplate(context.organizationId, context.role, templateId);

    res.status(200).json(successResponse('Institute interview template removed successfully', null));
  });
}

export default new InstituteInterviewTemplateController();
