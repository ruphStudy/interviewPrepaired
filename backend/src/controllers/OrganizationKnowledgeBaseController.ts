import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationKnowledgeBaseService } from '../services/OrganizationKnowledgeBaseService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Organization-internal Knowledge Base metadata (29A) — no embeddings, no AI. */
export class OrganizationKnowledgeBaseController {
  public createKnowledgeBase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const result = await organizationKnowledgeBaseService.createKnowledgeBase(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      req.body
    );

    res.status(201).json(successResponse('Knowledge base created successfully', result));
  });

  public listKnowledgeBases = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const result = await organizationKnowledgeBaseService.listKnowledgeBases(context.organizationId, context.role);
    res.status(200).json(successResponse('Knowledge bases retrieved successfully', result));
  });

  public getKnowledgeBase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeBaseService.getKnowledgeBase(context.organizationId, context.role, knowledgeBaseId);
    res.status(200).json(successResponse('Knowledge base retrieved successfully', result));
  });

  public updateKnowledgeBase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeBaseService.updateKnowledgeBase(context.organizationId, context.role, knowledgeBaseId, req.body);
    res.status(200).json(successResponse('Knowledge base updated successfully', result));
  });

  public archiveKnowledgeBase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeBaseService.archiveKnowledgeBase(context.organizationId, context.role, knowledgeBaseId);
    res.status(200).json(successResponse('Knowledge base archived successfully', result));
  });
}

export default new OrganizationKnowledgeBaseController();
