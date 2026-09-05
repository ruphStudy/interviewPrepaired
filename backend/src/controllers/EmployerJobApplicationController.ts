import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationService } from '../services/EmployerJobApplicationService';
import { EmployerJobApplicationSource, EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobApplicationController {
  /** GET /api/v1/organizations/:organizationId/applications — requires ORGANIZATION_VIEW. */
  public getApplications = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const jobId = req.query.jobId as string | undefined;
    const candidateId = req.query.candidateId as string | undefined;
    const status = req.query.status as EmployerJobApplicationStatus | undefined;
    const source = req.query.source as EmployerJobApplicationSource | undefined;
    const search = req.query.search as string | undefined;

    const result = await employerJobApplicationService.getApplications(context.organizationId, context.role, {
      page,
      limit,
      jobId,
      candidateId,
      status,
      source,
      search,
    });

    res.status(200).json(successResponse('Applications retrieved successfully', result));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId — requires ORGANIZATION_VIEW. */
  public getApplication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const application = await employerJobApplicationService.getApplicationById(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Application retrieved successfully', { application }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/applications
   * Requires INTERVIEWS_MANAGE. `createdByMembershipId` is always the
   * caller's own trusted membership id — never accepted from the body.
   */
  public createApplication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId, candidateId, source, notes } = req.body;

    const application = await employerJobApplicationService.createApplication(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      { jobId, candidateId, source, notes }
    );

    res.status(201).json(successResponse('Application created successfully', { application }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/applications/:applicationId
   * Requires INTERVIEWS_MANAGE. PATCH-like merge; status is never accepted here.
   */
  public updateApplication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { notes, source } = req.body;

    const application = await employerJobApplicationService.updateApplication(context.organizationId, context.role, applicationId, {
      notes,
      source,
    });

    res.status(200).json(successResponse('Application updated successfully', { application }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/applications/:applicationId/status
   * Requires INTERVIEWS_MANAGE. The ONLY way an application's status changes.
   */
  public updateApplicationStatus = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { status } = req.body;

    const application = await employerJobApplicationService.updateApplicationStatus(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      status
    );

    res.status(200).json(successResponse('Application status updated successfully', { application }));
  });
}

export default new EmployerJobApplicationController();
