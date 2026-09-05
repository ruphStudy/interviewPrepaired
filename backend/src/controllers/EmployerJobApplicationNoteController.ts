import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerJobApplicationNoteService } from '../services/EmployerJobApplicationNoteService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. */
export class EmployerJobApplicationNoteController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/notes — requires INTERVIEWS_MANAGE. */
  public createNote = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { body } = req.body;

    const note = await employerJobApplicationNoteService.createNote(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      body
    );

    res.status(201).json(successResponse('Note added successfully', { note }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/notes — requires ORGANIZATION_VIEW. */
  public getNotes = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const result = await employerJobApplicationNoteService.getNotes(context.organizationId, context.role, applicationId);

    res.status(200).json(successResponse('Notes retrieved successfully', result));
  });
}

export default new EmployerJobApplicationNoteController();
