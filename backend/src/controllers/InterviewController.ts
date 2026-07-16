import { Request, Response, NextFunction } from 'express';
import { InterviewService } from '../services/InterviewService';
import { PDFService } from '../services/PDFService';
import { ApiError } from '../utils/ApiError';
import { successResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
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

    const { topic, difficulty, experienceYears, totalQuestions, interviewStyle, experienceLevel } = req.body;
    console.log('🔵 [InterviewController] Request body:', { topic, difficulty, experienceYears, totalQuestions, interviewStyle, experienceLevel });

    if (!topic || !difficulty || !experienceYears) {
      throw new ApiError(400, 'Missing required fields: topic, difficulty, experienceYears');
    }

    console.log('🔵 [InterviewController] Calling startInterview service...');
    const interview = await this.interviewService.startInterview({
      userId,
      topic,
      difficulty,
      experienceYears,
      totalQuestions: totalQuestions || 5,
      interviewStyle,
      experienceLevel,
    });

    console.log('✅ [InterviewController] Interview started successfully');
    
    // Get the current question
    const currentQuestionObj = interview.questions[interview.currentQuestion - 1];
    
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
        },
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
}

export default new InterviewController();
