# OpenAI Service Architecture - AI Voice Interview Coach

## Overview

Complete production-ready OpenAI service layer with question generation, answer evaluation, and report generation capabilities.

**Technology Stack**:
- OpenAI SDK (GPT-4, GPT-3.5-turbo)
- TypeScript 5.x
- Node.js 18+
- Retry Logic with Exponential Backoff
- Cost Optimization Strategies

**Date**: June 9, 2026  
**Version**: 1.0

---

## Table of Contents

1. [Service Architecture](#service-architecture)
2. [TypeScript Interfaces](#typescript-interfaces)
3. [Service Implementations](#service-implementations)
4. [Prompt Templates](#prompt-templates)
5. [Error Handling](#error-handling)
6. [Retry Logic](#retry-logic)
7. [Cost Optimization](#cost-optimization)
8. [Best Practices](#best-practices)

---

## Service Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       Application Layer                          │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     OpenAI Service Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        QuestionGenerationService                          │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • generateQuestion()                                     │  │
│  │  • generateFollowUpQuestion()                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                        │
│                          ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        EvaluationService                                  │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • evaluateAnswer()                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                        │
│                          ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        ReportService                                      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • generateFinalReport()                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                        │
│                          ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        PromptTemplateService                              │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • getQuestionPrompt()                                    │  │
│  │  • getEvaluationPrompt()                                  │  │
│  │  • getReportPrompt()                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                        │
│                          ▼                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        OpenAIClient (Base)                                │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  • callWithRetry()                                        │  │
│  │  • handleError()                                          │  │
│  │  • trackUsage()                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                       OpenAI API                                 │
│                    (GPT-4, GPT-3.5-turbo)                        │
└─────────────────────────────────────────────────────────────────┘
```

### Service Responsibilities

| Service | Responsibility | Model | Avg Cost |
|---------|---------------|-------|----------|
| **QuestionGenerationService** | Generate primary and follow-up questions | GPT-3.5-turbo | $0.002/request |
| **EvaluationService** | Evaluate candidate answers with scores | GPT-4 | $0.05/request |
| **ReportService** | Generate comprehensive interview reports | GPT-4 | $0.08/request |
| **PromptTemplateService** | Manage and format prompts | N/A | Free |
| **OpenAIClient** | Handle API calls, retries, errors | N/A | Free |

---

## TypeScript Interfaces

### Core Interfaces

```typescript
// src/interfaces/openai.interface.ts

import { ChatCompletionMessageParam } from 'openai/resources/chat';

/**
 * Interview Topics
 */
export type InterviewTopic =
  | 'NodeJS'
  | 'React'
  | 'Angular'
  | 'MongoDB'
  | 'TypeScript'
  | 'SystemDesign'
  | 'TeamLead'
  | 'EngineeringManager';

/**
 * Difficulty Levels
 */
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';

/**
 * Interview Types
 */
export type InterviewType = 'technical' | 'behavioral' | 'system-design' | 'leadership';

/**
 * OpenAI Model Configuration
 */
export interface ModelConfig {
  model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * Usage Tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/**
 * API Response Wrapper
 */
export interface OpenAIResponse<T> {
  data: T;
  usage: TokenUsage;
  model: string;
  cached?: boolean;
}
```

### Question Generation Interfaces

```typescript
/**
 * Question Generation Request
 */
export interface GenerateQuestionRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  interviewType: InterviewType;
  jobDescription?: string;
  previousQuestions?: string[];
}

/**
 * Generated Question
 */
export interface GeneratedQuestion {
  questionText: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  expectedKeywords: string[];
  estimatedTime: number; // in seconds
  followUpPrompts?: string[];
}

/**
 * Follow-up Question Request
 */
export interface GenerateFollowUpRequest {
  originalQuestion: string;
  candidateAnswer: string;
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
}

/**
 * Follow-up Question
 */
export interface FollowUpQuestion {
  questionText: string;
  reason: string;
  focusArea: string;
}
```

### Evaluation Interfaces

```typescript
/**
 * Answer Evaluation Request
 */
export interface EvaluateAnswerRequest {
  question: string;
  answer: string;
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  expectedKeywords?: string[];
  context?: {
    experienceYears: number;
    interviewType: InterviewType;
  };
}

/**
 * Evaluation Scores
 */
export interface EvaluationScores {
  technical: number; // 0-10
  communication: number; // 0-10
  leadership: number; // 0-10
  problemSolving: number; // 0-10
  confidence: number; // 0-10
  overall: number; // 0-10
}

/**
 * Evaluation Feedback
 */
export interface EvaluationFeedback {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  detailedAnalysis: string;
  keywordCoverage: {
    keyword: string;
    covered: boolean;
  }[];
}

/**
 * Answer Evaluation Result
 */
export interface AnswerEvaluation {
  scores: EvaluationScores;
  feedback: EvaluationFeedback;
  grade: 'Excellent' | 'Good' | 'Average' | 'Below Average' | 'Poor';
}
```

### Report Generation Interfaces

```typescript
/**
 * Report Generation Request
 */
export interface GenerateReportRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  evaluations: Array<{
    question: string;
    answer: string;
    evaluation: AnswerEvaluation;
  }>;
  interviewDuration: number; // in seconds
}

/**
 * Interview Report
 */
export interface InterviewReport {
  summary: {
    overallScore: number;
    totalQuestions: number;
    averageResponseTime: number;
    interviewDuration: number;
  };
  scoreBreakdown: {
    technical: number;
    communication: number;
    leadership: number;
    problemSolving: number;
    confidence: number;
  };
  insights: {
    topStrengths: string[];
    topWeaknesses: string[];
    improvementAreas: string[];
    overallAssessment: string;
  };
  recommendations: {
    studyTopics: string[];
    practiceAreas: string[];
    resources: {
      title: string;
      type: 'article' | 'video' | 'book' | 'course';
      url?: string;
    }[];
  };
  comparison?: {
    industryAverage: number;
    percentile: number;
  };
}
```

### Error Interfaces

```typescript
/**
 * OpenAI Error Types
 */
export enum OpenAIErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  API_ERROR = 'API_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION = 'AUTHENTICATION',
  CONTEXT_LENGTH = 'CONTEXT_LENGTH',
  PARSING_ERROR = 'PARSING_ERROR',
}

/**
 * OpenAI Service Error
 */
export class OpenAIServiceError extends Error {
  constructor(
    public type: OpenAIErrorType,
    message: string,
    public originalError?: any,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'OpenAIServiceError';
  }
}
```

---

## Service Implementations

### Base OpenAI Client

```typescript
// src/services/openai/openai-client.ts

import OpenAI from 'openai';
import { injectable } from 'tsyringe';
import { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat';
import {
  OpenAIServiceError,
  OpenAIErrorType,
  TokenUsage,
  OpenAIResponse,
} from '../../interfaces/openai.interface';
import { Logger } from '../../utils/logger';

@injectable()
export class OpenAIClient {
  private client: OpenAI;
  private logger: Logger;
  private requestCount: number = 0;
  private totalCost: number = 0;

  // Pricing per 1K tokens (as of June 2026)
  private readonly PRICING = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  };

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000, // 60 seconds
      maxRetries: 0, // We handle retries manually
    });
    this.logger = new Logger('OpenAIClient');
  }

  /**
   * Call OpenAI API with retry logic
   */
  async callWithRetry<T>(
    params: ChatCompletionCreateParamsNonStreaming,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      parseResponse?: (content: string) => T;
    } = {}
  ): Promise<OpenAIResponse<T>> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      parseResponse = (content) => JSON.parse(content) as T,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Log attempt
        this.logger.info('OpenAI API call', {
          model: params.model,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
        });

        // Make API call
        const startTime = Date.now();
        const response = await this.client.chat.completions.create(params);
        const duration = Date.now() - startTime;

        // Extract response
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new OpenAIServiceError(
            OpenAIErrorType.API_ERROR,
            'Empty response from OpenAI',
            null,
            true
          );
        }

        // Parse response
        let parsedData: T;
        try {
          parsedData = parseResponse(content);
        } catch (parseError) {
          throw new OpenAIServiceError(
            OpenAIErrorType.PARSING_ERROR,
            'Failed to parse OpenAI response',
            parseError,
            false
          );
        }

        // Calculate usage and cost
        const usage = this.calculateUsage(response, params.model as string);

        // Track metrics
        this.requestCount++;
        this.totalCost += usage.estimatedCost;

        this.logger.info('OpenAI API success', {
          model: params.model,
          duration,
          tokens: usage.totalTokens,
          cost: usage.estimatedCost,
        });

        return {
          data: parsedData,
          usage,
          model: response.model,
        };
      } catch (error: any) {
        lastError = error;

        // Handle specific errors
        const serviceError = this.handleError(error);

        // Don't retry non-retryable errors
        if (!serviceError.retryable || attempt === maxRetries) {
          this.logger.error('OpenAI API failed', {
            error: serviceError.message,
            type: serviceError.type,
            attempt: attempt + 1,
          });
          throw serviceError;
        }

        // Calculate exponential backoff delay
        const delay = retryDelay * Math.pow(2, attempt);
        this.logger.warn('Retrying OpenAI API call', {
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          delay,
          error: serviceError.message,
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Unknown error occurred');
  }

  /**
   * Calculate token usage and cost
   */
  private calculateUsage(
    response: any,
    model: string
  ): TokenUsage {
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Get pricing for model
    const modelKey = model.includes('gpt-4-turbo')
      ? 'gpt-4-turbo'
      : model.includes('gpt-4')
      ? 'gpt-4'
      : 'gpt-3.5-turbo';

    const pricing = this.PRICING[modelKey as keyof typeof this.PRICING];

    // Calculate cost
    const inputCost = (promptTokens / 1000) * pricing.input;
    const outputCost = (completionTokens / 1000) * pricing.output;
    const estimatedCost = inputCost + outputCost;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: Number(estimatedCost.toFixed(6)),
    };
  }

  /**
   * Handle API errors
   */
  private handleError(error: any): OpenAIServiceError {
    // Rate limit error
    if (error.status === 429) {
      return new OpenAIServiceError(
        OpenAIErrorType.RATE_LIMIT,
        'Rate limit exceeded. Please try again later.',
        error,
        true
      );
    }

    // Authentication error
    if (error.status === 401) {
      return new OpenAIServiceError(
        OpenAIErrorType.AUTHENTICATION,
        'Invalid API key',
        error,
        false
      );
    }

    // Context length error
    if (error.status === 400 && error.message?.includes('context_length')) {
      return new OpenAIServiceError(
        OpenAIErrorType.CONTEXT_LENGTH,
        'Request exceeds context length',
        error,
        false
      );
    }

    // Invalid request
    if (error.status === 400) {
      return new OpenAIServiceError(
        OpenAIErrorType.INVALID_REQUEST,
        error.message || 'Invalid request',
        error,
        false
      );
    }

    // Timeout
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return new OpenAIServiceError(
        OpenAIErrorType.TIMEOUT,
        'Request timed out',
        error,
        true
      );
    }

    // Server error
    if (error.status >= 500) {
      return new OpenAIServiceError(
        OpenAIErrorType.API_ERROR,
        'OpenAI server error',
        error,
        true
      );
    }

    // Generic error
    return new OpenAIServiceError(
      OpenAIErrorType.API_ERROR,
      error.message || 'Unknown error occurred',
      error,
      true
    );
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      requestCount: this.requestCount,
      totalCost: Number(this.totalCost.toFixed(2)),
      averageCostPerRequest:
        this.requestCount > 0
          ? Number((this.totalCost / this.requestCount).toFixed(4))
          : 0,
    };
  }

  /**
   * Reset usage statistics
   */
  resetUsageStats() {
    this.requestCount = 0;
    this.totalCost = 0;
  }
}
```

### Question Generation Service

```typescript
// src/services/openai/question-generation.service.ts

import { injectable, inject } from 'tsyringe';
import { OpenAIClient } from './openai-client';
import { PromptTemplateService } from './prompt-template.service';
import {
  GenerateQuestionRequest,
  GeneratedQuestion,
  GenerateFollowUpRequest,
  FollowUpQuestion,
  OpenAIResponse,
} from '../../interfaces/openai.interface';

@injectable()
export class QuestionGenerationService {
  constructor(
    @inject(OpenAIClient) private openAIClient: OpenAIClient,
    @inject(PromptTemplateService) private promptTemplate: PromptTemplateService
  ) {}

  /**
   * Generate primary interview question
   */
  async generateQuestion(
    request: GenerateQuestionRequest
  ): Promise<OpenAIResponse<GeneratedQuestion>> {
    // Get prompt template
    const systemPrompt = this.promptTemplate.getQuestionPrompt(
      request.topic,
      request.interviewType
    );

    // Build user message
    const userMessage = this.buildQuestionUserMessage(request);

    // Call OpenAI
    return this.openAIClient.callWithRetry<GeneratedQuestion>(
      {
        model: 'gpt-3.5-turbo', // Cost optimization: use 3.5 for questions
        temperature: 0.7,
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      },
      {
        maxRetries: 3,
        retryDelay: 1000,
      }
    );
  }

  /**
   * Generate follow-up question based on answer
   */
  async generateFollowUpQuestion(
    request: GenerateFollowUpRequest
  ): Promise<OpenAIResponse<FollowUpQuestion>> {
    // Get prompt template
    const systemPrompt = this.promptTemplate.getFollowUpPrompt();

    // Build user message
    const userMessage = this.buildFollowUpUserMessage(request);

    // Call OpenAI
    return this.openAIClient.callWithRetry<FollowUpQuestion>(
      {
        model: 'gpt-3.5-turbo',
        temperature: 0.8,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
      },
      {
        maxRetries: 2,
        retryDelay: 1000,
      }
    );
  }

  /**
   * Build user message for question generation
   */
  private buildQuestionUserMessage(request: GenerateQuestionRequest): string {
    let message = `Generate an interview question with the following specifications:\n\n`;
    message += `Topic: ${request.topic}\n`;
    message += `Difficulty: ${request.difficulty}\n`;
    message += `Candidate Experience: ${request.experienceYears} years\n`;
    message += `Interview Type: ${request.interviewType}\n`;

    if (request.jobDescription) {
      message += `\nJob Description:\n${request.jobDescription}\n`;
    }

    if (request.previousQuestions && request.previousQuestions.length > 0) {
      message += `\nPrevious Questions (avoid duplicates):\n`;
      request.previousQuestions.forEach((q, i) => {
        message += `${i + 1}. ${q}\n`;
      });
    }

    message += `\nReturn a JSON object with the following structure:\n`;
    message += `{\n`;
    message += `  "questionText": "The interview question",\n`;
    message += `  "category": "The question category",\n`;
    message += `  "difficulty": "easy|medium|hard",\n`;
    message += `  "expectedKeywords": ["keyword1", "keyword2"],\n`;
    message += `  "estimatedTime": 120,\n`;
    message += `  "followUpPrompts": ["optional follow-up prompt"]\n`;
    message += `}`;

    return message;
  }

  /**
   * Build user message for follow-up generation
   */
  private buildFollowUpUserMessage(request: GenerateFollowUpRequest): string {
    let message = `Generate a follow-up question based on:\n\n`;
    message += `Original Question: ${request.originalQuestion}\n\n`;
    message += `Candidate's Answer: ${request.candidateAnswer}\n\n`;
    message += `Topic: ${request.topic}\n`;
    message += `Difficulty: ${request.difficulty}\n\n`;
    message += `Return a JSON object with:\n`;
    message += `{\n`;
    message += `  "questionText": "The follow-up question",\n`;
    message += `  "reason": "Why this follow-up is relevant",\n`;
    message += `  "focusArea": "What area to probe deeper"\n`;
    message += `}`;

    return message;
  }
}
```

**Continue to next file...**
