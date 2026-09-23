import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { institutePeopleImportService } from '../services/InstitutePeopleImportService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Institute Trainer/Student bulk CSV/XLSX import (PR-PEOPLE-1). Every
 * method here runs behind `requireOrganizationPermission(...)` (see
 * organization.routes.ts) and a `multer` memory-storage single-file upload
 * (`file` field) — `req.file` is always present by the time these run
 * (multer's own `fileFilter`/route wiring rejects an unsupported extension
 * before this controller is reached).
 */
export class InstitutePeopleImportController {
  /**
   * POST /api/v1/organizations/:organizationId/people/import/preview
   * Requires MEMBERS_MANAGE (enforced inside the service). Parses+validates
   * the uploaded file and reports counts/per-row status — persists nothing.
   */
  public preview = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    if (!req.file) {
      throw new ApiError(400, 'A file is required');
    }

    const rows = await institutePeopleImportService.parseUploadedFile(req.file.buffer, req.file.originalname);
    const result = await institutePeopleImportService.previewImport(context.organizationId, context.role, rows);

    res.status(200).json(successResponse('Import preview generated successfully', result));
  });

  /**
   * POST /api/v1/organizations/:organizationId/people/import/commit
   * Requires MEMBERS_MANAGE. Re-parses/re-validates the SAME uploaded file
   * against current state (never trusts a client-held preview) and
   * actually creates/invites the importable rows. Partial success — one
   * bad/conflicting row never aborts the others.
   */
  public commit = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    if (!req.file) {
      throw new ApiError(400, 'A file is required');
    }

    const rows = await institutePeopleImportService.parseUploadedFile(req.file.buffer, req.file.originalname);
    const result = await institutePeopleImportService.commitImport(context.organizationId, context.role, req.user!.id, rows);

    res.status(200).json(successResponse('Import processed successfully', result));
  });

  /**
   * GET /api/v1/organizations/:organizationId/people/import/template
   * Requires MEMBERS_VIEW. Downloadable CSV template — minimum columns
   * name/email/userType, allowed userType values TRAINER/STUDENT only.
   */
  public downloadTemplate = catchAsync(async (_req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const csv = institutePeopleImportService.buildTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="institute-people-import-template.csv"');
    res.status(200).send(csv);
  });
}

export default new InstitutePeopleImportController();
