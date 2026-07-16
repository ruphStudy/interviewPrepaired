import { Response } from 'express';
import { InterviewService } from '../services/interview.service';
import { successResponse, createdResponse } from '../utils/ApiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth';

const interviewService = new InterviewService();

export const createInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.createInterview({
      userId: req.user!.id,
      type: req.body.type,
      difficulty: req.body.difficulty,
      topic: req.body.topic,
      customInstructions: req.body.customInstructions,
      metadata: {
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      },
    });

    res.status(201).json(createdResponse('Interview created successfully', interview));
  }
);

export const getInterviews = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await interviewService.getUserInterviews(req.user!.id, {
    type: req.query.type as string,
    status: req.query.status as string,
    difficulty: req.query.difficulty as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 10,
  });

  res.status(200).json(
    successResponse('Interviews retrieved successfully', result.interviews, {
      pagination: {
        page: result.page,
        limit: 10,
        total: result.total,
        pages: result.pages,
      },
    })
  );
});

export const getInterview = catchAsync(async (req: AuthRequest, res: Response) => {
  const interview = await interviewService.getInterviewById(
    req.params.id,
    req.user!.id
  );

  res.status(200).json(successResponse('Interview retrieved successfully', interview));
});

export const startInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.startInterview(
      req.params.id,
      req.user!.id
    );

    res.status(200).json(successResponse('Interview started successfully', interview));
  }
);

export const pauseInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.pauseInterview(
      req.params.id,
      req.user!.id
    );

    res.status(200).json(successResponse('Interview paused successfully', interview));
  }
);

export const resumeInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.resumeInterview(
      req.params.id,
      req.user!.id
    );

    res.status(200).json(successResponse('Interview resumed successfully', interview));
  }
);

export const submitAnswer = catchAsync(async (req: AuthRequest, res: Response) => {
  const interview = await interviewService.submitAnswer(req.params.id, req.user!.id, {
    questionId: req.body.questionId,
    answer: req.body.answer,
    transcriptionConfidence: req.body.transcriptionConfidence,
    duration: req.body.duration,
    audioUrl: req.body.audioUrl,
  });

  res.status(200).json(successResponse('Answer submitted successfully', interview));
});

export const generateNextQuestion = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.generateNextQuestion(
      req.params.id,
      req.user!.id
    );

    res
      .status(200)
      .json(successResponse('Question generated successfully', interview));
  }
);

export const completeInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.completeInterview(
      req.params.id,
      req.user!.id
    );

    res.status(200).json(successResponse('Interview completed successfully', interview));
  }
);

export const evaluateInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const interview = await interviewService.evaluateInterview(
      req.params.id,
      req.user!.id
    );

    res.status(200).json(successResponse('Interview evaluated successfully', interview));
  }
);

export const deleteInterview = catchAsync(
  async (req: AuthRequest, res: Response) => {
    await interviewService.deleteInterview(req.params.id, req.user!.id);

    res.status(200).json(successResponse('Interview deleted successfully'));
  }
);

export const getInterviewStats = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const stats = await interviewService.getInterviewStats(req.user!.id);

    res.status(200).json(successResponse('Interview stats retrieved successfully', stats));
  }
);
