import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { organizationKnowledgeDocumentService } from '../services/OrganizationKnowledgeDocumentService';
import { getKnowledgeDocumentFileExtension } from '../constants/organizationKnowledgeDocument';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. Organization Knowledge Base document upload/parsing (29B) — no embeddings, no AI. `rawText`/full content is NEVER exposed to any public/candidate-facing API. */
export class OrganizationKnowledgeDocumentController {
  public listDocuments = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeDocumentService.listDocuments(context.organizationId, context.role, knowledgeBaseId);
    res.status(200).json(successResponse('Documents retrieved successfully', result));
  });

  public getDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId, documentId } = req.params;
    const result = await organizationKnowledgeDocumentService.getDocument(context.organizationId, context.role, knowledgeBaseId, documentId);
    res.status(200).json(successResponse('Document retrieved successfully', result));
  });

  public getDocumentContent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId, documentId } = req.params;
    const result = await organizationKnowledgeDocumentService.getDocumentContent(context.organizationId, context.role, knowledgeBaseId, documentId);
    res.status(200).json(successResponse('Document content retrieved successfully', result));
  });

  public uploadDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    if (!req.file) {
      throw new ApiError(400, 'A file is required');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeDocumentService.uploadDocument(
      context.organizationId,
      context.role,
      knowledgeBaseId,
      context.member._id.toString(),
      {
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        description: typeof req.body?.description === 'string' ? req.body.description : undefined,
        buffer: req.file.buffer,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        fileExtension: getKnowledgeDocumentFileExtension(req.file.originalname),
      }
    );

    res.status(201).json(successResponse('Document uploaded successfully', result));
  });

  public createTextDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId } = req.params;
    const result = await organizationKnowledgeDocumentService.createTextDocument(
      context.organizationId,
      context.role,
      knowledgeBaseId,
      context.member._id.toString(),
      req.body
    );

    res.status(201).json(successResponse('Document created successfully', result));
  });

  public reprocessDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId, documentId } = req.params;
    const result = await organizationKnowledgeDocumentService.reprocessDocument(context.organizationId, context.role, knowledgeBaseId, documentId);
    res.status(200).json(successResponse('Document reprocessed successfully', result));
  });

  public archiveDocument = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { knowledgeBaseId, documentId } = req.params;
    const result = await organizationKnowledgeDocumentService.archiveDocument(context.organizationId, context.role, knowledgeBaseId, documentId);
    res.status(200).json(successResponse('Document archived successfully', result));
  });
}

export default new OrganizationKnowledgeDocumentController();
