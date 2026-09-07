import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewKnowledgeConfigService } from '../services/EmployerInterviewKnowledgeConfigService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Per-interview opt-in RAG configuration (29D). */
export class EmployerInterviewKnowledgeConfigController {
  public getConfig = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const result = await employerInterviewKnowledgeConfigService.getConfig(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Knowledge configuration retrieved successfully', result));
  });

  public updateConfig = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { interviewId } = req.params;
    const { enabled, knowledgeBaseIds, maxRetrievedChunks } = req.body ?? {};
    const result = await employerInterviewKnowledgeConfigService.updateConfig(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      interviewId,
      {
        enabled: Boolean(enabled),
        knowledgeBaseIds: Array.isArray(knowledgeBaseIds) ? knowledgeBaseIds : [],
        maxRetrievedChunks: typeof maxRetrievedChunks === 'number' ? maxRetrievedChunks : undefined,
      }
    );
    res.status(200).json(successResponse('Knowledge configuration saved successfully', result));
  });
}

export const employerInterviewKnowledgeConfigController = new EmployerInterviewKnowledgeConfigController();
export default employerInterviewKnowledgeConfigController;
