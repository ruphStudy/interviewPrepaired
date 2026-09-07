import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCrossAssessmentTalentIntelligenceService } from '../services/EmployerCrossAssessmentTalentIntelligenceService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Deterministic (NO AI) cross-assessment talent intelligence (32B). Employer-internal only; never a candidate comparison. */
export class EmployerCrossAssessmentTalentIntelligenceController {
  public buildIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { candidateId } = req.params;
    const result = await employerCrossAssessmentTalentIntelligenceService.buildIntelligence(context.organizationId, context.role, candidateId);
    res.status(200).json(successResponse('Cross-assessment intelligence built successfully', result));
  });

  public getIntelligence = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { candidateId } = req.params;
    const result = await employerCrossAssessmentTalentIntelligenceService.getIntelligence(context.organizationId, context.role, candidateId);
    res.status(200).json(successResponse('Cross-assessment intelligence retrieved successfully', result));
  });
}

export const employerCrossAssessmentTalentIntelligenceController = new EmployerCrossAssessmentTalentIntelligenceController();
export default employerCrossAssessmentTalentIntelligenceController;
