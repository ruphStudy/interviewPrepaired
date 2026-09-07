import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCodingTestCaseService } from '../services/EmployerCodingTestCaseService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Employer-internal only — hidden test cases must never reach a candidate/public API. */
export class EmployerCodingTestCaseController {
  public listTestCases = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingTestCaseService.listTestCases(context.organizationId, context.role, codingQuestionId);
    res.status(200).json(successResponse('Test cases retrieved successfully', result));
  });

  public addTestCase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId } = req.params;
    const result = await employerCodingTestCaseService.addTestCase(context.organizationId, context.role, codingQuestionId, req.body);
    res.status(201).json(successResponse('Test case added successfully', result));
  });

  public updateTestCase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId, testCaseId } = req.params;
    const result = await employerCodingTestCaseService.updateTestCase(context.organizationId, context.role, codingQuestionId, testCaseId, req.body);
    res.status(200).json(successResponse('Test case updated successfully', result));
  });

  public archiveTestCase = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { codingQuestionId, testCaseId } = req.params;
    const result = await employerCodingTestCaseService.archiveTestCase(context.organizationId, context.role, codingQuestionId, testCaseId);
    res.status(200).json(successResponse('Test case archived successfully', result));
  });
}

export const employerCodingTestCaseController = new EmployerCodingTestCaseController();
export default employerCodingTestCaseController;
