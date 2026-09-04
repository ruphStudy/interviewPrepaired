import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobService } from '../services/EmployerJobService';
import { EmployerJobStatus, EmployerJobWorkplaceType, EmployerJobEmploymentType } from '../constants/employerJob';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerJobController {
  /**
   * GET /api/v1/organizations/:organizationId/jobs
   * Requires ORGANIZATION_VIEW.
   */
  public getJobs = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as EmployerJobStatus | undefined;
    const department = req.query.department as string | undefined;
    const workplaceType = req.query.workplaceType as EmployerJobWorkplaceType | undefined;
    const employmentType = req.query.employmentType as EmployerJobEmploymentType | undefined;
    const search = req.query.search as string | undefined;

    const result = await employerJobService.getJobs(context.organizationId, context.role, {
      page,
      limit,
      status,
      department,
      workplaceType,
      employmentType,
      search,
    });

    res.status(200).json(successResponse('Jobs retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/jobs/:jobId
   * Requires ORGANIZATION_VIEW.
   */
  public getJob = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const job = await employerJobService.getJobById(context.organizationId, context.role, jobId);

    res.status(200).json(successResponse('Job retrieved successfully', { job }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/jobs
   * Requires INTERVIEWS_MANAGE. `status` always starts at draft server-side;
   * `createdByMembershipId` is always the caller's own trusted membership id.
   */
  public createJob = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const {
      title,
      jobCode,
      department,
      location,
      workplaceType,
      employmentType,
      experienceMinYears,
      experienceMaxYears,
      openings,
      description,
      responsibilities,
      requiredSkills,
      preferredSkills,
      salaryMin,
      salaryMax,
      salaryCurrency,
      applicationDeadline,
    } = req.body;

    const job = await employerJobService.createJob(context.organizationId, context.role, context.member._id.toString(), {
      title,
      jobCode,
      department,
      location,
      workplaceType,
      employmentType,
      experienceMinYears,
      experienceMaxYears,
      openings,
      description,
      responsibilities,
      requiredSkills,
      preferredSkills,
      salaryMin,
      salaryMax,
      salaryCurrency,
      applicationDeadline,
    });

    res.status(201).json(successResponse('Job created successfully', { job }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/jobs/:jobId
   * Requires INTERVIEWS_MANAGE. PATCH-like merge; status is never accepted here.
   */
  public updateJob = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const {
      title,
      jobCode,
      department,
      location,
      workplaceType,
      employmentType,
      experienceMinYears,
      experienceMaxYears,
      openings,
      description,
      responsibilities,
      requiredSkills,
      preferredSkills,
      salaryMin,
      salaryMax,
      salaryCurrency,
      applicationDeadline,
    } = req.body;

    const job = await employerJobService.updateJob(context.organizationId, context.role, jobId, {
      title,
      jobCode,
      department,
      location,
      workplaceType,
      employmentType,
      experienceMinYears,
      experienceMaxYears,
      openings,
      description,
      responsibilities,
      requiredSkills,
      preferredSkills,
      salaryMin,
      salaryMax,
      salaryCurrency,
      applicationDeadline,
    });

    res.status(200).json(successResponse('Job updated successfully', { job }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/jobs/:jobId/status
   * Requires INTERVIEWS_MANAGE. The ONLY way a job's status changes.
   * `changedByMembershipId` is always the caller's own trusted membership id
   * from organizationContext — never accepted from the request body.
   */
  public updateJobStatus = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const { status } = req.body;

    const job = await employerJobService.updateJobStatus(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      jobId,
      status
    );

    res.status(200).json(successResponse('Job status updated successfully', { job }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/jobs/:jobId/status-history
   * Requires ORGANIZATION_VIEW.
   */
  public getJobStatusHistory = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { jobId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await employerJobService.getStatusHistory(context.organizationId, context.role, jobId, { page, limit });

    res.status(200).json(successResponse('Job status history retrieved successfully', result));
  });
}

export default new EmployerJobController();
