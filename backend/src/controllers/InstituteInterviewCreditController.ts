import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { instituteInterviewCreditService } from '../services/InstituteInterviewCreditService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class InstituteInterviewCreditController {
  /** GET /api/v1/organizations/:organizationId/interview-credits */
  public getCreditSummary = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const summary = await instituteInterviewCreditService.getCreditSummary(context.organizationId, context.role);
    res.status(200).json(successResponse('Interview credit summary retrieved successfully', summary));
  });

  /** GET /api/v1/organizations/:organizationId/interview-credits/ledger */
  public getLedger = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await instituteInterviewCreditService.getLedger(context.organizationId, context.role, { page, limit });
    res.status(200).json(successResponse('Interview credit ledger retrieved successfully', result));
  });

  /** POST /api/v1/organizations/:organizationId/interview-credits/grant */
  public grantCredits = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { planCode, amount, idempotencyKey } = req.body;

    const transaction = await instituteInterviewCreditService.grantCredits(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      { planCode, amount, idempotencyKey }
    );

    res.status(200).json(successResponse('Interview credits granted successfully', { transaction }));
  });
}

export default new InstituteInterviewCreditController();
