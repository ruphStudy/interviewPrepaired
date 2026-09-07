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

  /** POST /api/v1/public/employer-interview-invitations/:token/session/complete */
  public completeSession = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.completeSession(token);
    res.status(200).json(successResponse('Assessment submitted successfully', { session }));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session/scenarios (28D) */
  public getReadyScenarios = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const scenarios = await publicEmployerInterviewInvitationService.getReadyScenarios(token);
    res.status(200).json(successResponse('Scenarios retrieved successfully', { scenarios }));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session/scenarios/:scenarioId (28D) */
  public getCurrentScenarioStep = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token, scenarioId } = req.params;
    const step = await publicEmployerInterviewInvitationService.getCurrentScenarioStep(token, scenarioId);
    res.status(200).json(successResponse('Scenario step retrieved successfully', step));
  });

  /** POST /api/v1/public/employer-interview-invitations/:token/session/scenarios/:scenarioId (28D) */
  public submitScenarioResponse = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token, scenarioId } = req.params;
    const { answerText } = req.body;
    const step = await publicEmployerInterviewInvitationService.submitScenarioResponse(token, scenarioId, answerText);
    res.status(200).json(successResponse('Scenario response submitted successfully', step));
  });

  /** GET /api/v1/public/employer-interview-invitations/:token/session/coding (30B) */
  public getCodingSession = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token } = req.params;
    const session = await publicEmployerInterviewInvitationService.getCodingSession(token);
    res.status(200).json(successResponse('Coding session retrieved successfully', session));
  });

  /** PUT /api/v1/public/employer-interview-invitations/:token/session/coding/:codingQuestionId/draft (30B) */
  public saveCodingDraft = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token, codingQuestionId } = req.params;
    const { language, sourceCode } = req.body;
    const session = await publicEmployerInterviewInvitationService.saveCodingDraft(token, codingQuestionId, language, sourceCode);
    res.status(200).json(successResponse('Draft saved successfully', session));
  });

  /** POST /api/v1/public/employer-interview-invitations/:token/session/coding/:codingQuestionId/submit (30B) */
  public submitCodingSubmission = catchAsync(async (req: Request, res: Response, _next: NextFunction) => {
    const { token, codingQuestionId } = req.params;
    const { language, sourceCode } = req.body;
    const session = await publicEmployerInterviewInvitationService.submitCodingSubmission(token, codingQuestionId, language, sourceCode);
    res.status(200).json(successResponse('Code submitted successfully', session));
  });
}

export default new PublicEmployerInterviewInvitationController();
