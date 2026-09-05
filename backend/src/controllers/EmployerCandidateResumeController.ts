import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateResumeService } from '../services/EmployerCandidateResumeService';
import { getResumeFileExtension } from '../constants/employerCandidateResume';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Every method here runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time these run. */
export class EmployerCandidateResumeController {
  /**
   * GET /api/v1/organizations/:organizationId/candidates/:candidateId/resumes
   * Requires ORGANIZATION_VIEW.
   */
  public getResumes = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId } = req.params;
    const result = await employerCandidateResumeService.getResumes(context.organizationId, context.role, candidateId);

    res.status(200).json(successResponse('Resumes retrieved successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/candidates/:candidateId/resumes/:resumeSourceId
   * Requires ORGANIZATION_VIEW. Metadata only — see getResumeFile for the actual file.
   */
  public getResume = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId, resumeSourceId } = req.params;
    const resume = await employerCandidateResumeService.getResumeById(
      context.organizationId,
      context.role,
      candidateId,
      resumeSourceId
    );

    res.status(200).json(successResponse('Resume retrieved successfully', { resume }));
  });

  /**
   * POST /api/v1/organizations/:organizationId/candidates/:candidateId/resumes
   * Requires INTERVIEWS_MANAGE. multipart/form-data, field name "resume".
   */
  public uploadResume = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    if (!req.file) {
      throw new ApiError(400, 'A resume file is required (field name "resume")');
    }

    const { candidateId } = req.params;
    const file = req.file;

    const resume = await employerCandidateResumeService.uploadResume(
      context.organizationId,
      context.role,
      candidateId,
      context.member._id.toString(),
      {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        fileExtension: getResumeFileExtension(file.originalname),
        buffer: file.buffer,
      }
    );

    res.status(201).json(successResponse('Resume uploaded successfully', { resume }));
  });

  /**
   * GET /api/v1/organizations/:organizationId/candidates/:candidateId/resumes/:resumeSourceId/file
   * Requires ORGANIZATION_VIEW. Streams the stored file — the path is
   * resolved entirely server-side from the tenant-scoped DB row, never from
   * client input.
   */
  public getResumeFile = catchAsync(async (req: OrganizationAuthRequest, res: Response, next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { candidateId, resumeSourceId } = req.params;
    const { absolutePath, originalFileName } = await employerCandidateResumeService.getResumeFileForDownload(
      context.organizationId,
      context.role,
      candidateId,
      resumeSourceId
    );

    res.download(absolutePath, originalFileName, (error) => {
      // Express's content-disposition handling has already run by the time
      // this callback can fire for a "file not found" case; guard against a
      // double-send if headers somehow already went out.
      if (error && !res.headersSent) {
        next(new ApiError(404, 'Resume file not found'));
      }
    });
  });
}

export default new EmployerCandidateResumeController();
