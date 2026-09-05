import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerCandidateCommunicationService } from '../services/EmployerCandidateCommunicationService';
import {
  EmployerCandidateCommunicationDirection,
  EmployerCandidateCommunicationChannel,
  EmployerCandidateCommunicationType,
} from '../models/EmployerCandidateCommunication.model';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` (see organization.routes.ts) — `req.organizationContext` is always present by the time this runs. This is a LOG only — no message is ever sent. */
export class EmployerCandidateCommunicationController {
  /** POST /api/v1/organizations/:organizationId/applications/:applicationId/communications — requires INTERVIEWS_MANAGE. */
  public createCommunication = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const { direction, channel, communicationType, subject, summary, occurredAt } = req.body;

    const communication = await employerCandidateCommunicationService.createCommunication(
      context.organizationId,
      context.role,
      context.member._id.toString(),
      applicationId,
      { direction, channel, communicationType, subject, summary, occurredAt }
    );

    res.status(201).json(successResponse('Communication recorded successfully', { communication }));
  });

  /** GET /api/v1/organizations/:organizationId/applications/:applicationId/communications — requires ORGANIZATION_VIEW. */
  public getCommunications = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }

    const { applicationId } = req.params;
    const direction = req.query.direction as EmployerCandidateCommunicationDirection | undefined;
    const channel = req.query.channel as EmployerCandidateCommunicationChannel | undefined;
    const communicationType = req.query.communicationType as EmployerCandidateCommunicationType | undefined;

    const result = await employerCandidateCommunicationService.getCommunications(context.organizationId, context.role, applicationId, {
      direction,
      channel,
      communicationType,
    });

    res.status(200).json(successResponse('Communications retrieved successfully', result));
  });
}

export default new EmployerCandidateCommunicationController();
