# Backend Implementation Guidelines

## Document Purpose

This document provides detailed guidelines for implementing the AI Voice Interview Coach backend architecture. It covers coding standards, best practices, patterns, and step-by-step implementation strategies.

---

## Table of Contents

1. [Project Setup](#project-setup)
2. [Code Organization](#code-organization)
3. [TypeScript Guidelines](#typescript-guidelines)
4. [Naming Conventions](#naming-conventions)
5. [Design Patterns](#design-patterns)
6. [Error Handling Patterns](#error-handling-patterns)
7. [Testing Strategy](#testing-strategy)
8. [Performance Optimization](#performance-optimization)
9. [Security Best Practices](#security-best-practices)
10. [Code Review Checklist](#code-review-checklist)
11. [Implementation Phases](#implementation-phases)

---

## Project Setup

### Initial Setup Steps

```bash
# 1. Initialize project
mkdir backend
cd backend
npm init -y

# 2. Install TypeScript
npm install -D typescript @types/node ts-node nodemon

# 3. Install core dependencies
npm install express dotenv

# 4. Install type definitions
npm install -D @types/express

# 5. Install SQLite
npm install sqlite3 @types/sqlite3

# 6. Install OpenAI
npm install openai

# 7. Install DI container
npm install tsyringe reflect-metadata

# 8. Install validation
npm install zod

# 9. Install middleware
npm install cors helmet morgan compression
npm install -D @types/cors @types/morgan

# 10. Install utilities
npm install uuid winston
npm install -D @types/uuid

# 11. Install testing
npm install -D jest @types/jest ts-jest supertest @types/supertest

# 12. Install linting
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install -D prettier eslint-config-prettier

# 13. Initialize TypeScript config
npx tsc --init
```

### Directory Structure Creation

```bash
mkdir -p src/{controllers,routes,services,repositories,models,interfaces,types,middleware,validators,config,database,prompts,utils,di}
mkdir -p src/interfaces/{repositories,services,common}
mkdir -p src/types/{dtos,enums}
mkdir -p src/database/{migrations,seeds}
mkdir -p src/routes/v1
mkdir -p tests/{unit,integration,e2e}
```

### Configuration Files

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**.eslintrc.js**:
```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'warn'
  }
}
```

**.prettierrc**:
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

---

## Code Organization

### File Structure Principles

1. **One class/interface per file**
2. **Named exports over default exports**
3. **Group related functionality**
4. **Keep files under 300 lines**
5. **Use barrel exports (index.ts)**

### Barrel Exports Pattern

```typescript
// interfaces/repositories/index.ts
export * from './IInterviewRepository';
export * from './IQuestionRepository';
export * from './IAnswerRepository';
export * from './IEvaluationRepository';

// Usage
import { IInterviewRepository, IQuestionRepository } from '@/interfaces/repositories';
```

### Import Order Convention

```typescript
// 1. Node.js built-in modules
import { readFile } from 'fs/promises';

// 2. External dependencies
import express from 'express';
import { injectable, inject } from 'tsyringe';

// 3. Internal modules (absolute paths)
import { IInterviewService } from '@/interfaces/services';
import { Interview } from '@/models/interview.model';
import { CreateInterviewDTO } from '@/types/dtos';

// 4. Utilities and helpers
import { logger } from '@/utils/logger.util';
import { AppError } from '@/utils/error.util';
```

---

## TypeScript Guidelines

### Type Safety Rules

1. **Never use `any`** - Use `unknown` if type is truly unknown
2. **Enable `strict` mode** in tsconfig.json
3. **Explicitly type function returns**
4. **Use interfaces for object shapes**
5. **Use type aliases for unions/intersections**
6. **Avoid type assertions (`as`)** - Use type guards instead

### Interface vs Type Alias

**Use Interfaces for:**
- Object shapes
- Class contracts
- Extensible definitions

```typescript
interface Interview {
  id: string;
  topic: Topic;
  difficulty: Difficulty;
}

interface IInterviewRepository {
  findById(id: string): Promise<Interview | null>;
  create(data: Partial<Interview>): Promise<Interview>;
}
```

**Use Type Aliases for:**
- Unions
- Intersections
- Utility types

```typescript
type Topic = 'NodeJS' | 'React' | 'SystemDesign';
type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
type Result<T> = Success<T> | Failure;
```

### Generic Typing Patterns

```typescript
// Repository base interface with generics
interface IBaseRepository<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: QueryFilter): Promise<T[]>;
  create(data: CreateDTO): Promise<T>;
  update(id: string, data: UpdateDTO): Promise<T>;
  delete(id: string): Promise<boolean>;
}

// Usage
interface IInterviewRepository extends IBaseRepository<
  Interview,
  CreateInterviewDTO,
  UpdateInterviewDTO
> {
  // Additional methods specific to Interview
  findByUserId(userId: string): Promise<Interview[]>;
}
```

### Utility Types Usage

```typescript
// Partial - Make all properties optional
type UpdateInterviewDTO = Partial<CreateInterviewDTO>;

// Required - Make all properties required
type RequiredInterview = Required<Interview>;

// Pick - Select specific properties
type InterviewBasicInfo = Pick<Interview, 'id' | 'topic' | 'status'>;

// Omit - Exclude specific properties
type InterviewWithoutId = Omit<Interview, 'id'>;

// Record - Create object type with keys
type InterviewsByTopic = Record<Topic, Interview[]>;

// ReturnType - Extract return type
type ServiceResult = ReturnType<typeof interviewService.createInterview>;
```

### Type Guards

```typescript
// Type predicate
function isInterview(obj: unknown): obj is Interview {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'topic' in obj &&
    'difficulty' in obj
  );
}

// Usage
if (isInterview(data)) {
  // TypeScript knows data is Interview here
  console.log(data.topic);
}

// Discriminated unions
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: ErrorDetail };

function handleResponse<T>(response: ApiResponse<T>): T {
  if (response.success) {
    return response.data; // Type narrowed to success case
  } else {
    throw new Error(response.error.message); // Type narrowed to error case
  }
}
```

---

## Naming Conventions

### General Rules

| Category | Convention | Example |
|----------|-----------|---------|
| Classes | PascalCase | `InterviewService` |
| Interfaces | I + PascalCase | `IInterviewRepository` |
| Types | PascalCase | `CreateInterviewDTO` |
| Enums | PascalCase | `InterviewStatus` |
| Variables | camelCase | `interviewData` |
| Constants | UPPER_SNAKE_CASE | `MAX_QUESTIONS` |
| Functions | camelCase | `createInterview()` |
| Private fields | _camelCase | `_cache` |
| Files (classes) | PascalCase.type.ts | `Interview.model.ts` |
| Files (utils) | kebab-case.util.ts | `date-formatter.util.ts` |

### File Naming Patterns

```
Model: Interview.model.ts
Interface: IInterviewRepository.ts
Repository: InterviewRepository.ts
Service: InterviewService.ts
Controller: InterviewController.ts
DTO: CreateInterviewDTO.ts
Middleware: auth.middleware.ts
Validator: interview.validator.ts
Utility: logger.util.ts
Route: interview.routes.ts
```

### Method Naming Patterns

```typescript
// CRUD Operations
findById()
findAll()
findOne()
create()
update()
delete()

// Query operations
getById()
getAll()
getByStatus()
countBy()
exists()

// Business operations
generateQuestion()
evaluateAnswer()
calculateScore()
sendNotification()

// Boolean checks
isValid()
canGenerate()
hasPermission()
```

---

## Design Patterns

### 1. Repository Pattern Implementation

```typescript
// Base repository interface
interface IBaseRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(filter?: QueryFilter): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

// Abstract base implementation
abstract class BaseRepository<T> implements IBaseRepository<T> {
  constructor(
    protected tableName: string,
    protected db: IDatabaseConnection
  ) {}

  async findById(id: string): Promise<T | null> {
    // Common implementation
  }

  async findAll(filter?: QueryFilter): Promise<T[]> {
    // Common implementation
  }

  // Abstract methods for specific repositories
  abstract mapToModel(row: any): T;
  abstract mapToRow(model: T): any;
}

// Concrete repository
class InterviewRepository extends BaseRepository<Interview> 
  implements IInterviewRepository {
  
  constructor(db: IDatabaseConnection) {
    super('interviews', db);
  }

  mapToModel(row: any): Interview {
    // Mapping logic
  }

  mapToRow(model: Interview): any {
    // Mapping logic
  }

  // Additional methods
  async findByUserId(userId: string): Promise<Interview[]> {
    // Implementation
  }
}
```

### 2. Service Layer Pattern

```typescript
@injectable()
class InterviewService implements IInterviewService {
  constructor(
    @inject('IInterviewRepository') private repo: IInterviewRepository,
    @inject('IQuestionService') private questionService: IQuestionService,
    @inject('ICacheService') private cache: ICacheService,
    @inject('ILogger') private logger: ILogger
  ) {}

  async createInterview(dto: CreateInterviewDTO): Promise<InterviewResponseDTO> {
    // 1. Validate business rules
    this.validateBusinessRules(dto);

    // 2. Create entity
    const interview = await this.repo.create({
      ...dto,
      status: InterviewStatus.InProgress,
      createdAt: new Date(),
    });

    // 3. Log event
    this.logger.info('Interview created', { interviewId: interview.id });

    // 4. Cache (optional)
    await this.cache.set(`interview:${interview.id}`, interview, 300);

    // 5. Return DTO
    return this.mapToDTO(interview);
  }

  private validateBusinessRules(dto: CreateInterviewDTO): void {
    if (dto.numberOfQuestions > 50) {
      throw new ValidationError('Maximum 50 questions allowed');
    }
  }

  private mapToDTO(interview: Interview): InterviewResponseDTO {
    // Mapping logic
  }
}
```

### 3. Factory Pattern for Prompts

```typescript
class PromptFactory {
  static createQuestionPrompt(context: QuestionContext): string {
    const basePrompt = this.getBasePrompt();
    const topicPrompt = this.getTopicPrompt(context.topic);
    const difficultyPrompt = this.getDifficultyPrompt(context.difficulty);
    
    return `${basePrompt}\n\n${topicPrompt}\n\n${difficultyPrompt}`;
  }

  static createEvaluationPrompt(context: EvaluationContext): string {
    // Build evaluation prompt
  }

  private static getBasePrompt(): string {
    return `You are an expert technical interviewer...`;
  }

  private static getTopicPrompt(topic: Topic): string {
    const prompts: Record<Topic, string> = {
      NodeJS: 'Focus on Node.js concepts...',
      React: 'Focus on React concepts...',
      // ...
    };
    return prompts[topic];
  }
}
```

### 4. Strategy Pattern for Evaluation

```typescript
interface IEvaluationStrategy {
  evaluate(context: EvaluationContext): Promise<EvaluationResult>;
}

class TechnicalEvaluationStrategy implements IEvaluationStrategy {
  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    // Technical evaluation logic
  }
}

class LeadershipEvaluationStrategy implements IEvaluationStrategy {
  async evaluate(context: EvaluationContext): Promise<EvaluationResult> {
    // Leadership evaluation logic
  }
}

class EvaluationService {
  private strategies: Map<EvaluationType, IEvaluationStrategy>;

  constructor() {
    this.strategies = new Map([
      ['technical', new TechnicalEvaluationStrategy()],
      ['leadership', new LeadershipEvaluationStrategy()],
    ]);
  }

  async evaluate(type: EvaluationType, context: EvaluationContext): Promise<EvaluationResult> {
    const strategy = this.strategies.get(type);
    if (!strategy) throw new Error('Invalid evaluation type');
    return strategy.evaluate(context);
  }
}
```

### 5. Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime.getTime() > this.timeout;
  }
}

// Usage in OpenAI Service
class OpenAIService {
  private circuitBreaker = new CircuitBreaker(5, 60000);

  async generateQuestion(context: QuestionContext): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      // OpenAI API call
      return await this.callOpenAI(context);
    });
  }
}
```

### 6. Retry Pattern with Exponential Backoff

```typescript
class RetryPolicy {
  constructor(
    private maxAttempts: number = 3,
    private baseDelay: number = 1000,
    private maxDelay: number = 10000
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: any) => boolean = () => true
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === this.maxAttempts || !shouldRetry(error)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private calculateDelay(attempt: number): number {
    const delay = this.baseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## Error Handling Patterns

### Custom Error Classes

```typescript
// Base error class
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public isOperational: boolean = true,
    public details?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
class ValidationError extends AppError {
  constructor(message: string, details?: any[]) {
    super(message, 400, 'VALIDATION_ERROR', true, details);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource}${id ? ` with id ${id}` : ''} not found`,
      404,
      'NOT_FOUND'
    );
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(
      `${service} service error`,
      503,
      'EXTERNAL_SERVICE_ERROR',
      true,
      { originalError: originalError?.message }
    );
  }
}
```

### Error Handling in Services

```typescript
class InterviewService {
  async createInterview(dto: CreateInterviewDTO): Promise<InterviewResponseDTO> {
    try {
      // Validate input
      if (!dto.topic) {
        throw new ValidationError('Topic is required');
      }

      // Business logic
      const interview = await this.repo.create(dto);

      if (!interview) {
        throw new Error('Failed to create interview');
      }

      return this.mapToDTO(interview);
    } catch (error) {
      // Log error
      this.logger.error('Failed to create interview', error as Error, { dto });

      // Re-throw if it's an operational error
      if (error instanceof AppError) {
        throw error;
      }

      // Wrap unknown errors
      throw new AppError('Failed to create interview', 500, 'INTERNAL_ERROR', false);
    }
  }
}
```

### Global Error Handler Middleware

```typescript
function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log error
  logger.error('Error occurred', err, {
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      },
      metadata: {
        timestamp: new Date().toISOString(),
        requestId: req.id,
      },
    });
    return;
  }

  // Handle unknown errors
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' 
        ? err.message 
        : 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}
```

---

## Testing Strategy

### Unit Testing Pattern

```typescript
// interview.service.spec.ts
describe('InterviewService', () => {
  let service: InterviewService;
  let mockRepo: jest.Mocked<IInterviewRepository>;
  let mockLogger: jest.Mocked<ILogger>;

  beforeEach(() => {
    // Create mocks
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Create service with mocks
    service = new InterviewService(mockRepo, mockLogger);
  });

  describe('createInterview', () => {
    it('should create interview successfully', async () => {
      // Arrange
      const dto: CreateInterviewDTO = {
        userId: 'user-1',
        topic: 'NodeJS',
        difficulty: 'Intermediate',
        experience: 5,
        numberOfQuestions: 10,
      };

      const mockInterview: Interview = {
        id: 'interview-1',
        ...dto,
        status: 'InProgress',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.create.mockResolvedValue(mockInterview);

      // Act
      const result = await service.createInterview(dto);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe('interview-1');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining(dto)
      );
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid input', async () => {
      // Arrange
      const invalidDto = {
        // Missing required fields
      } as CreateInterviewDTO;

      // Act & Assert
      await expect(service.createInterview(invalidDto))
        .rejects
        .toThrow(ValidationError);
    });
  });
});
```

### Integration Testing Pattern

```typescript
// interview.integration.spec.ts
describe('Interview API Integration', () => {
  let app: Express;
  let db: IDatabaseConnection;

  beforeAll(async () => {
    // Setup test database
    db = await setupTestDatabase();
    app = createApp(db);
  });

  afterAll(async () => {
    // Cleanup
    await db.close();
  });

  describe('POST /api/v1/interviews', () => {
    it('should create interview', async () => {
      const response = await request(app)
        .post('/api/v1/interviews')
        .send({
          userId: 'user-1',
          topic: 'NodeJS',
          difficulty: 'Intermediate',
          experience: 5,
          numberOfQuestions: 10,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.topic).toBe('NodeJS');
    });
  });
});
```

---

## Performance Optimization

### Database Query Optimization

```typescript
// Bad: N+1 query problem
async getInterviewsWithQuestions(userId: string): Promise<any[]> {
  const interviews = await this.interviewRepo.findByUserId(userId);
  
  // N queries (one for each interview)
  for (const interview of interviews) {
    interview.questions = await this.questionRepo.findByInterviewId(interview.id);
  }
  
  return interviews;
}

// Good: Single query with JOIN
async getInterviewsWithQuestions(userId: string): Promise<any[]> {
  return this.db.query(`
    SELECT 
      i.*,
      q.*
    FROM interviews i
    LEFT JOIN questions q ON q.interviewId = i.id
    WHERE i.userId = ?
  `, [userId]);
}
```

### Caching Strategy

```typescript
class CacheService {
  private cache = new Map<string, { data: any; expiry: number }>();

  async get<T>(key: string): Promise<T | null> {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    this.cache.set(key, {
      data: value,
      expiry: Date.now() + (ttlSeconds * 1000),
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

// Usage with cache-aside pattern
class InterviewService {
  async getInterview(id: string): Promise<InterviewResponseDTO> {
    // Try cache first
    const cacheKey = `interview:${id}`;
    const cached = await this.cache.get<Interview>(cacheKey);
    
    if (cached) {
      return this.mapToDTO(cached);
    }
    
    // Fetch from database
    const interview = await this.repo.findById(id);
    
    if (!interview) {
      throw new NotFoundError('Interview', id);
    }
    
    // Cache for 5 minutes
    await this.cache.set(cacheKey, interview, 300);
    
    return this.mapToDTO(interview);
  }
}
```

---

## Security Best Practices

### Input Validation

```typescript
// Always validate and sanitize input
import { z } from 'zod';

const createInterviewSchema = z.object({
  userId: z.string().uuid(),
  topic: z.enum(['NodeJS', 'React', 'SystemDesign']),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  experience: z.number().int().min(0).max(50),
  numberOfQuestions: z.number().int().min(1).max(50),
  jobDescription: z.string().max(5000).optional(),
});

function validateRequest(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        });
      } else {
        next(error);
      }
    }
  };
}
```

### SQL Injection Prevention

```typescript
// Always use parameterized queries
class BaseRepository {
  // Bad - vulnerable to SQL injection
  async findByNameBad(name: string): Promise<any> {
    return this.db.query(`SELECT * FROM ${this.tableName} WHERE name = '${name}'`);
  }

  // Good - parameterized query
  async findByName(name: string): Promise<any> {
    return this.db.query(
      `SELECT * FROM ${this.tableName} WHERE name = ?`,
      [name]
    );
  }
}
```

---

## Code Review Checklist

### Before Submitting PR

- [ ] Code follows TypeScript strict mode
- [ ] All functions have return type annotations
- [ ] No `any` types used
- [ ] Error handling implemented
- [ ] Input validation added
- [ ] Unit tests written
- [ ] Integration tests added (if applicable)
- [ ] Code formatted with Prettier
- [ ] No ESLint errors
- [ ] Documentation updated
- [ ] Logging added for important operations
- [ ] Security considerations addressed
- [ ] Performance implications considered
- [ ] Database migrations created (if needed)

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Setup project structure
- Configure TypeScript, ESLint, Prettier
- Setup database connection
- Create base interfaces and types
- Implement logger utility
- Setup DI container

### Phase 2: Data Layer (Week 2)
- Create database schema
- Implement base repository
- Implement all repositories
- Write repository tests
- Create database migrations

### Phase 3: Business Logic (Week 3)
- Implement services layer
- Add business logic validation
- Integrate OpenAI service
- Write service tests
- Add caching layer

### Phase 4: API Layer (Week 4)
- Implement controllers
- Create routes
- Add middleware
- Implement validation
- Write API tests

### Phase 5: Integration & Testing (Week 5)
- Integration testing
- E2E testing
- Performance testing
- Security testing
- Bug fixes

### Phase 6: Documentation & Deployment (Week 6)
- API documentation (Swagger)
- Deployment guide
- Monitoring setup
- Production deployment

---

This implementation guide provides the foundation for building a production-ready backend following clean architecture principles and best practices.

