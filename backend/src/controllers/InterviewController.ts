import { Request, Response, NextFunction } from 'express';
import { InterviewService } from '../services/InterviewService';
import { InterviewAnswerOrchestratorService } from '../services/InterviewAnswerOrchestratorService';
import { PDFService } from '../services/PDFService';
import { questionFileParserService } from '../services/QuestionFileParserService';
import { ApiError, InsufficientCreditsError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { interviewCreditService } from '../services/InterviewCreditService';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  file?: Express.Multer.File;
}

export class InterviewController {
  private interviewService: InterviewService;
  private answerOrchestrator: InterviewAnswerOrchestratorService;
  private pdfService: PDFService;

  constructor() {
    this.interviewService = new InterviewService();
    this.answerOrchestrator = new InterviewAnswerOrchestratorService(this.interviewService);
    this.pdfService = new PDFService();
  }

  public startInterview = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const {
      topic,
      difficulty,
      experienceYears,
      totalQuestions,
      interviewStyle,
      experienceLevel,
      interviewMode,
      questions,
      questionSetId,
      shuffleQuestions,
      interviewLanguage,
    } = req.body;

    const isUploadedMode = interviewMode === 'uploaded';
    if (!isUploadedMode && (!topic || !difficulty || experienceYears === undefined || experienceYears === null)) {
      throw new ApiError(400, 'Missing required fields: topic, difficulty, experienceYears');
    }

    let interview;
    try {
      interview = await this.interviewService.startInterview({
        userId,
        topic,
        difficulty,
        experienceYears,
        totalQuestions: totalQuestions || 5,
        interviewStyle,
        experienceLevel,
        interviewMode: isUploadedMode ? 'uploaded' : undefined,
        uploadedQuestions: isUploadedMode ? questions : undefined,
        questionSetId: isUploadedMode ? questionSetId : undefined,
        shuffleQuestions: shuffleQuestions === true,
        interviewLanguage,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        res.status(402).json({
          success: false,
          code: error.code,
          message: error.message,
          balance: error.balance,
        });
        return;
      }
      throw error;
    }

    const currentQuestionObj = interview.questions[interview.currentQuestion - 1];
    if (!currentQuestionObj) {
      throw new ApiError(500, 'Interview started without an active question');
    }

    const creditsRemaining = await interviewCreditService.getBalance(userId);

    res.status(201).json(
      successResponse('Interview started successfully', {
        interview: {
          id: String(interview._id),
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceLevel: interview.experienceLevel,
          interviewStyle: interview.interviewStyle,
          status: interview.status,
          currentQuestion: {
            questionText: currentQuestionObj.questionText,
            questionNumber: interview.currentQuestion,
          },
          totalQuestions: interview.totalQuestions,
          createdAt: interview.createdAt,
          interviewLanguage: interview.interviewLanguage,
        },
        creditsRemaining,
      })
    );
  });

  /**
   * Retry-safe answer endpoint. New clients send the displayed questionNumber,
   * allowing an identical retry after a timeout/response-loss to replay or
   * recover the exact persisted question rather than applying the old answer
   * to whatever question the server has already advanced to.
   */
  public submitAnswer = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const { interviewId, answer, duration, questionNumber, detectedConcepts } = req.body;
    if (!interviewId || !answer) throw new ApiError(400, 'Missing required fields: interviewId, answer');

    // Additive/optional (Phase 2, 2C) — safely ignored/defaulted if absent,
    // for backward compatibility with older frontend builds that never send it.
    const partialConcepts: string[] | undefined = Array.isArray(detectedConcepts)
      ? detectedConcepts.filter((c: unknown): c is string => typeof c === 'string').slice(0, 50)
      : undefined;

    const result = await this.answerOrchestrator.submitAnswer({
      interviewId,
      userId,
      answer,
      duration: duration || 0,
      questionNumber,
      partialConcepts,
    });

    res.status(200).json(
      successResponse('Answer submitted successfully', {
        interview: {
          id: String(result.interview._id),
          currentQuestion: result.interview.currentQuestion,
          totalQuestions: result.interview.totalQuestions,
          status: result.interview.status,
          isCompleted: result.isCompleted,
        },
        evaluation: result.evaluation,
        nextQuestion: result.nextQuestion,
      })
    );
  });

  public getSession = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');
    const { id } = req.params;
    if (!id) throw new ApiError(400, 'Interview ID is required');

    const session = await this.interviewService.getInterviewSession({ interviewId: id, userId });
    res.status(200).json(successResponse('Interview session retrieved successfully', session));
  });

  public getReport = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');
    const { id } = req.params;
    if (!id) throw new ApiError(400, 'Interview ID is required');

    const report = await this.interviewService.getInterviewReport(id, userId);
    res.status(200).json(successResponse('Interview report retrieved successfully', { report }));
  });

  public getHistory = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const topic = req.query.topic as string;
    const difficulty = req.query.difficulty as string;
    const status = req.query.status as string;

    const history = await this.interviewService.getInterviewHistory({
      userId,
      page,
      limit,
      filters: { topic, difficulty, status },
    });

    res.status(200).json(successResponse('Interview history retrieved successfully', history));
  });

  public deleteInterview = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');
    const { id } = req.params;
    if (!id) throw new ApiError(400, 'Interview ID is required');

    await this.interviewService.deleteInterview(id, userId);
    res.status(200).json(successResponse('Interview deleted successfully', null));
  });

  public exportPDF = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');
    const { id } = req.params;
    if (!id) throw new ApiError(400, 'Interview ID is required');

    const report = await this.interviewService.getInterviewReport(id, userId);
    const pdfBuffer = await this.pdfService.generateReportPDF(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=interview-report-${id}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  });

  public getStats = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const stats = await this.interviewService.getUserStats(userId);
    res.status(200).json(successResponse('Statistics retrieved successfully', { stats }));
  });

  public parseQuestionFile = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const file = req.file;
    if (!file) throw new ApiError(400, 'No file uploaded');

    const parsed = await questionFileParserService.parseFile(file.buffer, file.originalname);
    const questions = parsed.map((q) => ({
      questionText: q.questionText,
      referenceAnswer: q.referenceAnswer,
      hasAnswer: !!q.referenceAnswer,
    }));
    const questionsWithAnswers = questions.filter((q) => q.hasAnswer).length;

    res.status(200).json(
      successResponse('File parsed successfully', {
        questions,
        summary: {
          totalQuestions: questions.length,
          questionsWithAnswers,
          questionsWithoutAnswers: questions.length - questionsWithAnswers,
        },
      })
    );
  });
}

export default new InterviewController();
