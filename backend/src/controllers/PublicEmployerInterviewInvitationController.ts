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

  /** POST /api/v1/public/employer-interview-invitations/:token/session/questions */
  public createSessionQuestions = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.createSessionQuestions(token);
    res.status(201).json(successResponse('Interview questions prepared successfully', { session }));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session/questions */
  public getSessionQuestions = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.getSessionQuestions(token);
    res.status(200).json(successResponse('Interview questions retrieved successfully', { session }));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session/assessment */
  public getAssessment = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.getAssessment(token);
    res.status(200).json(successResponse('Assessment retrieved successfully', { session }));
  });

  /** POST /api/v1/public/employer-interview-invitations/:token/session/answers */
  public submitAnswer = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const { questionIndex, answerText, duration } = req.body;
    const session = await publicEmployerInterviewInvitationService.submitAnswer(token, questionIndex, answerText, duration);
    res.status(200).json(successResponse('Answer saved successfully', { session }));
  });
}

export default new PublicEmployerInterviewInvitationController();
