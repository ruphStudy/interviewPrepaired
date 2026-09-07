import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationKnowledgeIndexService } from '../services/OrganizationKnowledgeIndexService';
import { organizationKnowledgeRetrievalService } from '../services/OrganizationKnowledgeRetrievalService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Chunking/indexing/retrieval (29C) — employer-only, never a candidate/public endpoint. */
export class OrganizationKnowledgeIndexController {
  public indexDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId, documentId } = req.params;
    const result = await organizationKnowledgeIndexService.indexDocument(context.organizationId, context.role, knowledgeBaseId, documentId);
    res.status(200).json(successResponse('Document indexed successfully', result));
  });

  public indexKnowledgeBase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeIndexService.indexKnowledgeBase(context.organizationId, context.role, knowledgeBaseId);
    res.status(200).json(successResponse('Knowledge base indexed successfully', result));
  });

  public search = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseIds, query, limit } = req.body ?? {};
    const result = await organizationKnowledgeRetrievalService.retrieve(context.organizationId, context.role, {
      knowledgeBaseIds: Array.isArray(knowledgeBaseIds) ? knowledgeBaseIds : undefined,
      query: typeof query === 'string' ? query : '',
      limit: typeof limit === 'number' ? limit : undefined,
    });
    res.status(200).json(successResponse('Search completed successfully', result));
  });
}

export const organizationKnowledgeIndexController = new OrganizationKnowledgeIndexController();
export default organizationKnowledgeIndexController;
