# AI Voice Interview Coach - Backend Architecture Document

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [Layer Responsibilities](#layer-responsibilities)
4. [Architectural Patterns](#architectural-patterns)
5. [API Layer Design](#api-layer-design)
6. [Service Layer Design](#service-layer-design)
7. [Repository Pattern](#repository-pattern)
8. [TypeScript Interfaces](#typescript-interfaces)
9. [Dependency Injection](#dependency-injection)
10. [Error Handling Strategy](#error-handling-strategy)
11. [Request Validation](#request-validation)
12. [Logging Strategy](#logging-strategy)
13. [Environment Configuration](#environment-configuration)
14. [API Versioning](#api-versioning)
15. [Scalability Best Practices](#scalability-best-practices)
16. [Security Considerations](#security-considerations)

---

## Architecture Overview

### Design Philosophy
This architecture follows **Clean Architecture** principles with clear separation of concerns:
- **Presentation Layer** (Controllers, Routes, Middleware)
- **Business Logic Layer** (Services)
- **Data Access Layer** (Repositories)
- **Domain Layer** (Models, Interfaces, Types)

### Key Principles
1. **Dependency Inversion**: High-level modules don't depend on low-level modules
2. **Single Responsibility**: Each component has one clear purpose
3. **Open/Closed**: Open for extension, closed for modification
4. **Interface Segregation**: Specific interfaces over general ones
5. **Dependency Injection**: Loose coupling through constructor injection

---

## Folder Structure

```
backend/
├── src/
│   ├── controllers/              # Request/Response handling
│   │   ├── interview.controller.ts
│   │   ├── question.controller.ts
│   │   ├── answer.controller.ts
│   │   ├── evaluation.controller.ts
│   │   └── report.controller.ts
│   │
│   ├── routes/                   # API endpoint definitions
│   │   ├── v1/
│   │   │   ├── interview.routes.ts
│   │   │   ├── question.routes.ts
│   │   │   ├── answer.routes.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── services/                 # Business logic
│   │   ├── interview.service.ts
│   │   ├── question.service.ts
│   │   ├── answer.service.ts
│   │   ├── evaluation.service.ts
│   │   ├── report.service.ts
│   │   ├── openai.service.ts
│   │   └── cache.service.ts
│   │
│   ├── repositories/             # Data access layer
│   │   ├── interview.repository.ts
│   │   ├── question.repository.ts
│   │   ├── answer.repository.ts
│   │   ├── evaluation.repository.ts
│   │   └── base.repository.ts
│   │
│   ├── models/                   # Domain models
│   │   ├── interview.model.ts
│   │   ├── question.model.ts
│   │   ├── answer.model.ts
│   │   ├── evaluation.model.ts
│   │   └── user.model.ts
│   │
│   ├── interfaces/               # Contract definitions
│   │   ├── repositories/
│   │   │   ├── IInterviewRepository.ts
│   │   │   ├── IQuestionRepository.ts
│   │   │   ├── IAnswerRepository.ts
│   │   │   └── IEvaluationRepository.ts
│   │   ├── services/
│   │   │   ├── IInterviewService.ts
│   │   │   ├── IQuestionService.ts
│   │   │   ├── IOpenAIService.ts
│   │   │   └── ICacheService.ts
│   │   └── common/
│   │       ├── IBaseRepository.ts
│   │       └── ILogger.ts
│   │
│   ├── types/                    # Type definitions & DTOs
│   │   ├── dtos/
│   │   │   ├── interview.dto.ts
│   │   │   ├── question.dto.ts
│   │   │   ├── answer.dto.ts
│   │   │   └── evaluation.dto.ts
│   │   ├── enums/
│   │   │   ├── difficulty.enum.ts
│   │   │   ├── topic.enum.ts
│   │   │   └── status.enum.ts
│   │   ├── api-response.type.ts
│   │   └── pagination.type.ts
│   │
│   ├── middleware/               # Request processing
│   │   ├── error-handler.middleware.ts
│   │   ├── validation.middleware.ts
│   │   ├── logger.middleware.ts
│   │   ├── rate-limiter.middleware.ts
│   │   ├── authentication.middleware.ts
│   │   └── cors.middleware.ts
│   │
│   ├── validators/               # Request validation schemas
│   │   ├── interview.validator.ts
│   │   ├── question.validator.ts
│   │   ├── answer.validator.ts
│   │   └── common.validator.ts
│   │
│   ├── config/                   # Configuration
│   │   ├── database.config.ts
│   │   ├── openai.config.ts
│   │   ├── app.config.ts
│   │   ├── logger.config.ts
│   │   └── constants.ts
│   │
│   ├── database/                 # Database setup & migrations
│   │   ├── connection.ts
│   │   ├── migrations/
│   │   │   ├── 001_create_interviews.sql
│   │   │   ├── 002_create_questions.sql
│   │   │   ├── 003_create_answers.sql
│   │   │   └── 004_create_evaluations.sql
│   │   ├── seeds/
│   │   │   └── sample-data.seed.ts
│   │   └── schema.ts
│   │
│   ├── prompts/                  # AI prompt templates
│   │   ├── question-generation.prompt.ts
│   │   ├── answer-evaluation.prompt.ts
│   │   ├── follow-up.prompt.ts
│   │   └── summary.prompt.ts
│   │
│   ├── utils/                    # Utility functions
│   │   ├── logger.util.ts
│   │   ├── error.util.ts
│   │   ├── validation.util.ts
│   │   ├── date.util.ts
│   │   └── response.util.ts
│   │
│   ├── di/                       # Dependency Injection
│   │   ├── container.ts
│   │   └── types.ts
│   │
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # Server entry point
│
├── tests/                        # Test suite
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── tsconfig.json
└── package.json
```

---

## Layer Responsibilities

### 1. Controllers Layer (`controllers/`)
**Purpose**: Handle HTTP requests and responses

**Responsibilities**:
- Parse incoming requests
- Validate request structure (basic)
- Delegate to services
- Format responses
- Handle HTTP status codes
- No business logic

**Example Structure**:
```typescript
// interview.controller.ts
class InterviewController {
  constructor(
    private interviewService: IInterviewService,
    private logger: ILogger
  ) {}
  
  async createInterview(req, res, next): Promise<void>
  async getInterview(req, res, next): Promise<void>
  async updateInterview(req, res, next): Promise<void>
  async deleteInterview(req, res, next): Promise<void>
  async listInterviews(req, res, next): Promise<void>
}
```

### 2. Routes Layer (`routes/`)
**Purpose**: Define API endpoints and routing

**Responsibilities**:
- Map HTTP methods to controller actions
- Apply middleware (validation, auth, rate limiting)
- Group related endpoints
- Version management

**Structure**:
```typescript
// v1/interview.routes.ts
router.post('/', 
  authMiddleware,
  validateRequest(interviewValidator.create),
  interviewController.createInterview
);

router.get('/:id',
  authMiddleware,
  validateRequest(interviewValidator.getById),
  interviewController.getInterview
);
```

### 3. Services Layer (`services/`)
**Purpose**: Implement business logic

**Responsibilities**:
- Execute business rules
- Orchestrate operations across repositories
- Call external services (OpenAI)
- Transaction management
- Data transformation
- Business validation

**Key Services**:
- **InterviewService**: Interview lifecycle management
- **QuestionService**: Question generation logic
- **AnswerService**: Answer processing
- **EvaluationService**: Scoring and feedback logic
- **ReportService**: Report generation and aggregation
- **OpenAIService**: OpenAI API integration
- **CacheService**: Caching layer for performance

### 4. Repositories Layer (`repositories/`)
**Purpose**: Data access abstraction

**Responsibilities**:
- CRUD operations
- Query building
- Database connection management
- Data mapping (DB ↔ Domain models)
- Transaction support
- No business logic

**Pattern**:
```typescript
// Base Repository
interface IBaseRepository<T> {
  findById(id: string): Promise<T | null>
  findAll(filter?: Filter): Promise<T[]>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<boolean>
  exists(id: string): Promise<boolean>
}

// Specific Repository
interface IInterviewRepository extends IBaseRepository<Interview> {
  findByUserId(userId: string): Promise<Interview[]>
  findByStatus(status: InterviewStatus): Promise<Interview[]>
  countByTopic(topic: string): Promise<number>
}
```

### 5. Models Layer (`models/`)
**Purpose**: Domain entity definitions

**Responsibilities**:
- Define domain entities
- Entity behavior (methods)
- Domain validation
- Value objects
- Entity relationships

**Example**:
```typescript
// interview.model.ts
class Interview {
  id: string
  userId: string
  topic: Topic
  difficulty: Difficulty
  experience: number
  numberOfQuestions: number
  jobDescription?: string
  status: InterviewStatus
  createdAt: Date
  updatedAt: Date
  
  // Domain methods
  isCompleted(): boolean
  canGenerateMoreQuestions(): boolean
  calculateProgress(): number
}
```

### 6. Interfaces Layer (`interfaces/`)
**Purpose**: Contract definitions

**Responsibilities**:
- Define contracts for services
- Define contracts for repositories
- Enable dependency injection
- Facilitate testing (mocking)
- Ensure loose coupling

### 7. Types Layer (`types/`)
**Purpose**: Type definitions and DTOs

**Responsibilities**:
- Data Transfer Objects (DTOs)
- Request/Response types
- Enums
- Common types
- API contracts

**Structure**:
```typescript
// DTOs (Data Transfer Objects)
CreateInterviewDTO
UpdateInterviewDTO
InterviewResponseDTO
QuestionResponseDTO
EvaluationResponseDTO

// Enums
enum Difficulty { Beginner, Intermediate, Advanced, Expert }
enum Topic { NodeJS, React, SystemDesign, TeamLead }
enum InterviewStatus { InProgress, Completed, Paused }
```

### 8. Middleware Layer (`middleware/`)
**Purpose**: Request/response processing pipeline

**Responsibilities**:
- Error handling
- Request validation
- Authentication
- Authorization
- Rate limiting
- Logging
- CORS
- Request parsing

### 9. Validators Layer (`validators/`)
**Purpose**: Input validation schemas

**Responsibilities**:
- Define validation rules (using Zod/Joi)
- Reusable validation schemas
- Custom validators
- Sanitization

### 10. Config Layer (`config/`)
**Purpose**: Application configuration

**Responsibilities**:
- Environment variables
- Database configuration
- External service configs
- Constants
- Feature flags

### 11. Database Layer (`database/`)
**Purpose**: Database management

**Responsibilities**:
- Connection management
- Schema definitions
- Migrations
- Seeds
- Query builders

### 12. Prompts Layer (`prompts/`)
**Purpose**: AI prompt templates

**Responsibilities**:
- OpenAI prompt templates
- Prompt versioning
- Dynamic prompt generation
- Prompt testing

### 13. Utils Layer (`utils/`)
**Purpose**: Shared utilities

**Responsibilities**:
- Logger implementation
- Error utilities
- Date/time helpers
- String formatters
- Response builders

### 14. DI Layer (`di/`)
**Purpose**: Dependency injection container

**Responsibilities**:
- Service registration
- Dependency resolution
- Lifecycle management
- Container configuration

---

## Architectural Patterns

### 1. Clean Architecture Layers

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│    (Controllers, Routes, Middleware)    │
├─────────────────────────────────────────┤
│         Application Layer               │
│           (Services)                    │
├─────────────────────────────────────────┤
│         Domain Layer                    │
│      (Models, Interfaces)               │
├─────────────────────────────────────────┤
│         Infrastructure Layer            │
│   (Repositories, External Services)     │
└─────────────────────────────────────────┘
```

### 2. Repository Pattern

**Purpose**: Abstract data access logic

**Benefits**:
- Database independence
- Testability
- Centralized data access
- Easy to switch databases

**Flow**:
```
Controller → Service → Repository → Database
                ↓
         Domain Model
```

### 3. Service Layer Pattern

**Purpose**: Encapsulate business logic

**Characteristics**:
- Stateless
- Reusable
- Testable
- Composable

### 4. Dependency Injection

**Container-based DI using InversifyJS or TSyringe**

**Benefits**:
- Loose coupling
- Easy testing
- Flexibility
- Lifecycle management

---

## API Layer Design

### API Structure

```
/api/v1/
  ├── /interviews
  │   ├── POST   /                    # Create interview
  │   ├── GET    /:id                 # Get interview
  │   ├── GET    /                    # List interviews
  │   ├── PATCH  /:id                 # Update interview
  │   ├── DELETE /:id                 # Delete interview
  │   └── GET    /:id/report          # Get report
  │
  ├── /questions
  │   ├── POST   /generate            # Generate question
  │   ├── GET    /:id                 # Get question
  │   └── POST   /follow-up           # Generate follow-up
  │
  ├── /answers
  │   ├── POST   /                    # Submit answer
  │   ├── GET    /:id                 # Get answer
  │   └── PATCH  /:id                 # Update answer
  │
  ├── /evaluations
  │   ├── POST   /                    # Create evaluation
  │   └── GET    /:id                 # Get evaluation
  │
  └── /reports
      ├── GET    /:interviewId        # Get full report
      └── POST   /:interviewId/export # Export report
```

### Request/Response Flow

```
HTTP Request
    ↓
CORS Middleware
    ↓
Logger Middleware
    ↓
Rate Limiter
    ↓
Authentication Middleware
    ↓
Validation Middleware
    ↓
Controller
    ↓
Service Layer
    ↓
Repository Layer
    ↓
Database
    ↓
Response Builder
    ↓
HTTP Response
```

### Standard Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ErrorDetail
  metadata?: {
    timestamp: string
    requestId: string
    version: string
  }
  pagination?: PaginationMeta
}

interface ErrorDetail {
  code: string
  message: string
  details?: any[]
  stack?: string // Only in development
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}
```

---

## Service Layer Design

### Service Architecture

```typescript
// Base Service Interface
interface IBaseService {
  // Common methods for all services
}

// Interview Service
interface IInterviewService {
  createInterview(dto: CreateInterviewDTO): Promise<InterviewResponseDTO>
  getInterviewById(id: string): Promise<InterviewResponseDTO>
  updateInterview(id: string, dto: UpdateInterviewDTO): Promise<InterviewResponseDTO>
  deleteInterview(id: string): Promise<void>
  listInterviews(filter: InterviewFilter, pagination: PaginationDTO): Promise<PaginatedResponse<InterviewResponseDTO>>
  getInterviewReport(id: string): Promise<ReportResponseDTO>
}

// Question Service
interface IQuestionService {
  generateQuestion(dto: GenerateQuestionDTO): Promise<QuestionResponseDTO>
  generateFollowUpQuestion(dto: FollowUpQuestionDTO): Promise<QuestionResponseDTO>
  getQuestionById(id: string): Promise<QuestionResponseDTO>
  getQuestionsByInterviewId(interviewId: string): Promise<QuestionResponseDTO[]>
}

// Answer Service
interface IAnswerService {
  submitAnswer(dto: SubmitAnswerDTO): Promise<AnswerResponseDTO>
  getAnswerById(id: string): Promise<AnswerResponseDTO>
  updateAnswer(id: string, dto: UpdateAnswerDTO): Promise<AnswerResponseDTO>
}

// Evaluation Service
interface IEvaluationService {
  evaluateAnswer(answerId: string): Promise<EvaluationResponseDTO>
  getEvaluationById(id: string): Promise<EvaluationResponseDTO>
  recalculateEvaluation(answerId: string): Promise<EvaluationResponseDTO>
}

// OpenAI Service
interface IOpenAIService {
  generateQuestion(context: QuestionContext): Promise<string>
  evaluateAnswer(context: EvaluationContext): Promise<EvaluationResult>
  generateSummary(evaluations: Evaluation[]): Promise<SummaryResult>
}

// Cache Service
interface ICacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

// Report Service
interface IReportService {
  generateReport(interviewId: string): Promise<ReportResponseDTO>
  exportReport(interviewId: string, format: ExportFormat): Promise<Buffer>
  getReportSummary(interviewId: string): Promise<ReportSummaryDTO>
}
```

### Service Layer Responsibilities

1. **Business Logic Execution**
   - Validate business rules
   - Execute domain logic
   - Orchestrate operations

2. **Transaction Management**
   - Begin transactions
   - Commit/Rollback
   - Ensure data consistency

3. **Service Composition**
   - Call multiple repositories
   - Coordinate between services
   - Aggregate results

4. **External Service Integration**
   - Call OpenAI API
   - Handle retries
   - Error handling

5. **Caching Strategy**
   - Cache frequently accessed data
   - Invalidate cache on updates
   - Optimize performance

---

## Repository Pattern

### Repository Architecture

```typescript
// Base Repository Interface
interface IBaseRepository<T> {
  findById(id: string): Promise<T | null>
  findAll(filter?: QueryFilter): Promise<T[]>
  findOne(filter: QueryFilter): Promise<T | null>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<boolean>
  exists(id: string): Promise<boolean>
  count(filter?: QueryFilter): Promise<number>
}

// Interview Repository
interface IInterviewRepository extends IBaseRepository<Interview> {
  findByUserId(userId: string): Promise<Interview[]>
  findByStatus(status: InterviewStatus): Promise<Interview[]>
  findByTopicAndDifficulty(topic: Topic, difficulty: Difficulty): Promise<Interview[]>
  countByTopic(topic: Topic): Promise<number>
  findCompletedInterviews(userId: string): Promise<Interview[]>
  findInProgressInterviews(userId: string): Promise<Interview[]>
  updateStatus(id: string, status: InterviewStatus): Promise<Interview>
}

// Question Repository
interface IQuestionRepository extends IBaseRepository<Question> {
  findByInterviewId(interviewId: string): Promise<Question[]>
  findFollowUpQuestions(parentQuestionId: string): Promise<Question[]>
  countByInterviewId(interviewId: string): Promise<number>
  findLatestQuestion(interviewId: string): Promise<Question | null>
}

// Answer Repository
interface IAnswerRepository extends IBaseRepository<Answer> {
  findByQuestionId(questionId: string): Promise<Answer | null>
  findByInterviewId(interviewId: string): Promise<Answer[]>
  findUnevaluatedAnswers(): Promise<Answer[]>
}

// Evaluation Repository
interface IEvaluationRepository extends IBaseRepository<Evaluation> {
  findByAnswerId(answerId: string): Promise<Evaluation | null>
  findByInterviewId(interviewId: string): Promise<Evaluation[]>
  calculateAverageScores(interviewId: string): Promise<AverageScores>
  findTopScores(userId: string): Promise<Evaluation[]>
}
```

### Repository Implementation Strategy

1. **SQLite Implementation** (Initial)
   - Direct SQL queries
   - Connection pooling
   - Query optimization

2. **MongoDB Migration Path** (Future)
   - Same interface
   - Different implementation
   - Minimal service layer changes

3. **Transaction Support**
   ```typescript
   interface IUnitOfWork {
     beginTransaction(): Promise<void>
     commit(): Promise<void>
     rollback(): Promise<void>
     getInterviewRepository(): IInterviewRepository
     getQuestionRepository(): IQuestionRepository
     getAnswerRepository(): IAnswerRepository
     getEvaluationRepository(): IEvaluationRepository
   }
   ```

---

## TypeScript Interfaces

### Core Domain Interfaces

```typescript
// models/interview.model.ts
interface Interview {
  id: string
  userId: string
  topic: Topic
  difficulty: Difficulty
  experience: number
  numberOfQuestions: number
  jobDescription?: string
  status: InterviewStatus
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}

// models/question.model.ts
interface Question {
  id: string
  interviewId: string
  questionText: string
  questionNumber: number
  isFollowUp: boolean
  parentQuestionId?: string
  metadata: QuestionMetadata
  createdAt: Date
}

// models/answer.model.ts
interface Answer {
  id: string
  questionId: string
  answerText: string
  transcriptData?: TranscriptData
  durationSeconds: number
  createdAt: Date
}

// models/evaluation.model.ts
interface Evaluation {
  id: string
  answerId: string
  technical: number
  communication: number
  leadership: number
  problemSolving: number
  confidence: number
  strengths: string[]
  weaknesses: string[]
  missingPoints: string[]
  improvements: string[]
  overallFeedback: string
  createdAt: Date
}
```

### DTO Interfaces

```typescript
// types/dtos/interview.dto.ts
interface CreateInterviewDTO {
  userId: string
  topic: Topic
  difficulty: Difficulty
  experience: number
  numberOfQuestions: number
  jobDescription?: string
}

interface UpdateInterviewDTO {
  status?: InterviewStatus
  numberOfQuestions?: number
}

interface InterviewResponseDTO {
  id: string
  topic: string
  difficulty: string
  experience: number
  numberOfQuestions: number
  status: string
  progress: number
  createdAt: string
  completedAt?: string
}

// types/dtos/question.dto.ts
interface GenerateQuestionDTO {
  interviewId: string
  previousQuestions?: string[]
  isFollowUp?: boolean
  lastAnswerText?: string
}

interface QuestionResponseDTO {
  id: string
  questionText: string
  questionNumber: number
  isFollowUp: boolean
  createdAt: string
}

// types/dtos/answer.dto.ts
interface SubmitAnswerDTO {
  questionId: string
  answerText: string
  durationSeconds: number
  transcriptData?: TranscriptData
}

interface AnswerResponseDTO {
  id: string
  questionId: string
  answerText: string
  durationSeconds: number
  createdAt: string
}

// types/dtos/evaluation.dto.ts
interface EvaluationResponseDTO {
  id: string
  answerId: string
  scores: {
    technical: number
    communication: number
    leadership: number
    problemSolving: number
    confidence: number
    overall: number
  }
  feedback: {
    strengths: string[]
    weaknesses: string[]
    missingPoints: string[]
    improvements: string[]
    overallFeedback: string
  }
  createdAt: string
}

// types/dtos/report.dto.ts
interface ReportResponseDTO {
  interview: InterviewResponseDTO
  questions: QuestionWithAnswerDTO[]
  averageScores: AverageScoresDTO
  summary: ReportSummaryDTO
  timeline: TimelineEventDTO[]
}
```

### Service Context Interfaces

```typescript
// Context objects passed to services
interface QuestionContext {
  topic: Topic
  difficulty: Difficulty
  experience: number
  questionNumber: number
  previousQuestions: string[]
  jobDescription?: string
  isFollowUp: boolean
  lastAnswer?: string
}

interface EvaluationContext {
  question: string
  answer: string
  topic: Topic
  difficulty: Difficulty
  experience: number
  evaluationCriteria: EvaluationCriteria
}

interface EvaluationCriteria {
  technical: boolean
  communication: boolean
  leadership: boolean
  problemSolving: boolean
  confidence: boolean
}
```

### Utility Interfaces

```typescript
// Pagination
interface PaginationDTO {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Query Filters
interface QueryFilter {
  [key: string]: any
}

interface InterviewFilter extends QueryFilter {
  userId?: string
  topic?: Topic
  difficulty?: Difficulty
  status?: InterviewStatus
  createdAfter?: Date
  createdBefore?: Date
}

// Error Handling
interface AppError extends Error {
  statusCode: number
  isOperational: boolean
  code: string
}
```

---

## Dependency Injection

### Container Setup (using TSyringe)

```typescript
// di/container.ts
import { container } from 'tsyringe'

// Register all dependencies
container.register<ILogger>('ILogger', { useClass: Logger })
container.register<IDatabaseConnection>('IDatabaseConnection', { useClass: SQLiteConnection })

// Repositories
container.register<IInterviewRepository>('IInterviewRepository', { useClass: InterviewRepository })
container.register<IQuestionRepository>('IQuestionRepository', { useClass: QuestionRepository })
container.register<IAnswerRepository>('IAnswerRepository', { useClass: AnswerRepository })
container.register<IEvaluationRepository>('IEvaluationRepository', { useClass: EvaluationRepository })

// Services
container.register<IInterviewService>('IInterviewService', { useClass: InterviewService })
container.register<IQuestionService>('IQuestionService', { useClass: QuestionService })
container.register<IAnswerService>('IAnswerService', { useClass: AnswerService })
container.register<IEvaluationService>('IEvaluationService', { useClass: EvaluationService })
container.register<IOpenAIService>('IOpenAIService', { useClass: OpenAIService })
container.register<ICacheService>('ICacheService', { useClass: CacheService })

export { container }
```

### Controller with DI

```typescript
// controllers/interview.controller.ts
@injectable()
class InterviewController {
  constructor(
    @inject('IInterviewService') private interviewService: IInterviewService,
    @inject('ILogger') private logger: ILogger
  ) {}
  
  async createInterview(req: Request, res: Response, next: NextFunction) {
    // Implementation
  }
}
```

### Service with DI

```typescript
// services/interview.service.ts
@injectable()
class InterviewService implements IInterviewService {
  constructor(
    @inject('IInterviewRepository') private interviewRepository: IInterviewRepository,
    @inject('IQuestionService') private questionService: IQuestionService,
    @inject('ILogger') private logger: ILogger,
    @inject('ICacheService') private cacheService: ICacheService
  ) {}
  
  async createInterview(dto: CreateInterviewDTO): Promise<InterviewResponseDTO> {
    // Implementation
  }
}
```

---

## Error Handling Strategy

### Error Hierarchy

```typescript
// Base Application Error
class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public isOperational: boolean = true
  ) {
    super(message)
  }
}

// Specific Error Types
class ValidationError extends AppError {
  constructor(message: string, details?: any[]) {
    super(message, 400, 'VALIDATION_ERROR')
    this.details = details
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND')
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN')
  }
}

class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: Error) {
    super(`${service} service error`, 503, 'EXTERNAL_SERVICE_ERROR')
    this.originalError = originalError
  }
}
```

### Error Handling Middleware

```typescript
// middleware/error-handler.middleware.ts

// Global error handler
interface ErrorHandlerMiddleware {
  (error: Error, req: Request, res: Response, next: NextFunction): void
}

// Strategy:
// 1. Log error
// 2. Determine if operational or programming error
// 3. Send appropriate response
// 4. In production, hide stack traces
```

### Error Handling Flow

```
Error Thrown
    ↓
Service Layer catches and wraps
    ↓
Controller catches and passes to next()
    ↓
Error Handler Middleware
    ↓
Log Error
    ↓
Format Response
    ↓
Send to Client
```

---

## Request Validation

### Validation Strategy (using Zod)

```typescript
// validators/interview.validator.ts
import { z } from 'zod'

const createInterviewSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    topic: z.enum(['NodeJS', 'React', 'SystemDesign', 'TeamLead']),
    difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
    experience: z.number().int().min(0).max(50),
    numberOfQuestions: z.number().int().min(1).max(50),
    jobDescription: z.string().optional()
  })
})

const getInterviewSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
})

const updateInterviewSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    status: z.enum(['InProgress', 'Completed', 'Paused']).optional(),
    numberOfQuestions: z.number().int().min(1).max(50).optional()
  })
})

export const interviewValidator = {
  create: createInterviewSchema,
  getById: getInterviewSchema,
  update: updateInterviewSchema
}
```

### Validation Middleware

```typescript
// middleware/validation.middleware.ts

interface ValidationMiddleware {
  (schema: ZodSchema): RequestHandler
}

// Usage in routes:
router.post('/',
  validateRequest(interviewValidator.create),
  interviewController.createInterview
)
```

### Custom Validators

```typescript
// validators/common.validator.ts

// Custom validation functions
const isValidTopic = (topic: string): boolean => { }
const isValidDifficulty = (difficulty: string): boolean => { }
const isValidExperience = (experience: number): boolean => { }
```

---

## Logging Strategy

### Logger Interface

```typescript
// interfaces/common/ILogger.ts
interface ILogger {
  info(message: string, meta?: any): void
  error(message: string, error?: Error, meta?: any): void
  warn(message: string, meta?: any): void
  debug(message: string, meta?: any): void
  http(message: string, meta?: any): void
}
```

### Logger Configuration (Winston)

```typescript
// config/logger.config.ts

// Log Levels:
// - error: 0
// - warn: 1
// - info: 2
// - http: 3
// - debug: 4

// Transports:
// - Console (development)
// - File (production)
// - External service (CloudWatch, DataDog, etc.)

// Log Format:
{
  timestamp: '2024-06-09T10:30:00.000Z',
  level: 'info',
  message: 'Interview created',
  meta: {
    interviewId: 'uuid',
    userId: 'uuid',
    topic: 'NodeJS'
  },
  requestId: 'uuid'
}
```

### Logging Strategy

1. **Request Logging**: Log all incoming requests
2. **Service Logging**: Log business operations
3. **Error Logging**: Log all errors with stack traces
4. **Performance Logging**: Log slow queries/operations
5. **Audit Logging**: Log important business events

---

## Environment Configuration

### Configuration Structure

```typescript
// config/app.config.ts

interface AppConfig {
  port: number
  nodeEnv: string
  apiVersion: string
}

interface DatabaseConfig {
  type: 'sqlite' | 'mongodb'
  path?: string // For SQLite
  url?: string // For MongoDB
  poolSize: number
  timeout: number
}

interface OpenAIConfig {
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  timeout: number
}

interface CacheConfig {
  enabled: boolean
  ttl: number
  maxSize: number
}

interface SecurityConfig {
  corsOrigin: string[]
  rateLimitWindowMs: number
  rateLimitMaxRequests: number
  jwtSecret: string
  jwtExpiresIn: string
}

interface LoggerConfig {
  level: string
  format: string
  transports: string[]
}

// Central configuration object
interface Configuration {
  app: AppConfig
  database: DatabaseConfig
  openai: OpenAIConfig
  cache: CacheConfig
  security: SecurityConfig
  logger: LoggerConfig
}
```

### Environment Variables

```bash
# .env.example

# Application
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database
DB_TYPE=sqlite
DB_PATH=./data/interviews.db
DB_POOL_SIZE=10
DB_TIMEOUT=5000

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000
OPENAI_TIMEOUT=30000

# Cache
CACHE_ENABLED=true
CACHE_TTL=3600
CACHE_MAX_SIZE=100

# Security
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json
LOG_TRANSPORTS=console,file
```

---

## API Versioning

### Versioning Strategy

**URL Versioning** (Recommended for REST APIs)
```
/api/v1/interviews
/api/v2/interviews
```

### Implementation

```typescript
// routes/index.ts
import v1Routes from './v1'
import v2Routes from './v2'

app.use('/api/v1', v1Routes)
app.use('/api/v2', v2Routes)
```

### Version Structure

```
routes/
├── v1/
│   ├── interview.routes.ts
│   ├── question.routes.ts
│   ├── answer.routes.ts
│   └── index.ts
└── v2/
    ├── interview.routes.ts
    └── index.ts
```

### Version Deprecation Strategy

1. **Announce deprecation** in response headers
2. **Set sunset date** (6-12 months notice)
3. **Redirect to new version** with warning
4. **Remove old version** after sunset

```typescript
// Deprecation Header
res.setHeader('X-API-Deprecation', 'version=1.0, sunset=2025-01-01')
```

---

## Scalability Best Practices

### 1. Database Optimization

**Indexing Strategy**:
```sql
-- Interviews
CREATE INDEX idx_interviews_userId ON interviews(userId)
CREATE INDEX idx_interviews_status ON interviews(status)
CREATE INDEX idx_interviews_topic ON interviews(topic)
CREATE INDEX idx_interviews_createdAt ON interviews(createdAt)

-- Questions
CREATE INDEX idx_questions_interviewId ON questions(interviewId)
CREATE INDEX idx_questions_parentQuestionId ON questions(parentQuestionId)

-- Answers
CREATE INDEX idx_answers_questionId ON answers(questionId)

-- Evaluations
CREATE INDEX idx_evaluations_answerId ON evaluations(answerId)
```

**Query Optimization**:
- Use prepared statements
- Limit result sets
- Avoid N+1 queries
- Use pagination
- Implement database connection pooling

### 2. Caching Strategy

**Cache Layers**:
1. **Memory Cache** (Node.js in-memory)
   - Session data
   - Configuration
   - Short-lived data

2. **Redis Cache** (Future)
   - User sessions
   - API responses
   - Computed results

**Cache Invalidation**:
- Time-based (TTL)
- Event-based (on updates)
- Manual invalidation

**What to Cache**:
- Frequently accessed interviews
- Generated questions (temporary)
- User profiles
- Configuration data
- OpenAI responses (with caution)

### 3. Asynchronous Processing

**Background Jobs** (using Bull/BullMQ):
- Report generation
- Email notifications
- Data exports
- Analytics processing
- Batch evaluations

**Queue Structure**:
```typescript
interface QueueConfig {
  evaluation: {
    concurrency: 5,
    priority: 'high'
  },
  report: {
    concurrency: 3,
    priority: 'medium'
  },
  export: {
    concurrency: 2,
    priority: 'low'
  }
}
```

### 4. Rate Limiting

**Implementation**:
- Per IP address
- Per user
- Per endpoint
- Sliding window algorithm

**Limits**:
```typescript
const rateLimits = {
  global: { windowMs: 15 * 60 * 1000, max: 1000 },
  interviews: { windowMs: 60 * 1000, max: 10 },
  questions: { windowMs: 60 * 1000, max: 30 },
  openai: { windowMs: 60 * 1000, max: 20 }
}
```

### 5. Database Migration Path

**SQLite → MongoDB**:

Phase 1: Implement Repository Pattern (Done)
Phase 2: Create MongoDB repositories
Phase 3: Run dual-write mode (both DBs)
Phase 4: Migrate data
Phase 5: Switch to MongoDB
Phase 6: Remove SQLite

**Migration Strategy**:
```typescript
// Same interface, different implementation
class MongoInterviewRepository implements IInterviewRepository {
  // MongoDB-specific implementation
}

// Zero service layer changes
// Just swap in DI container
container.register<IInterviewRepository>(
  'IInterviewRepository', 
  { useClass: MongoInterviewRepository }
)
```

### 6. Monitoring & Observability

**Metrics to Track**:
- Request rate
- Response time
- Error rate
- OpenAI API latency
- Database query performance
- Cache hit rate
- Memory usage
- CPU usage

**Tools**:
- Prometheus + Grafana
- DataDog
- New Relic
- CloudWatch

### 7. API Response Optimization

**Strategies**:
- Gzip compression
- Response caching
- Partial responses (field filtering)
- ETags for conditional requests
- Pagination for lists
- Lazy loading

**Example - Field Filtering**:
```
GET /api/v1/interviews?fields=id,topic,status
```

### 8. Load Balancing Preparation

**Stateless Design**:
- No server-side sessions (use JWT)
- Shared cache (Redis)
- Database connection pooling
- Horizontal scaling ready

**Health Checks**:
```typescript
GET /health
{
  status: 'healthy',
  version: '1.0.0',
  uptime: 3600,
  database: 'connected',
  openai: 'available',
  cache: 'connected'
}
```

### 9. Error Recovery

**Retry Logic**:
- Exponential backoff
- Circuit breaker pattern
- Graceful degradation
- Fallback responses

**Circuit Breaker** (for OpenAI):
```typescript
const circuitBreaker = {
  failureThreshold: 5,
  resetTimeout: 60000,
  fallback: (error) => {
    // Return cached response or error
  }
}
```

### 10. Security Best Practices

**Rate Limiting**: Prevent abuse
**Input Validation**: Prevent injection
**Authentication**: JWT-based
**Authorization**: Role-based access control (RBAC)
**HTTPS Only**: In production
**CORS**: Configured properly
**Helmet**: Security headers
**SQL Injection**: Parameterized queries
**XSS**: Input sanitization

---

## Security Considerations

### 1. Authentication & Authorization

**JWT-based Authentication**:
```typescript
interface JWTPayload {
  userId: string
  email: string
  role: UserRole
  iat: number
  exp: number
}

// Middleware
interface AuthMiddleware {
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void
}
```

### 2. Input Validation & Sanitization

**Validation Layers**:
1. Schema validation (Zod)
2. Business rule validation (Services)
3. Database constraints

**Sanitization**:
- HTML escaping
- SQL injection prevention
- NoSQL injection prevention
- Path traversal prevention

### 3. Data Protection

**Sensitive Data**:
- Never log API keys
- Hash passwords (bcrypt)
- Encrypt sensitive data at rest
- Use HTTPS in transit

**Database Security**:
- Use parameterized queries
- Least privilege principle
- Regular backups
- Encrypted backups

### 4. API Security

**Security Headers** (Helmet):
```typescript
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000
- Content-Security-Policy: default-src 'self'
```

**CORS Configuration**:
```typescript
{
  origin: process.env.CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

### 5. OpenAI API Key Protection

**Best Practices**:
- Store in environment variables
- Never expose to frontend
- Rotate regularly
- Monitor usage
- Set spending limits
- Use separate keys for dev/prod

### 6. Error Messages

**Production Error Messages**:
- Generic messages to clients
- Detailed logs server-side
- No stack traces to clients
- No database details exposed

---

## Testing Strategy

### Test Structure

```
tests/
├── unit/
│   ├── services/
│   ├── repositories/
│   ├── utils/
│   └── validators/
├── integration/
│   ├── api/
│   ├── database/
│   └── external-services/
└── e2e/
    └── flows/
```

### Testing Approach

**Unit Tests**:
- Test individual functions
- Mock dependencies
- Fast execution
- High coverage

**Integration Tests**:
- Test component interaction
- Use test database
- Real dependencies
- Critical paths

**E2E Tests**:
- Test complete flows
- Real environment
- User scenarios
- Smoke tests

---

## Performance Optimization

### 1. Database Performance

**Connection Pooling**:
```typescript
{
  min: 2,
  max: 10,
  idle: 10000,
  acquire: 30000
}
```

**Query Optimization**:
- Indexed queries
- Limit result sets
- Avoid SELECT *
- Use EXPLAIN QUERY PLAN

### 2. OpenAI API Optimization

**Strategies**:
- Cache responses (with care)
- Batch requests when possible
- Use streaming for long responses
- Implement retry logic
- Monitor rate limits
- Use appropriate models (GPT-3.5 vs GPT-4)

### 3. Response Compression

```typescript
app.use(compression({
  level: 6,
  threshold: 1024
}))
```

### 4. Memory Management

**Strategies**:
- Stream large responses
- Limit payload sizes
- Clear caches periodically
- Monitor memory usage
- Avoid memory leaks

---

## Deployment Considerations

### Environment Setup

**Development**:
- Local SQLite
- Debug logging
- Hot reload
- Mock external services

**Staging**:
- Similar to production
- Test data
- Full logging
- Real external services

**Production**:
- Scalable database
- Error logging only
- Load balancing
- Monitoring
- Backups

### Docker Configuration

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder
# Build stage

FROM node:18-alpine AS production
# Production stage
```

### Environment Variables Management

**Tools**:
- dotenv (development)
- AWS Secrets Manager (production)
- Azure Key Vault (production)
- HashiCorp Vault (production)

---

## Summary

This architecture provides:

✅ **Clean Architecture** with clear separation of concerns  
✅ **Scalability** through proper layering and patterns  
✅ **Maintainability** with SOLID principles  
✅ **Testability** through dependency injection  
✅ **Security** with multiple layers of protection  
✅ **Performance** through caching and optimization  
✅ **Flexibility** for future enhancements (MongoDB migration)  
✅ **Production-ready** with comprehensive error handling and logging  

### Next Steps

1. **Phase 1**: Implement core models and interfaces
2. **Phase 2**: Implement repositories (SQLite)
3. **Phase 3**: Implement services layer
4. **Phase 4**: Implement controllers and routes
5. **Phase 5**: Add middleware and validation
6. **Phase 6**: Implement DI container
7. **Phase 7**: Add logging and monitoring
8. **Phase 8**: Write tests
9. **Phase 9**: Document APIs (Swagger/OpenAPI)
10. **Phase 10**: Deploy to production

---

**Document Version**: 1.0  
**Last Updated**: June 9, 2026  
**Author**: Senior Node.js Architect
