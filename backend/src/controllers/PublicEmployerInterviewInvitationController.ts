import { Request, Response, NextFunction } from 'express';
import { publicEmployerInterviewInvitationService } from '../services/PublicEmployerInterviewInvitationService';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

/**
 * Fully PUBLIC controller (20D) — no `protect`, no organization context.
 * The raw token is read from the URL param only; it is never logged and
 * never echoed back in any response.
 */
export class PublicEmployerInterviewInvitationController {
  /** GET /api/v1/public/employer-interview-invitations/:token */
  public getInvitation = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const invitation = await publicEmployerInterviewInvitationService.getPublicInvitation(token);
    res.status(200).json(successResponse('Invitation retrieved successfully', { invitation }));
  });

  /** POST /api/v1/public/employer-interview-invitations/:token/accept */
  public acceptInvitation = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const invitation = await publicEmployerInterviewInvitationService.acceptInvitation(token);
    res.status(200).json(successResponse('Invitation accepted successfully', { invitation }));
  });

  /** POST /api/v1/public/employer-interview-invitations/:token/session */
  public createSession = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.createSession(token);
    res.status(201).json(successResponse('Interview session prepared successfully', { session }));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session */
  public getSession = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.getSession(token);
    res.status(200).json(successResponse('Interview session retrieved successfully', { session }));
  });
}

export default new PublicEmployerInterviewInvitationController();
