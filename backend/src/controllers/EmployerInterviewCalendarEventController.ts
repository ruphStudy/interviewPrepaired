import { Response, NextFunction } from 'express';
import { OrganizationAuthRequest } from '../middleware/organizationAccess';
import { employerInterviewCalendarEventService } from '../services/EmployerInterviewCalendarEventService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/** Runs behind `requireOrganizationPermission(...)` — `req.organizationContext` is always present by the time this runs. Local interview calendar scheduling (31E) — never claims provider sync unless it genuinely happened. */
export class EmployerInterviewCalendarEventController {
  public scheduleEvent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const { startsAt, endsAt, timezone } = req.body ?? {};
    const result = await employerInterviewCalendarEventService.scheduleEvent(context.organizationId, context.role, interviewId, {
      startsAt,
      endsAt,
      timezone,
    });
    res.status(200).json(successResponse('Interview scheduled successfully', result));
  });

  public getEvent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerInterviewCalendarEventService.getEvent(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Interview schedule retrieved successfully', result));
  });

  public cancelEvent = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const result = await employerInterviewCalendarEventService.cancelEvent(context.organizationId, context.role, interviewId);
    res.status(200).json(successResponse('Interview schedule cancelled successfully', result));
  });

  public getIcs = catchAsync(async (req: OrganizationAuthRequest, res: Response, _next: NextFunction) => {
    const context = req.organizationContext;
    if (!context) {
      throw new ApiError(500, 'Organization context missing');
    }
    const { interviewId } = req.params;
    const ics = await employerInterviewCalendarEventService.getIcs(context.organizationId, context.role, interviewId);
    res.status(200).set('Content-Type', 'text/calendar; charset=utf-8').set('Content-Disposition', 'attachment; filename="interview.ics"').send(ics);
  });
}

export const employerInterviewCalendarEventController = new EmployerInterviewCalendarEventController();
export default employerInterviewCalendarEventController;
