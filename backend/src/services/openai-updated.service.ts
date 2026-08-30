/**
 * @deprecated This file is no longer in use.
 * Active implementation: OpenAIService.ts
 * 
 * This file can be safely deleted after verifying no external imports.
 * Do not use this file for new development.
 */

import OpenAI from 'openai';
import { env } from '../config/environment';
import { IQuestion, IEvaluation } from '../models/interview.model';
import { ApiError } from '../utils/ApiError';
import { logInfo, logError } from '../middleware/logger';

export class OpenAIService {
  private openai: OpenAI;
  private questionModel: string = 'gpt-3.5-turbo';
  private evaluationModel: string = 'gpt-4';

  constructor() {
    if (!env.openaiApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    this.openai = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  async generateQuestion(params: {
    type: string;
    difficulty: string;
    topic: string;
    customInstructions?: string;
    previousQuestions: string[];
  }): Promise<{ text: string; followUps: string[] }> {
    const { type, difficulty, topic, customInstructions, previousQuestions } = params;

    const systemPrompt = this.getQuestionSystemPrompt(type, difficulty, topic);
    const userPrompt = this.getQuestionUserPrompt(
      previousQuestions,
      customInstructions
    );

    try {
      logInfo('Generating question', { type, difficulty, topic });

      const response = await this.openai.chat.completions.create({
        model: this.questionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new ApiError(500, 'Failed to generate question');
      }

      logInfo('Question generated successfully', {
        tokens: response.usage?.total_tokens,
      });

      return {
        text: content.trim(),
        followUps: [],
      };
    } catch (error: any) {
      logError('Error generating question', { error: error.message });
      throw new ApiError(500, 'Failed to generate question');
    }
  }

  async evaluateInterview(params: {
    type: string;
    difficulty: string;
    topic: string;
    questions: IQuestion[];
  }): Promise<IEvaluation> {
    const { type, difficulty, topic, questions } = params;

    const answeredQuestions = questions.filter((q) => q.answer);

    if (answeredQuestions.length === 0) {
      throw new ApiError(400, 'No answers to evaluate');
    }

    const systemPrompt = this.getEvaluationSystemPrompt(type, difficulty);
    const userPrompt = this.getEvaluationUserPrompt(
      topic,
      answeredQuestions
    );

    try {
      logInfo('Evaluating interview', {
        type,
        difficulty,
        questionCount: answeredQuestions.length,
      });

      const response = await this.openai.chat.completions.create({
        model: this.evaluationModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new ApiError(500, 'Failed to evaluate interview');
      }

      const result = JSON.parse(content);

      const evaluation: IEvaluation = {
        overallScore: result.overallScore || 0,
        grade: this.calculateGrade(result.overallScore || 0),
        breakdown: {
          technicalKnowledge: result.breakdown?.technicalKnowledge || 0,
          communication: result.breakdown?.communication || 0,
          leadership: result.breakdown?.leadership || 0,
          problemSolving: result.breakdown?.problemSolving || 0,
          confidence: result.breakdown?.confidence || 0,
        },
        strengths: result.strengths || [],
        weaknesses: result.weaknesses || [],
        suggestions: result.suggestions || [],
        recommendedTopics: result.recommendedTopics || [],
        detailedFeedback: result.detailedFeedback || '',
        evaluatedAt: new Date(),
        evaluatedBy: 'OpenAI',
        model: this.evaluationModel,
        tokensUsed: response.usage?.total_tokens || 0,
        cost: this.calculateCost(
          response.usage?.prompt_tokens || 0,
          response.usage?.completion_tokens || 0,
          this.evaluationModel
        ),
      };

      logInfo('Interview evaluated successfully', {
        overallScore: evaluation.overallScore,
        grade: evaluation.grade,
        tokens: evaluation.tokensUsed,
        cost: evaluation.cost,
      });

      return evaluation;
    } catch (error: any) {
      logError('Error evaluating interview', { error: error.message });
      throw new ApiError(500, 'Failed to evaluate interview');
    }
  }

  private getQuestionSystemPrompt(
    type: string,
    difficulty: string,
    topic: string
  ): string {
    return `You are an expert ${type} interviewer conducting a ${difficulty} level interview on ${topic}.

Your role:
- Ask realistic, practical interview questions
- Focus on ${type} skills and ${topic} expertise
- Match difficulty level: ${difficulty}
- Keep questions clear and concise
- Ask ONE question at a time

Question should be:
- Professional and realistic
- Appropriate for ${difficulty} level
- Focused on ${type} interview context
- Clear and specific`;
  }

  private getQuestionUserPrompt(
    previousQuestions: string[],
    customInstructions?: string
  ): string {
    let prompt = 'Generate a new interview question.\n\n';

    if (previousQuestions.length > 0) {
      prompt += `Previously asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n`;
      prompt +=
        'Generate a DIFFERENT question that has not been asked before.\n\n';
    }

    if (customInstructions) {
      prompt += `Additional instructions: ${customInstructions}\n\n`;
    }

    prompt += 'Provide only the question text, no additional formatting or numbering.';

    return prompt;
  }

  private getEvaluationSystemPrompt(type: string, difficulty: string): string {
    return `You are an expert interview evaluator specializing in ${type} interviews at ${difficulty} level.

Evaluate the candidate's performance across five dimensions (0-10 scale):
1. Technical Knowledge: Accuracy, depth, and correctness of information
2. Communication: Clarity, structure, and articulation
3. Leadership: Team management, decision-making, influence (when applicable)
4. Problem Solving: Analytical thinking, approach, and reasoning
5. Confidence: Decisiveness, conviction, and presentation

Provide:
- Individual scores for each dimension
- Overall score (weighted average)
- Specific strengths (what they did well)
- Specific weaknesses (areas needing improvement)
- Actionable suggestions for improvement
- Recommended topics for further study
- Detailed feedback summarizing the performance

Be objective, constructive, and specific.`;
  }

  private getEvaluationUserPrompt(
    topic: string,
    questions: IQuestion[]
  ): string {
    let prompt = `Interview Topic: ${topic}\n\n`;
    prompt += `Questions and Answers:\n\n`;

    questions.forEach((q, index) => {
      prompt += `Question ${index + 1}: ${q.text}\n`;
      prompt += `Answer: ${q.answer?.text || 'No answer provided'}\n`;
      prompt += `Confidence: ${((q.answer?.transcriptionConfidence || 0) * 100).toFixed(0)}%\n\n`;
    });

    prompt += `Evaluate this interview and return a JSON object with this structure:
{
  "overallScore": <number 0-10>,
  "breakdown": {
    "technicalKnowledge": <number 0-10>,
    "communication": <number 0-10>,
    "leadership": <number 0-10>,
    "problemSolving": <number 0-10>,
    "confidence": <number 0-10>
  },
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "suggestions": ["suggestion 1", "suggestion 2", ...],
  "recommendedTopics": ["topic 1", "topic 2", ...],
  "detailedFeedback": "Comprehensive feedback paragraph"
}`;

    return prompt;
  }

  private calculateGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 9.5) return 'A+';
    if (score >= 8.5) return 'A';
    if (score >= 7.0) return 'B';
    if (score >= 5.0) return 'C';
    if (score >= 3.0) return 'D';
    return 'F';
  }

  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model: string
  ): number {
    const pricing: { [key: string]: { prompt: number; completion: number } } = {
      'gpt-4': { prompt: 0.03 / 1000, completion: 0.06 / 1000 },
      'gpt-3.5-turbo': { prompt: 0.0005 / 1000, completion: 0.0015 / 1000 },
    };

    const modelPricing = pricing[model] || pricing['gpt-4'];
    const cost =
      promptTokens * modelPricing.prompt +
      completionTokens * modelPricing.completion;

    return parseFloat(cost.toFixed(6));
  }
}
