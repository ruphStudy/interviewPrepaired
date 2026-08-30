import { Types } from 'mongoose';
import Interview, { IInterview, IEvaluation } from '../models/interview.model';
import { getOpenAIService, InterviewTopic, QuestionResponse } from './OpenAIService';
import { 
  DifficultyLevel, 
  ExperienceLevel, 
  InterviewStyle,
  DynamicEvaluationResponse
} from './OpenAIService';
import { mapExperienceYearsToLevel, inferInterviewStyle } from './OpenAIAdapter';
import { ApiError } from '../utils/ApiError';
import { blueprintService } from './BlueprintService';
import { interviewMemoryService } from './InterviewMemoryService';
import { createEmptyMemory } from '../models/InterviewMemory.model';
import { coverageTrackerService } from './CoverageTrackerService';
import { initializeCoverage } from '../models/CompetencyCoverage.model';
import { difficultyManagerService } from './DifficultyManagerService';
import { initializeDifficultyTracking, mapLevelToDifficulty } from '../models/DifficultyTracking.model';import { claimVerificationService } from './ClaimVerificationService';
import { contradictionDetectorService } from './ContradictionDetectorService';
import { starAnalysisService } from './STARAnalysisService';

/** Same validity rule the frontend/report/PDF must all agree on — never treat a stringified "undefined"/"null"/placeholder/empty value as a real expected answer. */
function isValidModelAnswer(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value !== 'undefined' &&
    value !== 'null' &&
    value !== 'Model answer generation unavailable.'
  );
}

interface StartInterviewParams {
  userId: string;
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  totalQuestions?: number;
  interviewStyle?: InterviewStyle;
  experienceLevel?: ExperienceLevel;
  roleName?: string; // NEW: Specific role title
  industry?: string; // NEW: Industry context
}

interface SubmitAnswerParams {
  interviewId: string;
  userId: string;
  answer: string;
  duration: number;
}

interface GetHistoryParams {
  userId: string;
  page: number;
  limit: number;
  filters?: {
    topic?: string;
    difficulty?: string;
    status?: string;
  };
}

interface InterviewReport {
  interview: {
    id: string;
    topic: string;
    difficulty: string;
    experienceYears: number;
    status: string;
    createdAt: Date;
    completedAt?: Date;
    totalQuestions: number;
    answeredQuestions: number;
  };
  questions: Array<{
    questionText: string;
    expectedPoints?: string[];
    modelAnswer?: string;
    answerText?: string;
    answeredAt?: Date;
    duration?: number;
    evaluation?: IEvaluation;
  }>;
  finalReport?: {
    overallScore: number;
    summary: string;
    recommendations: string[];
    strengthsOverview: string[];
    weaknessesOverview: string[];
    nextSteps: string[];
    generatedAt: Date;
  };
  statistics: {
    averageScore: number;
    completionRate: number;
    totalDuration: number;
    strengthsCount: number;
    weaknessesCount: number;
  };
}

export class InterviewService {
  private openAIService = getOpenAIService();

  /**
   * Start a new interview session
   * 
   * NEW FLOW:
   * 1. Generate or retrieve interview blueprint
   * 2. Create interview with blueprint reference
   * 3. Generate first question using blueprint
   */
  async startInterview(params: StartInterviewParams): Promise<IInterview> {
    console.log('🟢 [InterviewService] startInterview called with params:', params);
    const { 
      userId, 
      topic, 
      difficulty, 
      experienceYears, 
      totalQuestions = 5, 
      interviewStyle, 
      experienceLevel,
      roleName,
      industry
    } = params;

    // Validate total questions
    if (totalQuestions < 1 || totalQuestions > 10) {
      throw new ApiError(400, 'Total questions must be between 1 and 10');
    }

    // Map experience years to level if not provided
    const finalExperienceLevel = experienceLevel || mapExperienceYearsToLevel(experienceYears);
    // Infer interview style if not provided
    const finalInterviewStyle = interviewStyle || inferInterviewStyle(topic);

    try {
      // =====================================================================
      // STEP 1: Generate or Retrieve Interview Blueprint
      // =====================================================================
      console.log('🔵 [InterviewService] Getting or creating interview blueprint...');
      const blueprint = await blueprintService.getOrCreateBlueprint({
        topic,
        roleName,
        industry,
        difficulty,
        experienceLevel: finalExperienceLevel,
        interviewStyle: finalInterviewStyle,
      });
      
      console.log('✅ [InterviewService] Blueprint acquired:', {
        id: blueprint._id,
        version: blueprint.version,
        competencies: blueprint.competencies.map(c => c.name).join(', '),
      });

      // =====================================================================
      // STEP 2: Create Interview Document with Blueprint Reference
      // =====================================================================
      console.log('🟢 [InterviewService] Creating interview document...');
      
      // Initialize competency coverage from blueprint
      const competencyNames = blueprint.competencies.map(c => c.name);
      const initialCoverage = initializeCoverage(competencyNames);
      console.log('🔵 [InterviewService] Initialized competency coverage for:', competencyNames);
      
      // Initialize difficulty tracking
      const initialDifficulty = initializeDifficultyTracking(difficulty);
      console.log('🔵 [InterviewService] Initialized difficulty tracking at level:', initialDifficulty.currentLevel);
      
      const interview = new Interview({
        userId: new Types.ObjectId(userId),
        topic,
        difficulty,
        experienceYears,
        experienceLevel: finalExperienceLevel,
        interviewStyle: finalInterviewStyle,
        roleName,
        industry,
        blueprintId: blueprint._id,
        blueprintVersion: blueprint.version,
        totalQuestions,
        status: 'in-progress',
        currentQuestion: 1,
        questions: [],
        competencyCoverage: initialCoverage,
        difficultyTracking: initialDifficulty,
      });

      // =====================================================================
      // STEP 3: Generate First Question Using Blueprint
      // =====================================================================
      console.log('🟢 [InterviewService] Generating first question using blueprint...');
      const sessionConfig = {
        topic,
        difficulty: difficulty as DifficultyLevel,
        experienceLevel: finalExperienceLevel,
        interviewStyle: finalInterviewStyle,
        totalQuestions,
      };
      
      const questionResponse = await this.openAIService.generateQuestion({
        sessionConfig,
        // TODO: Pass blueprint context to question generation
        // This will be used to generate questions targeting specific competencies
      });

      console.log('🟢 [InterviewService] Question generated:', questionResponse);
      // Add question to interview with expected points
      await interview.addQuestion(questionResponse.question, questionResponse.expectedPoints, questionResponse.questionType);

      // Save interview
      console.log('🟢 [InterviewService] Saving interview...');
      await interview.save();

      console.log('✅ [InterviewService] Interview started successfully with blueprint');
      return interview;
      
    } catch (error) {
      console.error('❌ [InterviewService] Error starting interview:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to start interview: ${message}`);
    }
  }

  /**
   * Submit answer and get evaluation + next question
   */
  async submitAnswer(params: SubmitAnswerParams): Promise<{
    interview: IInterview;
    evaluation: DynamicEvaluationResponse;
    nextQuestion?: QuestionResponse;
    isCompleted: boolean;
  }> {
    const { interviewId, userId, answer, duration } = params;

    // Find interview
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    if (interview.status === 'completed' || interview.status === 'evaluated') {
      throw new ApiError(400, 'Interview is already completed');
    }

    // Get current question index
    const currentQuestionIndex = interview.currentQuestion - 1;
    const currentQuestion = interview.questions[currentQuestionIndex];

    if (!currentQuestion) {
      throw new ApiError(400, 'No active question found');
    }

    if (currentQuestion.answerText) {
      throw new ApiError(400, 'Question already answered');
    }

    try {
      // Submit answer
      await interview.submitAnswer(currentQuestionIndex, answer, duration);

      // Build session config
      const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
      const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
      
      const sessionConfig = {
        topic: interview.topic as InterviewTopic,
        difficulty: interview.difficulty as DifficultyLevel,
        experienceLevel: experienceLevel as ExperienceLevel,
        interviewStyle: interviewStyle as InterviewStyle,
        totalQuestions: interview.totalQuestions,
      };

      // Evaluate answer using OpenAI
      const evaluation = await this.openAIService.evaluateAnswer({
        sessionConfig,
        question: currentQuestion.questionText,
        answer,
        expectedPoints: currentQuestion.expectedPoints,
      });
      
      // Perform STAR analysis for behavioral interviews
      let starAnalysis = null;
      try {
        starAnalysis = await starAnalysisService.analyzeSTAR({
          question: currentQuestion.questionText,
          answer,
          interviewStyle: interviewStyle as InterviewStyle,
        });
        
        if (starAnalysis) {
          console.log(`[InterviewService] STAR analysis completed. Score: ${starAnalysis.overallSTARScore}/10`);
        }
      } catch (starError) {
        console.error('[InterviewService] STAR analysis failed (non-critical):', starError);
      }

      // Store evaluation (dynamic dimensions + STAR)
      await interview.evaluateQuestion(currentQuestionIndex, {
        dimensions: evaluation.dimensions,
        overallScore: evaluation.overallScore,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        suggestions: evaluation.suggestions,
        missingPoints: evaluation.missingPoints,
        starAnalysis: starAnalysis || undefined,
      });

      // =====================================================================
      // Generate Model Answer (Ideal Answer for Learning)
      // =====================================================================
      console.log('[InterviewService] Generating model answer for learning...');
      try {
        const modelAnswer = await this.openAIService.generateModelAnswer({
          question: currentQuestion.questionText,
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceLevel: interview.experienceLevel || 'professional',
          expectedPoints: currentQuestion.expectedPoints,
          questionType: currentQuestion.questionType as any,
        });
        
        // Store model answer in the question. Set it on the in-memory
        // document (so later code/response in this request already sees it)
        // AND persist it immediately with a targeted $set — the last-question
        // path below reloads the interview from MongoDB before building the
        // final report, so relying only on a later `interview.save()` (many
        // async steps downstream) risks the reload missing it.
        if (interview.questions[currentQuestionIndex]) {
          interview.questions[currentQuestionIndex].modelAnswer = modelAnswer;
          interview.markModified(`questions.${currentQuestionIndex}.modelAnswer`);

          await Interview.updateOne(
            { _id: interview._id },
            { $set: { [`questions.${currentQuestionIndex}.modelAnswer`]: modelAnswer } }
          );

          console.log(`[ModelAnswer] Q${currentQuestionIndex + 1}`, {
            generated: !!modelAnswer,
            length: modelAnswer?.length,
          });
        }
      } catch (modelAnswerError) {
        console.error('[InterviewService] Model answer generation failed (non-critical):', modelAnswerError);
        // Don't fail the interview if model answer generation fails — modelAnswer stays unset for this question.
      }

      // =====================================================================
      // NEW: Extract and Store Interview Memory
      // =====================================================================
      console.log('[InterviewService] Extracting memory from answer...');
      try {
        const updatedMemory = await interviewMemoryService.extractMemoryFromAnswer({
          question: currentQuestion.questionText,
          answer,
          questionNumber: interview.currentQuestion,
          existingMemory: interview.interviewMemory || createEmptyMemory(),
        });
        
        // Update interview memory
        interview.interviewMemory = updatedMemory;
        console.log(`[InterviewService] Memory updated. Total facts: ${updatedMemory.totalFacts}`);
      } catch (memoryError) {
        console.error('[InterviewService] Memory extraction failed (non-critical):', memoryError);
        // Don't fail the interview if memory extraction fails
      }
      
      // =====================================================================
      // NEW: Extract Verifiable Claims
      // =====================================================================
      console.log('[InterviewService] Extracting verifiable claims...');
      try {
        if (interview.claimVerification) {
          const updatedClaims = await claimVerificationService.extractClaims({
            question: currentQuestion.questionText,
            answer,
            questionNumber: interview.currentQuestion,
            currentTracking: interview.claimVerification,
          });
          
          interview.claimVerification = updatedClaims;
          console.log(`[InterviewService] Claims updated. Total: ${updatedClaims.totalClaims}, Unverified: ${updatedClaims.unverifiedCount}`);
        }
      } catch (claimError) {
        console.error('[InterviewService] Claim extraction failed (non-critical):', claimError);
        // Don't fail the interview if claim extraction fails
      }
      
      // =====================================================================
      // NEW: Detect Contradictions
      // =====================================================================
      console.log('[InterviewService] Detecting contradictions...');
      try {
        if (interview.contradictionTracking && interview.interviewMemory) {
          const updatedContradictions = await contradictionDetectorService.detectContradictions({
            currentAnswer: answer,
            currentQuestionNumber: interview.currentQuestion,
            interviewMemory: interview.interviewMemory,
            currentTracking: interview.contradictionTracking,
          });
          
          interview.contradictionTracking = updatedContradictions;
          
          if (updatedContradictions.unresolvedCount > 0) {
            console.log(`[InterviewService] Contradictions detected. Total: ${updatedContradictions.totalContradictions}, Unresolved: ${updatedContradictions.unresolvedCount}`);
          }
        }
      } catch (contradictionError) {
        console.error('[InterviewService] Contradiction detection failed (non-critical):', contradictionError);
        // Don't fail the interview if contradiction detection fails
      }
      
      // =====================================================================
      // NEW: Update Competency Coverage
      // =====================================================================
      console.log('[InterviewService] Updating competency coverage...');
      try {
        // Get blueprint for competencies
        if (interview.blueprintId && interview.competencyCoverage) {
          const blueprint = await blueprintService.getBlueprintById(interview.blueprintId.toString());
          if (blueprint) {
            const updatedCoverage = await coverageTrackerService.updateCoverage({
              question: currentQuestion.questionText,
              answer,
              questionNumber: interview.currentQuestion,
              competencies: blueprint.competencies,
              currentCoverage: interview.competencyCoverage,
            });
            
            interview.competencyCoverage = updatedCoverage;
            console.log(`[InterviewService] Coverage updated. Overall: ${updatedCoverage.overallCoverage}%, Least covered: ${updatedCoverage.leastCoveredCompetency}`);
          }
        }
      } catch (coverageError) {
        console.error('[InterviewService] Coverage tracking failed (non-critical):', coverageError);
        // Don't fail the interview if coverage tracking fails
      }
      
      // =====================================================================
      // NEW: Adjust Difficulty Based on Performance
      // =====================================================================
      console.log('[InterviewService] Adjusting difficulty based on performance...');
      try {
        if (interview.difficultyTracking) {
          // Collect recent scores for rolling average
          const recentScores = interview.questions
            .filter(q => q.evaluation?.overallScore !== undefined)
            .map(q => q.evaluation!.overallScore);
          
          const adjustmentResult = difficultyManagerService.adjustDifficulty({
            currentTracking: interview.difficultyTracking,
            latestScore: evaluation.overallScore,
            questionNumber: interview.currentQuestion,
            recentScores,
          });
          
          interview.difficultyTracking = adjustmentResult.updatedTracking;
          
          if (adjustmentResult.updated) {
            console.log(`[InterviewService] Difficulty adjusted: ${adjustmentResult.previousLevel} → ${adjustmentResult.newLevel} (${adjustmentResult.reason})`);
          } else {
            console.log(`[InterviewService] Difficulty remains at level ${interview.difficultyTracking.currentLevel}`);
          }
        }
      } catch (difficultyError) {
        console.error('[InterviewService] Difficulty adjustment failed (non-critical):', difficultyError);
        // Don't fail the interview if difficulty adjustment fails
      }

      // Check if interview is complete
      const isCompleted = interview.currentQuestion >= interview.totalQuestions;
      let nextQuestion: QuestionResponse | undefined;
      let finalInterview = interview; // Track the final interview to return

      if (isCompleted) {
        console.log('[InterviewService] Interview completed! Generating final report...');
        // Mark as completed and set completion timestamp
        interview.status = 'completed';
        interview.completedAt = new Date();
        await interview.save();
        console.log('[InterviewService] Interview saved with status: completed');
        
        // Reload the interview to refresh the _original tracking
        let reloadedInterview = await Interview.findById(interview._id);
        if (!reloadedInterview) {
          throw new ApiError(404, 'Interview not found after save');
        }
        
        try {
          // generateFinalReport will set status to 'evaluated' and save
          await this.generateFinalReport(reloadedInterview);
          console.log('[InterviewService] Final report generated successfully');
          
          // Reload again to get the evaluated version with final report
          const evaluatedInterview = await Interview.findById(interview._id);
          if (evaluatedInterview) {
            finalInterview = evaluatedInterview;
          } else {
            finalInterview = reloadedInterview;
          }
        } catch (reportError) {
          // Log error but don't fail the submission
          console.error('[InterviewService] Error generating final report:', reportError);
          console.error('[InterviewService] Interview will be marked as completed anyway');
          // Still use the reloaded interview even if report generation failed
          finalInterview = reloadedInterview;
        }
      } else {
        console.log(`[InterviewService] More questions remaining. Current: ${interview.currentQuestion}, Total: ${interview.totalQuestions}`);
        
        // =====================================================================
        // Generate Next Question with Memory Context
        // =====================================================================
        const previousQuestions = interview.questions.map((q) => q.questionText);
        
        // Format memory for AI context
        const memoryContext = interview.interviewMemory 
          ? interviewMemoryService.formatMemoryForAI(interview.interviewMemory)
          : undefined;
        
        // Format coverage for AI context
        const coverageContext = interview.competencyCoverage
          ? coverageTrackerService.getCoverageSummaryForAI(interview.competencyCoverage)
          : undefined;
        
        // Get priority competency (least covered)
        const priorityCompetency = interview.competencyCoverage
          ? coverageTrackerService.getNextCompetencyToPrioritize(interview.competencyCoverage)
          : undefined;
        
        // Format difficulty context for AI
        const difficultyContext = interview.difficultyTracking
          ? difficultyManagerService.getDifficultyContextForAI(interview.difficultyTracking)
          : undefined;
        
        // Update session config with current adaptive difficulty
        const adaptiveDifficulty = interview.difficultyTracking
          ? mapLevelToDifficulty(interview.difficultyTracking.currentLevel)
          : sessionConfig.difficulty;
        
        const adaptiveSessionConfig = {
          ...sessionConfig,
          difficulty: adaptiveDifficulty as DifficultyLevel,
        };
        
        console.log('[InterviewService] Generating next question with context...');
        if (priorityCompetency) {
          console.log(`[InterviewService] Prioritizing competency: ${priorityCompetency}`);
        }
        if (interview.difficultyTracking) {
          console.log(`[InterviewService] Current difficulty: Level ${interview.difficultyTracking.currentLevel}/5`);
        }
        
        nextQuestion = await this.openAIService.generateQuestion({
          sessionConfig: adaptiveSessionConfig,
          previousQuestions,
          memoryContext, // NEW: Pass memory context
          coverageContext, // NEW: Pass coverage context
          priorityCompetency, // NEW: Pass priority competency
          difficultyContext, // NEW: Pass difficulty context
        });

        // Add next question with expected points
        await interview.addQuestion(nextQuestion.question, nextQuestion.expectedPoints, nextQuestion.questionType);
        
        // Increment current question counter
        interview.currentQuestion += 1;
        console.log(`[InterviewService] Next question added. New currentQuestion: ${interview.currentQuestion}`);
        
        // Save interview with new question and updated memory
        await interview.save();
      }

      console.log('[InterviewService] Returning response with isCompleted:', isCompleted);

      return {
        interview: finalInterview,
        evaluation,
        nextQuestion,
        isCompleted,
      };
    } catch (error) {
      console.error('[InterviewService] Error in submitAnswer:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to submit answer: ${message}`);
    }
  }

  /**
   * Generate final report for completed interview
   */
  private async generateFinalReport(interview: IInterview): Promise<void> {
    try {
      console.log('[InterviewService] Collecting evaluations for final report...');
      const evaluations = interview.questions
        .filter((q) => q.evaluation)
        .map((q) => ({
          question: q.questionText,
          answer: q.answerText || '',
          evaluation: {
            dimensions: q.evaluation!.dimensions || [],
            overallScore: q.evaluation!.overallScore,
            strengths: q.evaluation!.strengths,
            weaknesses: q.evaluation!.weaknesses,
            suggestions: q.evaluation!.suggestions,
            missingPoints: q.evaluation!.missingPoints || [],
          },
        }));

      console.log(`[InterviewService] Found ${evaluations.length} evaluated questions`);
      console.log('[InterviewService] Calling OpenAI to generate final report...');

      // Build session config
      const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
      const interviewStyle = interview.interviewStyle || inferInterviewStyle(interview.topic);
      
      const sessionConfig = {
        topic: interview.topic as InterviewTopic,
        difficulty: interview.difficulty as DifficultyLevel,
        experienceLevel: experienceLevel as ExperienceLevel,
        interviewStyle: interviewStyle as InterviewStyle,
        totalQuestions: interview.totalQuestions,
      };

      const finalReport = await this.openAIService.generateFinalReport({
        sessionConfig,
        evaluations,
      });

      console.log('[InterviewService] Final report received from OpenAI');
      console.log('[InterviewService] Saving final report to interview...');

      // Overall numeric score must be a deterministic average of the
      // per-question evaluation scores, never OpenAI's own arithmetic —
      // OpenAI can still write the summary/recommendations/overview text.
      const evaluatedScores = interview.questions
        .filter((q) => q.evaluation?.overallScore !== undefined)
        .map((q) => q.evaluation!.overallScore);
      const deterministicOverallScore =
        evaluatedScores.length > 0
          ? Math.round((evaluatedScores.reduce((sum, score) => sum + score, 0) / evaluatedScores.length) * 10) / 10
          : 0;

      await interview.generateFinalReport({
        summary: finalReport.summary,
        recommendations: finalReport.recommendations,
        overallScore: deterministicOverallScore,
        strengthsOverview: finalReport.strengthsOverview,
        weaknessesOverview: finalReport.weaknessesOverview,
        nextSteps: finalReport.nextSteps,
      });

      // Don't set status here - it will be set by generateFinalReport method
      console.log('[InterviewService] Final report saved, status should be evaluated');
    } catch (error) {
      console.error('[InterviewService] Error in generateFinalReport:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(500, `Failed to generate final report: ${message}`);
    }
  }

  /**
   * Get detailed interview report
   */
  async getInterviewReport(interviewId: string, userId: string): Promise<InterviewReport> {
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    // Calculate statistics
    const answeredQuestions = interview.questions.filter((q) => q.answerText).length;
    const completionRate = (answeredQuestions / interview.totalQuestions) * 100;
    const totalDuration = interview.questions.reduce((sum, q) => sum + (q.duration ?? 0), 0);
    
    const evaluatedQuestions = interview.questions.filter((q) => q.evaluation);
    const averageScore = evaluatedQuestions.length > 0
      ? evaluatedQuestions.reduce((sum, q) => sum + (q.evaluation?.overallScore ?? 0), 0) / evaluatedQuestions.length
      : 0;

    // Report overall score must always be the deterministic average of the
    // actual question evaluation scores — never trust a stored finalReport
    // value that may predate this fix (it could still hold an OpenAI-derived
    // number that disagrees with the Detailed Analysis scores).
    const calculatedOverallScore = Math.round(averageScore * 10) / 10;

    console.log('[ReportScore]', {
      questionScores: evaluatedQuestions.map((q) => q.evaluation?.overallScore),
      calculatedOverallScore,
      storedFinalReportScore: interview.finalReport?.overallScore,
    });

    if (interview.finalReport && interview.finalReport.overallScore !== calculatedOverallScore) {
      await Interview.updateOne(
        { _id: interview._id },
        { $set: { 'finalReport.overallScore': calculatedOverallScore } }
      );
      interview.finalReport.overallScore = calculatedOverallScore;
    }

    const strengthsCount = interview.questions.reduce(
      (sum, q) => sum + (q.evaluation?.strengths.length ?? 0),
      0
    );
    const weaknessesCount = interview.questions.reduce(
      (sum, q) => sum + (q.evaluation?.weaknesses.length ?? 0),
      0
    );

    // Backfill: old/evaluated questions may predate reliable modelAnswer
    // persistence. Generate it (once, real OpenAI call) only when genuinely
    // missing/invalid, so we never waste tokens re-generating an existing
    // answer and never insert a fake/template one.
    for (let i = 0; i < interview.questions.length; i++) {
      const q = interview.questions[i];
      const isValid = isValidModelAnswer(q.modelAnswer);

      if (!q.evaluation || isValid) {
        continue;
      }

      try {
        const experienceLevel = interview.experienceLevel || mapExperienceYearsToLevel(interview.experienceYears);
        const generated = await this.openAIService.generateModelAnswer({
          question: q.questionText,
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceLevel: experienceLevel || 'professional',
          expectedPoints: q.expectedPoints,
          questionType: q.questionType as any,
        });

        q.modelAnswer = generated;
        await Interview.updateOne(
          { _id: interview._id },
          { $set: { [`questions.${i}.modelAnswer`]: generated } }
        );
        console.log(`[ModelAnswer] Backfilled Q${i + 1}`, { generated: true, length: generated.length });
      } catch (backfillError) {
        console.error(`[ModelAnswer] Backfill failed for Q${i + 1} (non-critical):`, backfillError);
        // Leave modelAnswer unset — report will simply omit it for this question.
      }
    }

    console.log(
      '[Report] model answers:',
      interview.questions.map((q, i) => ({
        question: i + 1,
        hasModelAnswer: isValidModelAnswer(q.modelAnswer),
        length: q.modelAnswer?.length || 0,
      }))
    );

    return {
      interview: {
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        experienceYears: interview.experienceYears,
        status: interview.status,
        createdAt: interview.createdAt,
        completedAt: interview.completedAt ?? interview.updatedAt,
        totalQuestions: interview.totalQuestions,
        answeredQuestions,
      },
      questions: interview.questions.map((q) => ({
        questionText: q.questionText,
        expectedPoints: q.expectedPoints,
        modelAnswer: isValidModelAnswer(q.modelAnswer) ? q.modelAnswer : undefined,
        answerText: q.answerText,
        answeredAt: q.answeredAt,
        duration: q.duration,
        evaluation: q.evaluation,
      })),
      finalReport: interview.finalReport
        ? {
            overallScore: calculatedOverallScore,
            summary: interview.finalReport.summary,
            recommendations: interview.finalReport.recommendations,
            strengthsOverview: interview.finalReport.strengthsOverview || [],
            weaknessesOverview: interview.finalReport.weaknessesOverview || [],
            nextSteps: interview.finalReport.nextSteps || [],
            generatedAt: interview.finalReport.generatedAt,
          }
        : undefined,
      statistics: {
        averageScore: calculatedOverallScore,
        completionRate: Math.round(completionRate),
        totalDuration,
        strengthsCount,
        weaknessesCount,
      },
    };
  }

  /**
   * Get user's interview history with pagination and filters
   */
  async getInterviewHistory(params: GetHistoryParams): Promise<{
    interviews: Array<{
      id: string;
      topic: string;
      difficulty: string;
      status: string;
      overallScore?: number;
      totalQuestions: number;
      answeredQuestions: number;
      createdAt: Date;
      completedAt?: Date;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const { userId, page, limit, filters } = params;

    // Build query
    const query: any = { userId: new Types.ObjectId(userId) };

    if (filters?.topic) {
      query.topic = filters.topic;
    }
    if (filters?.difficulty) {
      query.difficulty = filters.difficulty;
    }
    if (filters?.status) {
      query.status = filters.status;
    }

    // Count total documents
    const total = await Interview.countDocuments(query);

    // Fetch interviews with pagination
    const interviews = await Interview.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      interviews: interviews.map((interview) => ({
        id: interview._id.toString(),
        topic: interview.topic,
        difficulty: interview.difficulty,
        status: interview.status,
        overallScore: interview.finalReport?.overallScore,
        totalQuestions: interview.totalQuestions,
        answeredQuestions: interview.questions.filter((q) => q.answerText).length,
        createdAt: interview.createdAt,
        completedAt: interview.status === 'completed' || interview.status === 'evaluated'
          ? interview.completedAt ?? interview.updatedAt
          : undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user's interview statistics
   */
  async getUserStats(userId: string): Promise<{
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
    highestScore: number;
    lastInterviewScore: number;
  }> {
    const interviews = await Interview.find({
      userId: new Types.ObjectId(userId),
    }).sort({ createdAt: -1 }).lean();

    const completedInterviews = interviews.filter(
      (i) => i.status === 'completed' || i.status === 'evaluated'
    );

    const evaluatedInterviews = interviews.filter(
      (i) => i.status === 'evaluated' && i.finalReport?.overallScore !== undefined
    );

    // Calculate scores only from evaluated interviews with valid scores
    const validScores = evaluatedInterviews
      .map((i) => i.finalReport?.overallScore)
      .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

    const averageScore = validScores.length > 0
      ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
      : 0;

    const highestScore = validScores.length > 0
      ? Math.max(...validScores)
      : 0;

    const lastInterview = evaluatedInterviews[0];
    const lastInterviewScore = lastInterview?.finalReport?.overallScore ?? 0;

    return {
      totalInterviews: interviews.length,
      completedInterviews: completedInterviews.length,
      averageScore: Number(averageScore.toFixed(2)),
      highestScore: Number(highestScore.toFixed(2)),
      lastInterviewScore: Number(lastInterviewScore.toFixed(2)),
    };
  }

  /**
   * Delete an interview
   */
  async deleteInterview(interviewId: string, userId: string): Promise<void> {
    const interview = await Interview.findOne({
      _id: new Types.ObjectId(interviewId),
      userId: new Types.ObjectId(userId),
    });

    if (!interview) {
      throw new ApiError(404, 'Interview not found');
    }

    await Interview.deleteOne({ _id: new Types.ObjectId(interviewId) });
  }
}

export default new InterviewService();
