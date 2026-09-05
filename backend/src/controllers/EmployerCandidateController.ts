import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateService } from '../services/EmployerCandidateService';
import { employerCandidateSourceAttributionService } from '../services/EmployerCandidateSourceAttributionService';
import { EmployerCandidateSource, EmployerCandidateStatus } from '../constants/employerCandidate';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateController {
  /**
   * GET /api/v1/organizations/:organizationId/candidates
   * Requires ORGANIZATION_VIEW.
   */
  public getCandidates = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as EmployerCandidateStatus | undefined;
    const source = req.query.source as EmployerCandidateSource | undefined;
    const search = req.query.search as string | undefined;

    const result = await employerCandidateService.getCandidates(context.organizationId, context.role, {
      page,
      limit,
      status,
      source,
      search,
    });

    res.status(200).json(successResponse('Candidates retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/candidates/:candidateId
   * Requires ORGANIZATION_VIEW.
   */
  public getCandidate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const candidate = await employerCandidateService.getCandidateById(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Candidate retrieved successfully', { candidate }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/candidates
   * Requires INTERVIEWS_MANAGE. `status` always starts at active
   * server-side; `createdByMembershipId` is always the caller's own
   * trusted membership id.
   */
  public createCandidate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      headline,
      currentCompany,
      currentTitle,
      location,
      totalExperienceYears,
      linkedinUrl,
      portfolioUrl,
      githubUrl,
      noticePeriodDays,
      currentSalary,
      expectedSalary,
      salaryCurrency,
      source,
      notes,
      tags,
      sourceDetails,
    } = req.body;

    const candidate = await employerCandidateService.createCandidate(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      {
        firstName,
        lastName,
        email,
        phone,
        headline,
        currentCompany,
        currentTitle,
        location,
        totalExperienceYears,
        linkedinUrl,
        portfolioUrl,
        githubUrl,
        noticePeriodDays,
        currentSalary,
        expectedSalary,
        salaryCurrency,
        source,
        notes,
        tags,
      }
    );

    // Optional, best-effort: append ONE source-attribution record for the
    // same source the candidate was just created with (18E). Never blocks
    // or rolls back candidate creation — a failure here is logged and
    // swallowed, since the candidate itself was already created
    // successfully and must never be deleted because of this.
    if (sourceDetails && typeof sourceDetails === 'object' && !Array.isArray(sourceDetails)) {
      try {
        await employerCandidateSourceAttributionService.createAttribution(
          context.organizationId,
          context.role,
          context.member._id.toString(),
          candidate.id as string,
          {
            source: candidate.source as EmployerCandidateSource,
            sourceName: sourceDetails.sourceName,
            externalReferenceId: sourceDetails.externalReferenceId,
            referrerName: sourceDetails.referrerName,
            referrerEmail: sourceDetails.referrerEmail,
            agencyName: sourceDetails.agencyName,
            jobPortalName: sourceDetails.jobPortalName,
            campaignName: sourceDetails.campaignName,
            sourceUrl: sourceDetails.sourceUrl,
          }
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[EmployerCandidateController] Candidate ${candidate.id} created but its source attribution failed to save`, error);
      }
    }

    res.status(201).json(successResponse('Candidate created successfully', { candidate }));
  });

  /**
   * PUT /api/v1/organizations/:organizationId/candidates/:candidateId
   * Requires INTERVIEWS_MANAGE. PATCH-like merge; status is never accepted here.
   */
  public updateCandidate = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      headline,
      currentCompany,
      currentTitle,
      location,
      totalExperienceYears,
      linkedinUrl,
      portfolioUrl,
      githubUrl,
      noticePeriodDays,
      currentSalary,
      expectedSalary,
      salaryCurrency,
      source,
      notes,
      tags,
    } = req.body;

    const candidate = await employerCandidateService.updateCandidate(context.organizationId, context.role, candidateId, {
      firstName,
      lastName,
      email,
      phone,
      headline,
      currentCompany,
      currentTitle,
      location,
      totalExperienceYears,
      linkedinUrl,
      portfolioUrl,
      githubUrl,
      noticePeriodDays,
      currentSalary,
      expectedSalary,
      salaryCurrency,
      source,
      notes,
      tags,
    });

    res.status(200).json(successResponse('Candidate updated successfully', { candidate }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/candidates/:candidateId/status
   * Requires INTERVIEWS_MANAGE. The ONLY way a candidate's status changes.
   */
  public updateCandidateStatus = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const { status } = req.body;

    const candidate = await employerCandidateService.updateCandidateStatus(context.organizationId, context.role, candidateId, status);

    res.status(200).json(successResponse('Candidate status updated successfully', { candidate }));
  });
}

export default new EmployerCandidateController();
