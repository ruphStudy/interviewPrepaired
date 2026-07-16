# Interview Workflow Architecture - Part 2
## Backend Flow, Failure Recovery & Retry Logic

---

## Backend Flow

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────┘

API Gateway
    │
    ├──> Interview Controller
    │       │
    │       ├──> Interview Service
    │       │       │
    │       │       ├──> Interview Repository (MongoDB)
    │       │       ├──> Question Generation Service (OpenAI)
    │       │       ├──> Evaluation Service (OpenAI)
    │       │       ├──> Report Service (OpenAI)
    │       │       └──> Cache Service (Redis)
    │       │
    │       └──> Response Builder
    │
    └──> Error Handler Middleware
            │
            ├──> Retry Service
            ├──> Circuit Breaker
            └──> Logger Service
```

### Interview Service Flow

```typescript
// services/interview.service.ts

@injectable()
export class InterviewService {
  constructor(
    @inject(InterviewRepository) private repo: InterviewRepository,
    @inject(QuestionGenerationService) private questionService: QuestionGenerationService,
    @inject(EvaluationService) private evaluationService: EvaluationService,
    @inject(ReportService) private reportService: ReportService,
    @inject(CacheService) private cache: CacheService,
    @inject(EventEmitter) private events: EventEmitter,
    @inject(Logger) private logger: Logger
  ) {}

  /**
   * Create interview and generate first question
   */
  async createInterview(config: InterviewConfig): Promise<InterviewResponse> {
    this.logger.info('Creating interview', { config });

    try {
      // 1. Validate configuration
      this.validateConfig(config);

      // 2. Create interview record
      const interview = await this.repo.create({
        userId: config.userId,
        topic: config.topic,
        difficulty: config.difficulty,
        experienceYears: config.experienceYears,
        totalQuestions: config.totalQuestions,
        status: 'in-progress',
        createdAt: new Date(),
      });

      // 3. Generate first question (with retry)
      const questionResponse = await this.withRetry(
        () => this.questionService.generateQuestion({
          topic: config.topic,
          difficulty: config.difficulty,
          experienceYears: config.experienceYears,
          interviewType: config.interviewType,
        }),
        { maxRetries: 3, context: 'generate_first_question' }
      );

      // 4. Store question
      const question = await this.repo.addQuestion(interview.id, {
        questionText: questionResponse.data.questionText,
        sequenceNumber: 1,
        category: questionResponse.data.category,
        expectedKeywords: questionResponse.data.expectedKeywords,
        generatedAt: new Date(),
      });

      // 5. Emit event
      this.events.emit('interview:created', {
        interviewId: interview.id,
        userId: config.userId,
      });

      // 6. Return response
      return {
        success: true,
        data: {
          interviewId: interview.id,
          status: interview.status,
          currentQuestion: question,
          progress: this.calculateProgress(interview),
        },
      };

    } catch (error) {
      this.logger.error('Failed to create interview', { error, config });
      throw this.handleError(error);
    }
  }

  /**
   * Submit answer and generate evaluation
   */
  async submitAnswer(
    interviewId: string,
    answerData: SubmitAnswerRequest
  ): Promise<AnswerResponse> {
    this.logger.info('Submitting answer', { interviewId, answerData });

    try {
      // 1. Load interview
      const interview = await this.repo.findById(interviewId);
      if (!interview) {
        throw new NotFoundError('Interview not found');
      }

      // 2. Validate state
      if (interview.status !== 'in-progress') {
        throw new InvalidStateError('Interview is not in progress');
      }

      // 3. Get question
      const question = await this.repo.getQuestion(answerData.questionId);
      if (!question) {
        throw new NotFoundError('Question not found');
      }

      // 4. Store answer
      const answer = await this.repo.addAnswer(interviewId, {
        questionId: answerData.questionId,
        transcript: answerData.transcript,
        answerDuration: answerData.answerDuration,
        submittedAt: new Date(),
      });

      // 5. Evaluate answer (with retry)
      const evaluationResponse = await this.withRetry(
        () => this.evaluationService.evaluateAnswer({
          question: question.questionText,
          answer: answerData.transcript,
          topic: interview.topic,
          difficulty: interview.difficulty,
          expectedKeywords: question.expectedKeywords,
        }),
        { maxRetries: 3, context: 'evaluate_answer' }
      );

      // 6. Store evaluation
      const evaluation = await this.repo.addEvaluation(interviewId, {
        answerId: answer.id,
        scores: evaluationResponse.data.scores,
        feedback: evaluationResponse.data.feedback,
        grade: evaluationResponse.data.grade,
        evaluatedAt: new Date(),
      });

      // 7. Determine next action
      const progress = this.calculateProgress(interview);
      let nextQuestion = null;

      if (progress.questionsAnswered < interview.totalQuestions) {
        // Generate next question
        nextQuestion = await this.generateNextQuestion(interview, evaluation);
      }

      // 8. Emit event
      this.events.emit('answer:evaluated', {
        interviewId,
        answerId: answer.id,
        score: evaluation.scores.overall,
      });

      // 9. Return response
      return {
        success: true,
        data: {
          answerId: answer.id,
          evaluation,
          nextQuestion,
          progress: this.calculateProgress(interview),
        },
      };

    } catch (error) {
      this.logger.error('Failed to submit answer', { error, interviewId });
      throw this.handleError(error);
    }
  }

  /**
   * Complete interview and generate report
   */
  async completeInterview(interviewId: string): Promise<CompleteResponse> {
    this.logger.info('Completing interview', { interviewId });

    try {
      // 1. Load interview with all data
      const interview = await this.repo.findByIdWithFullData(interviewId);
      if (!interview) {
        throw new NotFoundError('Interview not found');
      }

      // 2. Validate all questions answered
      if (interview.answers.length < interview.totalQuestions) {
        throw new InvalidStateError('Not all questions answered');
      }

      // 3. Update status
      await this.repo.update(interviewId, {
        status: 'completed',
        completedAt: new Date(),
      });

      // 4. Trigger report generation (async)
      this.generateReportAsync(interviewId).catch((error) => {
        this.logger.error('Failed to generate report', { error, interviewId });
      });

      // 5. Emit event
      this.events.emit('interview:completed', {
        interviewId,
        userId: interview.userId,
        averageScore: this.calculateAverageScore(interview.evaluations),
      });

      // 6. Return response
      return {
        success: true,
        data: {
          interviewId,
          status: 'completed',
          completedAt: new Date(),
          summary: {
            totalQuestions: interview.totalQuestions,
            totalAnswered: interview.answers.length,
            totalEvaluated: interview.evaluations.length,
            averageScore: this.calculateAverageScore(interview.evaluations),
          },
        },
      };

    } catch (error) {
      this.logger.error('Failed to complete interview', { error, interviewId });
      throw this.handleError(error);
    }
  }

  /**
   * Generate final report
   */
  async generateReport(interviewId: string): Promise<ReportResponse> {
    this.logger.info('Generating report', { interviewId });

    try {
      // 1. Load interview with full data
      const interview = await this.repo.findByIdWithFullData(interviewId);
      if (!interview) {
        throw new NotFoundError('Interview not found');
      }

      // 2. Check if report already exists
      const existingReport = await this.repo.getReport(interviewId);
      if (existingReport) {
        return {
          success: true,
          data: existingReport,
        };
      }

      // 3. Prepare evaluation data
      const evaluations = interview.evaluations.map((eval, index) => ({
        question: interview.questions[index].questionText,
        answer: interview.answers[index].transcript,
        evaluation: eval,
      }));

      // 4. Generate report (with retry)
      const reportResponse = await this.withRetry(
        () => this.reportService.generateFinalReport({
          topic: interview.topic,
          difficulty: interview.difficulty,
          experienceYears: interview.experienceYears,
          interviewDuration: this.calculateDuration(interview),
          evaluations,
        }),
        { maxRetries: 3, context: 'generate_report' }
      );

      // 5. Store report
      const report = await this.repo.addReport(interviewId, {
        reportData: reportResponse.data,
        generatedAt: new Date(),
      });

      // 6. Emit event
      this.events.emit('report:generated', {
        interviewId,
        reportId: report.id,
      });

      // 7. Return response
      return {
        success: true,
        data: report,
      };

    } catch (error) {
      this.logger.error('Failed to generate report', { error, interviewId });
      throw this.handleError(error);
    }
  }

  /**
   * Generate next question (primary or follow-up)
   */
  private async generateNextQuestion(
    interview: Interview,
    lastEvaluation: Evaluation
  ): Promise<Question> {
    // Decide: follow-up or new question?
    const shouldFollowUp = this.shouldGenerateFollowUp(lastEvaluation);

    if (shouldFollowUp) {
      // Generate follow-up
      const followUpResponse = await this.questionService.generateFollowUpQuestion({
        topic: interview.topic,
        difficulty: interview.difficulty,
        previousQuestion: interview.questions[interview.questions.length - 1].questionText,
        previousAnswer: interview.answers[interview.answers.length - 1].transcript,
        evaluation: lastEvaluation,
      });

      return await this.repo.addQuestion(interview.id, {
        questionText: followUpResponse.data.questionText,
        sequenceNumber: interview.questions.length + 1,
        category: 'follow-up',
        parentQuestionId: interview.questions[interview.questions.length - 1].id,
        generatedAt: new Date(),
      });
    } else {
      // Generate new primary question
      const questionResponse = await this.questionService.generateQuestion({
        topic: interview.topic,
        difficulty: interview.difficulty,
        experienceYears: interview.experienceYears,
        interviewType: interview.interviewType,
        previousQuestions: interview.questions.map((q) => q.questionText),
      });

      return await this.repo.addQuestion(interview.id, {
        questionText: questionResponse.data.questionText,
        sequenceNumber: interview.questions.length + 1,
        category: questionResponse.data.category,
        expectedKeywords: questionResponse.data.expectedKeywords,
        generatedAt: new Date(),
      });
    }
  }

  /**
   * Determine if follow-up question is needed
   */
  private shouldGenerateFollowUp(evaluation: Evaluation): boolean {
    // Generate follow-up if:
    // 1. Score is high (> 8) - probe deeper
    // 2. Score is low (< 5) - clarify understanding
    // 3. Answer was incomplete
    const score = evaluation.scores.overall;
    return score > 8 || score < 5;
  }

  /**
   * Generic retry wrapper
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    return await retryWithBackoff(fn, options);
  }

  /**
   * Error handler
   */
  private handleError(error: unknown): Error {
    if (error instanceof AppError) {
      return error;
    }
    return new InternalServerError('An unexpected error occurred');
  }
}
```

---

## Failure Recovery Strategy

### Error Classification

```typescript
// types/errors.ts

export enum ErrorType {
  // Retryable errors
  RATE_LIMIT = 'RATE_LIMIT',           // OpenAI rate limit
  TIMEOUT = 'TIMEOUT',                 // Request timeout
  NETWORK = 'NETWORK',                 // Network failure
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE', // External service down

  // Non-retryable errors
  VALIDATION = 'VALIDATION',           // Invalid input
  AUTHENTICATION = 'AUTHENTICATION',   // Auth failure
  NOT_FOUND = 'NOT_FOUND',            // Resource not found
  CONFLICT = 'CONFLICT',              // State conflict
  CONTEXT_LENGTH = 'CONTEXT_LENGTH',  // Token limit exceeded
  PARSING = 'PARSING',                // Response parsing failed
}

export interface ErrorMetadata {
  type: ErrorType;
  retryable: boolean;
  httpStatus: number;
  userMessage: string;
  technicalMessage: string;
  context?: Record<string, any>;
}
```

### Recovery Strategy Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FAILURE RECOVERY MATRIX                           │
└─────────────────────────────────────────────────────────────────────┘

Error Type           | Retryable | Strategy                | Max Retries
─────────────────────┼───────────┼────────────────────────┼────────────
RATE_LIMIT          | ✅ Yes    | Exponential backoff     | 5
                    |           | Wait for rate limit     |
                    |           | reset (60s)             |
─────────────────────┼───────────┼────────────────────────┼────────────
TIMEOUT             | ✅ Yes    | Exponential backoff     | 3
                    |           | Increase timeout        |
                    |           | on each retry           |
─────────────────────┼───────────┼────────────────────────┼────────────
NETWORK             | ✅ Yes    | Exponential backoff     | 3
                    |           | Check connectivity      |
─────────────────────┼───────────┼────────────────────────┼────────────
SERVICE_UNAVAILABLE | ✅ Yes    | Exponential backoff     | 3
                    |           | Circuit breaker         |
─────────────────────┼───────────┼────────────────────────┼────────────
VALIDATION          | ❌ No     | Return error to user    | 0
                    |           | Log for analysis        |
─────────────────────┼───────────┼────────────────────────┼────────────
AUTHENTICATION      | ❌ No     | Refresh token           | 1
                    |           | Re-authenticate         |
─────────────────────┼───────────┼────────────────────────┼────────────
NOT_FOUND           | ❌ No     | Return 404              | 0
                    |           | Check data integrity    |
─────────────────────┼───────────┼────────────────────────┼────────────
CONFLICT            | ✅ Yes    | Reload state            | 2
                    |           | Retry operation         |
─────────────────────┼───────────┼────────────────────────┼────────────
CONTEXT_LENGTH      | ❌ No     | Truncate content        | 0
                    |           | Retry with less data    |
─────────────────────┼───────────┼────────────────────────┼────────────
PARSING             | ❌ No     | Log response            | 0
                    |           | Use fallback format     |
```

### Recovery Implementation

```typescript
// services/recovery.service.ts

@injectable()
export class RecoveryService {
  constructor(
    @inject(Logger) private logger: Logger,
    @inject(StateStore) private stateStore: StateStore,
    @inject(CircuitBreaker) private circuitBreaker: CircuitBreaker
  ) {}

  /**
   * Handle error with appropriate recovery strategy
   */
  async handleError(
    error: Error,
    context: ErrorContext
  ): Promise<RecoveryResult> {
    const errorMetadata = this.classifyError(error);

    this.logger.error('Error occurred', {
      error,
      metadata: errorMetadata,
      context,
    });

    // Check if retryable
    if (!errorMetadata.retryable) {
      return {
        recovered: false,
        shouldRetry: false,
        userMessage: errorMetadata.userMessage,
      };
    }

    // Check circuit breaker
    if (this.circuitBreaker.isOpen(context.service)) {
      return {
        recovered: false,
        shouldRetry: false,
        userMessage: 'Service temporarily unavailable. Please try again later.',
      };
    }

    // Execute recovery strategy
    const strategy = this.getRecoveryStrategy(errorMetadata.type);
    const result = await strategy.execute(error, context);

    // Update circuit breaker
    if (!result.recovered) {
      this.circuitBreaker.recordFailure(context.service);
    } else {
      this.circuitBreaker.recordSuccess(context.service);
    }

    return result;
  }

  /**
   * Classify error type
   */
  private classifyError(error: Error): ErrorMetadata {
    // OpenAI rate limit
    if (error.message.includes('Rate limit')) {
      return {
        type: ErrorType.RATE_LIMIT,
        retryable: true,
        httpStatus: 429,
        userMessage: 'Service is busy. Retrying...',
        technicalMessage: error.message,
      };
    }

    // Timeout
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return {
        type: ErrorType.TIMEOUT,
        retryable: true,
        httpStatus: 408,
        userMessage: 'Request timed out. Retrying...',
        technicalMessage: error.message,
      };
    }

    // Network error
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return {
        type: ErrorType.NETWORK,
        retryable: true,
        httpStatus: 503,
        userMessage: 'Network error. Please check your connection.',
        technicalMessage: error.message,
      };
    }

    // Service unavailable
    if (error.message.includes('503') || error.message.includes('unavailable')) {
      return {
        type: ErrorType.SERVICE_UNAVAILABLE,
        retryable: true,
        httpStatus: 503,
        userMessage: 'Service temporarily unavailable. Retrying...',
        technicalMessage: error.message,
      };
    }

    // Validation error
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return {
        type: ErrorType.VALIDATION,
        retryable: false,
        httpStatus: 400,
        userMessage: 'Invalid input. Please check your data.',
        technicalMessage: error.message,
      };
    }

    // Context length
    if (error.message.includes('context_length_exceeded')) {
      return {
        type: ErrorType.CONTEXT_LENGTH,
        retryable: false,
        httpStatus: 400,
        userMessage: 'Response too long. Please shorten your answer.',
        technicalMessage: error.message,
      };
    }

    // Default: internal error
    return {
      type: ErrorType.NETWORK,
      retryable: true,
      httpStatus: 500,
      userMessage: 'An unexpected error occurred. Retrying...',
      technicalMessage: error.message,
    };
  }

  /**
   * Get recovery strategy for error type
   */
  private getRecoveryStrategy(errorType: ErrorType): RecoveryStrategy {
    switch (errorType) {
      case ErrorType.RATE_LIMIT:
        return new RateLimitRecoveryStrategy();
      case ErrorType.TIMEOUT:
        return new TimeoutRecoveryStrategy();
      case ErrorType.NETWORK:
        return new NetworkRecoveryStrategy();
      case ErrorType.SERVICE_UNAVAILABLE:
        return new ServiceUnavailableRecoveryStrategy();
      case ErrorType.CONFLICT:
        return new ConflictRecoveryStrategy();
      default:
        return new DefaultRecoveryStrategy();
    }
  }

  /**
   * Save state for recovery
   */
  async saveRecoveryState(
    interviewId: string,
    state: InterviewState
  ): Promise<void> {
    await this.stateStore.set(`recovery:${interviewId}`, {
      state,
      timestamp: new Date(),
      ttl: 3600, // 1 hour
    });
  }

  /**
   * Restore state after recovery
   */
  async restoreState(interviewId: string): Promise<InterviewState | null> {
    const saved = await this.stateStore.get(`recovery:${interviewId}`);
    return saved?.state || null;
  }
}
```

---

## Retry Logic

### Exponential Backoff Implementation

```typescript
// utils/retry.ts

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
  context?: string;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,       // 1 second
  maxDelay: 30000,          // 30 seconds
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error;
  let attempt = 0;

  while (attempt <= opts.maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      attempt++;

      // Check if should retry
      if (opts.shouldRetry && !opts.shouldRetry(lastError)) {
        throw lastError;
      }

      // Max retries reached
      if (attempt > opts.maxRetries) {
        throw new MaxRetriesExceededError(
          `Max retries (${opts.maxRetries}) exceeded. Last error: ${lastError.message}`,
          lastError
        );
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      // Callback
      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      // Log retry
      console.log(
        `Retry attempt ${attempt}/${opts.maxRetries} after ${delay}ms delay`,
        { context: opts.context, error: lastError.message }
      );

      // Wait before retry
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  // Base delay: initialDelay * (backoffMultiplier ^ attempt)
  let delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt - 1);

  // Cap at maxDelay
  delay = Math.min(delay, options.maxDelay);

  // Add jitter (randomness) to prevent thundering herd
  if (options.jitter) {
    const jitterAmount = delay * 0.3; // ±30%
    delay = delay + (Math.random() * jitterAmount * 2 - jitterAmount);
  }

  return Math.floor(delay);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Retry Strategies by Operation

```typescript
// config/retry-config.ts

export const RetryConfig = {
  // Question generation
  questionGeneration: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    shouldRetry: (error: Error) => {
      // Retry on rate limit, timeout, and service errors
      return (
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503')
      );
    },
    onRetry: (attempt: number, error: Error) => {
      logger.warn('Retrying question generation', {
        attempt,
        error: error.message,
      });
    },
  },

  // Answer evaluation
  answerEvaluation: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 20000,
    backoffMultiplier: 2,
    jitter: true,
    shouldRetry: (error: Error) => {
      return (
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503')
      );
    },
  },

  // Report generation
  reportGeneration: {
    maxRetries: 3,
    initialDelay: 3000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    shouldRetry: (error: Error) => {
      return (
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503')
      );
    },
  },

  // Database operations
  database: {
    maxRetries: 2,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    shouldRetry: (error: Error) => {
      return (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('timeout') ||
        error.message.includes('lock')
      );
    },
  },

  // Speech-to-text
  speechToText: {
    maxRetries: 2,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false, // No jitter for STT
    shouldRetry: (error: Error) => {
      return (
        error.message.includes('network') ||
        error.message.includes('timeout')
      );
    },
  },
};
```

### Circuit Breaker

```typescript
// utils/circuit-breaker.ts

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;  // Failures before opening
  successThreshold: number;   // Successes to close from half-open
  timeout: number;            // Time before attempting half-open (ms)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttempt: number = Date.now();
  private readonly services: Map<string, CircuitState> = new Map();

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * Check if circuit is open for a service
   */
  isOpen(service: string): boolean {
    const state = this.services.get(service) || CircuitState.CLOSED;

    if (state === CircuitState.OPEN) {
      // Check if timeout has elapsed
      if (Date.now() >= this.nextAttempt) {
        this.services.set(service, CircuitState.HALF_OPEN);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record a failure
   */
  recordFailure(service: string): void {
    const state = this.services.get(service) || CircuitState.CLOSED;

    if (state === CircuitState.HALF_OPEN) {
      // Failed during recovery attempt
      this.services.set(service, CircuitState.OPEN);
      this.nextAttempt = Date.now() + this.config.timeout;
      this.failureCount = 0;
      console.warn(`Circuit breaker OPENED for ${service}`);
    } else if (state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.services.set(service, CircuitState.OPEN);
        this.nextAttempt = Date.now() + this.config.timeout;
        this.failureCount = 0;
        console.warn(`Circuit breaker OPENED for ${service}`);
      }
    }
  }

  /**
   * Record a success
   */
  recordSuccess(service: string): void {
    const state = this.services.get(service) || CircuitState.CLOSED;

    if (state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.services.set(service, CircuitState.CLOSED);
        this.successCount = 0;
        console.info(`Circuit breaker CLOSED for ${service}`);
      }
    } else if (state === CircuitState.CLOSED) {
      this.failureCount = 0; // Reset failure count
    }
  }

  /**
   * Get current state
   */
  getState(service: string): CircuitState {
    return this.services.get(service) || CircuitState.CLOSED;
  }

  /**
   * Manually reset circuit
   */
  reset(service: string): void {
    this.services.set(service, CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    console.info(`Circuit breaker manually RESET for ${service}`);
  }
}

// Global circuit breaker instance
export const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // Open after 5 failures
  successThreshold: 2,    // Close after 2 successes
  timeout: 60000,         // Attempt recovery after 1 minute
});
```

Continue to Part 3...
