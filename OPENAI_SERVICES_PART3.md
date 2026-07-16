# OpenAI Services - Part 3: Error Handling, Retry Logic & Cost Optimization

## Error Handling

### Error Types and Handling

```typescript
// src/utils/error-handler.ts

import { OpenAIServiceError, OpenAIErrorType } from '../interfaces/openai.interface';
import { Logger } from './logger';

export class ErrorHandler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ErrorHandler');
  }

  /**
   * Handle OpenAI service errors
   */
  handleError(error: OpenAIServiceError): {
    shouldRetry: boolean;
    userMessage: string;
    logLevel: 'error' | 'warn' | 'info';
  } {
    switch (error.type) {
      case OpenAIErrorType.RATE_LIMIT:
        return {
          shouldRetry: true,
          userMessage:
            'Service is experiencing high load. Please try again in a moment.',
          logLevel: 'warn',
        };

      case OpenAIErrorType.TIMEOUT:
        return {
          shouldRetry: true,
          userMessage: 'Request timed out. Please try again.',
          logLevel: 'warn',
        };

      case OpenAIErrorType.API_ERROR:
        return {
          shouldRetry: true,
          userMessage: 'Temporary service issue. Please try again.',
          logLevel: 'error',
        };

      case OpenAIErrorType.AUTHENTICATION:
        return {
          shouldRetry: false,
          userMessage: 'Authentication failed. Please contact support.',
          logLevel: 'error',
        };

      case OpenAIErrorType.CONTEXT_LENGTH:
        return {
          shouldRetry: false,
          userMessage:
            'Content too long. Please provide a shorter response.',
          logLevel: 'warn',
        };

      case OpenAIErrorType.INVALID_REQUEST:
        return {
          shouldRetry: false,
          userMessage: 'Invalid request. Please check your input.',
          logLevel: 'warn',
        };

      case OpenAIErrorType.PARSING_ERROR:
        return {
          shouldRetry: false,
          userMessage: 'Failed to process response. Please try again.',
          logLevel: 'error',
        };

      default:
        return {
          shouldRetry: false,
          userMessage: 'An unexpected error occurred. Please try again.',
          logLevel: 'error',
        };
    }
  }

  /**
   * Log error with context
   */
  logError(error: OpenAIServiceError, context?: Record<string, any>) {
    const errorInfo = this.handleError(error);

    this.logger[errorInfo.logLevel]('OpenAI Service Error', {
      type: error.type,
      message: error.message,
      retryable: error.retryable,
      context,
      stack: error.stack,
    });
  }
}
```

### Error Recovery Strategies

```typescript
// src/services/openai/error-recovery.service.ts

import { injectable } from 'tsyringe';
import { OpenAIServiceError, OpenAIErrorType } from '../../interfaces/openai.interface';

@injectable()
export class ErrorRecoveryService {
  /**
   * Attempt to recover from context length errors
   */
  async handleContextLengthError<T>(
    originalRequest: () => Promise<T>,
    reduceContextFn: () => void
  ): Promise<T> {
    // Reduce context size
    reduceContextFn();

    // Retry with reduced context
    try {
      return await originalRequest();
    } catch (error) {
      throw new OpenAIServiceError(
        OpenAIErrorType.CONTEXT_LENGTH,
        'Unable to reduce context enough to fit within limits',
        error,
        false
      );
    }
  }

  /**
   * Fallback to cheaper model on repeated failures
   */
  async fallbackToCheaperModel<T>(
    gpt4Request: () => Promise<T>,
    gpt35Request: () => Promise<T>
  ): Promise<T> {
    try {
      return await gpt4Request();
    } catch (error) {
      // If GPT-4 fails, fallback to GPT-3.5
      if (error instanceof OpenAIServiceError && error.retryable) {
        console.warn('Falling back to GPT-3.5-turbo due to GPT-4 failure');
        return await gpt35Request();
      }
      throw error;
    }
  }

  /**
   * Circuit breaker pattern
   */
  private failureCount: Map<string, number> = new Map();
  private circuitOpen: Map<string, boolean> = new Map();
  private readonly FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_TIMEOUT = 60000; // 1 minute

  async executeWithCircuitBreaker<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if circuit is open
    if (this.circuitOpen.get(key)) {
      throw new OpenAIServiceError(
        OpenAIErrorType.API_ERROR,
        'Circuit breaker open. Service temporarily unavailable.',
        null,
        true
      );
    }

    try {
      const result = await operation();

      // Reset failure count on success
      this.failureCount.set(key, 0);

      return result;
    } catch (error) {
      // Increment failure count
      const failures = (this.failureCount.get(key) || 0) + 1;
      this.failureCount.set(key, failures);

      // Open circuit if threshold reached
      if (failures >= this.FAILURE_THRESHOLD) {
        this.circuitOpen.set(key, true);

        // Close circuit after timeout
        setTimeout(() => {
          this.circuitOpen.set(key, false);
          this.failureCount.set(key, 0);
        }, this.CIRCUIT_TIMEOUT);
      }

      throw error;
    }
  }
}
```

---

## Retry Logic

### Exponential Backoff with Jitter

```typescript
// src/utils/retry.ts

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export class RetryManager {
  private readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
  };

  /**
   * Execute operation with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.DEFAULT_CONFIG, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on last attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (error instanceof OpenAIServiceError && !error.retryable) {
          throw error;
        }

        // Calculate delay
        const delay = this.calculateDelay(
          attempt,
          retryConfig.initialDelay,
          retryConfig.maxDelay,
          retryConfig.backoffMultiplier,
          retryConfig.jitter
        );

        console.log(
          `Retry attempt ${attempt + 1}/${retryConfig.maxRetries} after ${delay}ms`
        );

        // Wait before retry
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Calculate exponential backoff delay with optional jitter
   */
  private calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    multiplier: number,
    jitter: boolean
  ): number {
    // Calculate exponential backoff
    let delay = Math.min(initialDelay * Math.pow(multiplier, attempt), maxDelay);

    // Add jitter to avoid thundering herd
    if (jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### Retry Strategies by Error Type

```typescript
// src/services/openai/retry-strategy.service.ts

import { injectable } from 'tsyringe';
import { RetryManager, RetryConfig } from '../../utils/retry';
import { OpenAIServiceError, OpenAIErrorType } from '../../interfaces/openai.interface';

@injectable()
export class RetryStrategyService {
  private retryManager: RetryManager;

  constructor() {
    this.retryManager = new RetryManager();
  }

  /**
   * Get retry configuration based on error type
   */
  getRetryConfig(errorType: OpenAIErrorType): RetryConfig {
    switch (errorType) {
      case OpenAIErrorType.RATE_LIMIT:
        return {
          maxRetries: 5,
          initialDelay: 5000, // Start with 5 seconds
          maxDelay: 60000, // Max 1 minute
          backoffMultiplier: 2,
          jitter: true,
        };

      case OpenAIErrorType.TIMEOUT:
        return {
          maxRetries: 3,
          initialDelay: 2000,
          maxDelay: 10000,
          backoffMultiplier: 2,
          jitter: true,
        };

      case OpenAIErrorType.API_ERROR:
        return {
          maxRetries: 3,
          initialDelay: 1000,
          maxDelay: 8000,
          backoffMultiplier: 2,
          jitter: true,
        };

      default:
        return {
          maxRetries: 0, // Don't retry
          initialDelay: 0,
          maxDelay: 0,
          backoffMultiplier: 1,
          jitter: false,
        };
    }
  }

  /**
   * Execute with adaptive retry
   */
  async executeWithAdaptiveRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof OpenAIServiceError) {
        const retryConfig = this.getRetryConfig(error.type);
        return this.retryManager.executeWithRetry(operation, retryConfig);
      }
      throw error;
    }
  }
}
```

---

## Cost Optimization Strategies

### 1. Model Selection Strategy

```typescript
// src/services/openai/model-selection.service.ts

import { injectable } from 'tsyringe';
import {
  InterviewTopic,
  DifficultyLevel,
  ModelConfig,
} from '../../interfaces/openai.interface';

@injectable()
export class ModelSelectionService {
  /**
   * Select optimal model for question generation
   */
  selectQuestionGenerationModel(
    difficulty: DifficultyLevel
  ): ModelConfig {
    // Use GPT-3.5 for questions (much cheaper)
    return {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 500,
    };
  }

  /**
   * Select optimal model for evaluation
   */
  selectEvaluationModel(
    difficulty: DifficultyLevel,
    topic: InterviewTopic
  ): ModelConfig {
    // Use GPT-4 for accurate evaluation
    // For simple topics/difficulty, could use GPT-3.5
    if (
      difficulty === 'Beginner' &&
      ['NodeJS', 'React', 'Angular'].includes(topic)
    ) {
      return {
        model: 'gpt-3.5-turbo',
        temperature: 0.3,
        maxTokens: 1000,
      };
    }

    return {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 1500,
    };
  }

  /**
   * Select optimal model for report generation
   */
  selectReportModel(quickSummary: boolean = false): ModelConfig {
    if (quickSummary) {
      // Use GPT-3.5 for quick summaries
      return {
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 500,
      };
    }

    // Use GPT-4 for comprehensive reports
    return {
      model: 'gpt-4',
      temperature: 0.5,
      maxTokens: 2000,
    };
  }
}
```

### 2. Response Caching

```typescript
// src/services/openai/cache.service.ts

import { injectable } from 'tsyringe';
import Redis from 'ioredis';
import { createHash } from 'crypto';

@injectable()
export class OpenAICacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL = 3600; // 1 hour

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(
    service: string,
    params: Record<string, any>
  ): string {
    const hash = createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `openai:${service}:${hash}`;
  }

  /**
   * Get cached response
   */
  async get<T>(service: string, params: Record<string, any>): Promise<T | null> {
    const key = this.generateCacheKey(service, params);
    const cached = await this.redis.get(key);

    if (cached) {
      return JSON.parse(cached);
    }

    return null;
  }

  /**
   * Cache response
   */
  async set<T>(
    service: string,
    params: Record<string, any>,
    response: T,
    ttl: number = this.DEFAULT_TTL
  ): Promise<void> {
    const key = this.generateCacheKey(service, params);
    await this.redis.setex(key, ttl, JSON.stringify(response));
  }

  /**
   * Cached API call wrapper
   */
  async cachedCall<T>(
    service: string,
    params: Record<string, any>,
    operation: () => Promise<T>,
    options: { ttl?: number; skipCache?: boolean } = {}
  ): Promise<{ data: T; cached: boolean }> {
    const { ttl = this.DEFAULT_TTL, skipCache = false } = options;

    // Check cache
    if (!skipCache) {
      const cached = await this.get<T>(service, params);
      if (cached) {
        return { data: cached, cached: true };
      }
    }

    // Execute operation
    const data = await operation();

    // Cache result
    await this.set(service, params, data, ttl);

    return { data, cached: false };
  }

  /**
   * Invalidate cache
   */
  async invalidate(service: string, params: Record<string, any>): Promise<void> {
    const key = this.generateCacheKey(service, params);
    await this.redis.del(key);
  }

  /**
   * Clear all cache for a service
   */
  async clearService(service: string): Promise<void> {
    const pattern = `openai:${service}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### 3. Token Optimization

```typescript
// src/services/openai/token-optimizer.service.ts

import { injectable } from 'tsyringe';

@injectable()
export class TokenOptimizerService {
  /**
   * Truncate text to fit within token limit
   * Rule of thumb: 1 token ≈ 4 characters
   */
  truncateText(
    text: string,
    maxTokens: number,
    preserveEnd: boolean = false
  ): string {
    const maxChars = maxTokens * 4;

    if (text.length <= maxChars) {
      return text;
    }

    if (preserveEnd) {
      return '...' + text.slice(-(maxChars - 3));
    }

    return text.slice(0, maxChars - 3) + '...';
  }

  /**
   * Optimize prompt by removing unnecessary whitespace
   */
  optimizePrompt(prompt: string): string {
    return prompt
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();
  }

  /**
   * Summarize long content before sending to API
   */
  summarizeContent(
    content: string,
    maxLength: number = 1000
  ): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Take first and last portions
    const half = Math.floor(maxLength / 2) - 10;
    return (
      content.slice(0, half) +
      '\n... [content truncated] ...\n' +
      content.slice(-half)
    );
  }

  /**
   * Estimate token count (approximate)
   */
  estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text fits within token limit
   */
  fitsWithinLimit(text: string, maxTokens: number): boolean {
    return this.estimateTokens(text) <= maxTokens;
  }
}
```

### 4. Batch Processing

```typescript
// src/services/openai/batch-processor.service.ts

import { injectable, inject } from 'tsyringe';
import { EvaluationService } from './evaluation.service';
import { EvaluateAnswerRequest, AnswerEvaluation } from '../../interfaces/openai.interface';

@injectable()
export class BatchProcessorService {
  constructor(
    @inject(EvaluationService) private evaluationService: EvaluationService
  ) {}

  /**
   * Process evaluations in batches with rate limiting
   */
  async batchEvaluate(
    requests: EvaluateAnswerRequest[],
    options: {
      batchSize?: number;
      delayBetweenBatches?: number;
      parallel?: boolean;
    } = {}
  ): Promise<AnswerEvaluation[]> {
    const {
      batchSize = 5,
      delayBetweenBatches = 1000,
      parallel = true,
    } = options;

    const results: AnswerEvaluation[] = [];

    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);

      if (parallel) {
        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map((req) =>
            this.evaluationService
              .evaluateAnswer(req)
              .then((res) => res.data)
          )
        );
        results.push(...batchResults);
      } else {
        // Process batch sequentially
        for (const req of batch) {
          const result = await this.evaluationService.evaluateAnswer(req);
          results.push(result.data);
        }
      }

      // Delay between batches to avoid rate limits
      if (i + batchSize < requests.length) {
        await this.sleep(delayBetweenBatches);
      }
    }

    return results;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### 5. Cost Monitoring

```typescript
// src/services/openai/cost-monitor.service.ts

import { injectable } from 'tsyringe';
import { TokenUsage } from '../../interfaces/openai.interface';

interface CostAlert {
  threshold: number;
  triggered: boolean;
  callback: (cost: number) => void;
}

@injectable()
export class CostMonitorService {
  private totalCost: number = 0;
  private requestCount: number = 0;
  private costByService: Map<string, number> = new Map();
  private costAlerts: CostAlert[] = [];

  /**
   * Track usage
   */
  trackUsage(service: string, usage: TokenUsage): void {
    this.totalCost += usage.estimatedCost;
    this.requestCount++;

    const serviceCost = this.costByService.get(service) || 0;
    this.costByService.set(service, serviceCost + usage.estimatedCost);

    // Check alerts
    this.checkAlerts();
  }

  /**
   * Add cost alert
   */
  addAlert(threshold: number, callback: (cost: number) => void): void {
    this.costAlerts.push({
      threshold,
      triggered: false,
      callback,
    });
  }

  /**
   * Check if any alerts should be triggered
   */
  private checkAlerts(): void {
    this.costAlerts.forEach((alert) => {
      if (!alert.triggered && this.totalCost >= alert.threshold) {
        alert.triggered = true;
        alert.callback(this.totalCost);
      }
    });
  }

  /**
   * Get cost statistics
   */
  getCostStats() {
    return {
      totalCost: Number(this.totalCost.toFixed(2)),
      requestCount: this.requestCount,
      averageCostPerRequest:
        this.requestCount > 0
          ? Number((this.totalCost / this.requestCount).toFixed(4))
          : 0,
      costByService: Object.fromEntries(this.costByService),
    };
  }

  /**
   * Get projected monthly cost
   */
  getProjectedMonthlyCost(daysElapsed: number): number {
    if (daysElapsed === 0) return 0;
    const dailyAverage = this.totalCost / daysElapsed;
    return Number((dailyAverage * 30).toFixed(2));
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.totalCost = 0;
    this.requestCount = 0;
    this.costByService.clear();
    this.costAlerts.forEach((alert) => (alert.triggered = false));
  }
}
```

---

## Best Practices

### 1. Service Configuration

```typescript
// src/config/openai.config.ts

export const OpenAIConfig = {
  // Model selection
  models: {
    questionGeneration: 'gpt-3.5-turbo',
    evaluation: 'gpt-4',
    report: 'gpt-4',
    followUp: 'gpt-3.5-turbo',
  },

  // Temperature settings
  temperature: {
    creative: 0.8, // For question generation
    balanced: 0.5, // For reports
    deterministic: 0.3, // For evaluation
  },

  // Token limits
  maxTokens: {
    question: 500,
    evaluation: 1500,
    report: 2000,
    followUp: 300,
  },

  // Retry configuration
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
  },

  // Cost limits
  costLimits: {
    perRequest: 0.50, // Alert if single request > $0.50
    daily: 50.0, // Alert if daily cost > $50
    monthly: 1000.0, // Alert if projected monthly > $1000
  },

  // Cache configuration
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
    services: ['questionGeneration'], // Cache questions
  },

  // Rate limiting
  rateLimit: {
    requestsPerMinute: 60,
    requestsPerHour: 3000,
  },
};
```

### 2. Monitoring and Logging

```typescript
// src/utils/logger.ts

export class Logger {
  constructor(private context: string) {}

  info(message: string, metadata?: Record<string, any>) {
    console.log(
      JSON.stringify({
        level: 'info',
        context: this.context,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      })
    );
  }

  warn(message: string, metadata?: Record<string, any>) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        context: this.context,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      })
    );
  }

  error(message: string, metadata?: Record<string, any>) {
    console.error(
      JSON.stringify({
        level: 'error',
        context: this.context,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      })
    );
  }
}
```

### 3. Testing Strategy

```typescript
// src/services/openai/__tests__/question-generation.service.test.ts

import { QuestionGenerationService } from '../question-generation.service';
import { OpenAIClient } from '../openai-client';
import { PromptTemplateService } from '../prompt-template.service';

describe('QuestionGenerationService', () => {
  let service: QuestionGenerationService;
  let mockOpenAIClient: jest.Mocked<OpenAIClient>;
  let mockPromptTemplate: jest.Mocked<PromptTemplateService>;

  beforeEach(() => {
    mockOpenAIClient = {
      callWithRetry: jest.fn(),
    } as any;

    mockPromptTemplate = {
      getQuestionPrompt: jest.fn(),
    } as any;

    service = new QuestionGenerationService(
      mockOpenAIClient,
      mockPromptTemplate
    );
  });

  describe('generateQuestion', () => {
    it('should generate question successfully', async () => {
      const mockResponse = {
        data: {
          questionText: 'Explain event loop in Node.js',
          category: 'Core Concepts',
          difficulty: 'medium',
          expectedKeywords: ['event loop', 'callback queue'],
          estimatedTime: 180,
        },
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          estimatedCost: 0.002,
        },
        model: 'gpt-3.5-turbo',
      };

      mockOpenAIClient.callWithRetry.mockResolvedValue(mockResponse);

      const result = await service.generateQuestion({
        topic: 'NodeJS',
        difficulty: 'Intermediate',
        experienceYears: 3,
        interviewType: 'technical',
      });

      expect(result.data.questionText).toBe('Explain event loop in Node.js');
      expect(result.usage.estimatedCost).toBe(0.002);
    });
  });
});
```

---

## Cost Optimization Summary

### Estimated Costs per Interview

| Service | Model | Avg Tokens | Cost | Frequency |
|---------|-------|-----------|------|-----------|
| **Question Generation** | GPT-3.5 | 300 | $0.0005 | 10x per interview |
| **Follow-up Questions** | GPT-3.5 | 200 | $0.0003 | 3x per interview |
| **Answer Evaluation** | GPT-4 | 800 | $0.05 | 10x per interview |
| **Final Report** | GPT-4 | 1200 | $0.08 | 1x per interview |

**Total Cost per Interview**: ~$0.60

### Cost Reduction Strategies

1. **Use GPT-3.5 for Questions** → Save 95% on question generation
2. **Cache Common Questions** → Reduce API calls by 30-40%
3. **Batch Evaluations** → Optimize rate limits
4. **Quick Summary Mode** → GPT-3.5 for brief reports (save 90%)
5. **Token Optimization** → Reduce by 15-20%

**Optimized Cost per Interview**: ~$0.45 (25% savings)

---

Continue to summary document...
