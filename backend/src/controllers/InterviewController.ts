import { Request, Response, NextFunction } from 'express';
import { InterviewService } from '../services/InterviewService';
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
  private pdfService: PDFService;

  constructor() {
    this.interviewService = new InterviewService();
    this.pdfService = new PDFService();
  }

  /**
   * POST /api/interview/start
   * Start a new interview session
   */
  public startInterview = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    console.log('🔵 [InterviewController] startInterview called');
    console.log('🔵 [InterviewController] req.user:', req.user);
    
    const userId = req.user?.id;
    if (!userId) {
      console.log('❌ [InterviewController] No userId found');
      throw new ApiError(401, 'Authentication required');
    }

    const { topic, difficulty, experienceYears, totalQuestions, interviewStyle, experienceLevel, interviewMode, questions, shuffleQuestions, interviewLanguage } = req.body;
    console.log('🔵 [InterviewController] Request body:', { topic, difficulty, experienceYears, totalQuestions, interviewStyle, experienceLevel, interviewMode, interviewLanguage });

    const isUploadedMode = interviewMode === 'uploaded';

    if (isUploadedMode) {
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new ApiError(400, 'At least 1 question is required for uploaded interview mode');
      }
    } else if (!topic || !difficulty || experienceYears === undefined || experienceYears === null) {
      // experienceYears can legitimately be 0 — a truthy/falsy check would wrongly reject it.
      throw new ApiError(400, 'Missing required fields: topic, difficulty, experienceYears');
    }

    console.log('🔵 [InterviewController] Calling startInterview service...');

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
        shuffleQuestions: !!shuffleQuestions,
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

    console.log('✅ [InterviewController] Interview started successfully');

    // Get the current question
    const currentQuestionObj = interview.questions[interview.currentQuestion - 1];

    // Additive/optional — lets the client show remaining credits without any
    // response-shape redesign.
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
   * POST /api/interview/answer
   * Submit answer for current question
   */
  public submitAnswer = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { interviewId, answer, duration } = req.body;

    if (!interviewId || !answer) {
      throw new ApiError(400, 'Missing required fields: interviewId, answer');
    }

    console.log('📤 [InterviewController] Calling submitAnswer service...');
    const result = await this.interviewService.submitAnswer({
      interviewId,
      userId,
      answer,
      duration: duration || 0,
    });

    console.log('📤 [InterviewController] Service returned result');
    console.log('📤 [InterviewController] isCompleted:', result.isCompleted);
    console.log('📤 [InterviewController] Has nextQuestion:', !!result.nextQuestion);
    console.log('📤 [InterviewController] Preparing response...');

    try {
      const responseData = {
        interview: {
          id: String(result.interview._id),
          currentQuestion: result.interview.currentQuestion,
          totalQuestions: result.interview.totalQuestions,
          status: result.interview.status,
          isCompleted: result.isCompleted,
        },
        evaluation: result.evaluation,
        nextQuestion: result.nextQuestion,
      };

      console.log('📤 [InterviewController] Response data prepared');
      console.log('📤 [InterviewController] Sending response...');
      
      res.status(200).json(
        successResponse('Answer submitted successfully', responseData)
      );
      
      console.log('✅ [InterviewController] Response sent successfully');
    } catch (err) {
      console.error('❌ [InterviewController] Error preparing/sending response:', err);
      throw err;
    }
  });

  /**
   * GET /api/interview/report/:id
   * Get detailed interview report
   */
  public getReport = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;

    if (!id) {
      throw new ApiError(400, 'Interview ID is required');
    }

    const report = await this.interviewService.getInterviewReport(id, userId);

    res.status(200).json(
      successResponse('Interview report retrieved successfully', { report })
    );
  });

  /**
   * GET /api/interview/history
   * Get user's interview history
   */
  public getHistory = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const topic = req.query.topic as string;
    const difficulty = req.query.difficulty as string;
    const status = req.query.status as string;

    const history = await this.interviewService.getInterviewHistory({
      userId,
      page,
      limit,
      filters: {
        topic,
        difficulty,
        status,
      },
    });

    res.status(200).json(
      successResponse('Interview history retrieved successfully', history)
    );
  });

  /**
   * DELETE /api/interview/:id
   * Delete an interview
   */
  public deleteInterview = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;

    if (!id) {
      throw new ApiError(400, 'Interview ID is required');
    }

    await this.interviewService.deleteInterview(id, userId);

    res.status(200).json(
      successResponse('Interview deleted successfully', null)
    );
  });

  /**
   * GET /api/interview/report/:id/pdf
   * Export interview report as PDF
   */
  public exportPDF = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { id } = req.params;

    if (!id) {
      throw new ApiError(400, 'Interview ID is required');
    }

    // Get interview report
    const report = await this.interviewService.getInterviewReport(id, userId);

    // Generate PDF
    const pdfBuffer = await this.pdfService.generateReportPDF(report);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=interview-report-${id}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);
  });

  /**
   * GET /api/interview/stats
   * Get user's interview statistics
   */
  public getStats = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const stats = await this.interviewService.getUserStats(userId);

    res.status(200).json(
      successResponse('Statistics retrieved successfully', { stats })
    );
  });

  /**
   * POST /api/interview/parse-question-file
   * Parse an uploaded question file (TXT/CSV/DOCX/PDF) into a preview list.
   * Preview only — does NOT create an interview.
   */
  public parseQuestionFile = catchAsync(async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const file = req.file;
    if (!file) {
      throw new ApiError(400, 'No file uploaded');
    }

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
