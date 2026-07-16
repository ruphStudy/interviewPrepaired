# Backend Architecture - Visual Diagrams & Flow Charts

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                    (React Frontend / Mobile)                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/REST
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   CORS   │→ │  Logger  │→ │Rate Limit│→ │   Auth   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Interview  │  │  Question  │  │   Answer   │  Controllers   │
│  │ Controller │  │ Controller │  │ Controller │               │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘               │
└────────┼───────────────┼───────────────┼─────────────────────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Interview  │  │  Question  │  │ Evaluation │  Services      │
│  │  Service   │  │  Service   │  │  Service   │               │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘               │
│        │                │                │                       │
│  ┌─────┴──────┐  ┌─────┴──────┐  ┌─────┴──────┐               │
│  │   OpenAI   │  │   Cache    │  │   Report   │               │
│  │  Service   │  │  Service   │  │  Service   │               │
│  └────────────┘  └────────────┘  └────────────┘               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Interview  │  │  Question  │  │   Answer   │  Models        │
│  │   Model    │  │   Model    │  │   Model    │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Interfaces │  │    Types   │  │   Enums    │               │
│  └────────────┘  └────────────┘  └────────────┘               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  INFRASTRUCTURE LAYER                            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │ Interview  │  │  Question  │  │   Answer   │  Repositories  │
│  │ Repository │  │ Repository │  │ Repository │               │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘               │
└────────┼───────────────┼───────────────┼─────────────────────────┘
         │               │               │
         └───────────────┴───────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    SQLite Database                        │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │Interviews│ │Questions │ │ Answers  │ │Evaluations│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    OpenAI API                           │    │
│  │  • Question Generation (GPT-4)                          │    │
│  │  • Answer Evaluation (GPT-4)                            │    │
│  │  • Summary Generation (GPT-4)                           │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   HTTP Request Flow                              │
└─────────────────────────────────────────────────────────────────┘

1. HTTP Request
   │
   ├─→ CORS Middleware ──────────────────────┐
   │                                          │
   ├─→ Request Logger ───────────────────────┤
   │    • Log request details                 │
   │    • Generate request ID                 │
   │                                          │
   ├─→ Rate Limiter ─────────────────────────┤
   │    • Check request count                 │
   │    • Apply limits per IP/User            │
   │                                          │
   ├─→ Authentication ───────────────────────┤
   │    • Verify JWT token                    │
   │    • Extract user info                   │
   │                                          │
   ├─→ Validation Middleware ────────────────┤
   │    • Validate request body               │
   │    • Validate params                     │
   │    • Validate query                      │
   │                                          │
   ├─→ Controller ───────────────────────────┤
   │    • Parse request                       │
   │    • Call service                        │
   │    • Format response                     │
   │                                          │
   ├─→ Service Layer ────────────────────────┤
   │    • Execute business logic              │
   │    • Call repositories                   │
   │    • Call external services              │
   │                                          │
   ├─→ Repository Layer ─────────────────────┤
   │    • Execute database queries            │
   │    • Map data to models                  │
   │                                          │
   ├─→ Database ─────────────────────────────┤
   │    • Execute SQL                         │
   │    • Return results                      │
   │                                          │
   └─→ Response Builder ─────────────────────┘
        • Format response
        • Add metadata
        • Send HTTP response

Error at any stage → Error Handler Middleware → Error Response
```

---

## Interview Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│         POST /api/v1/interviews - Create Interview              │
└─────────────────────────────────────────────────────────────────┘

Client Request
   │
   │ POST /api/v1/interviews
   │ {
   │   userId: "uuid",
   │   topic: "NodeJS",
   │   difficulty: "Intermediate",
   │   experience: 5,
   │   numberOfQuestions: 10,
   │   jobDescription: "..."
   │ }
   │
   ▼
┌──────────────────────────────┐
│ Validation Middleware        │
│ • Validate request schema    │
│ • Check required fields      │
│ • Validate enum values       │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Interview Controller         │
│ • Parse DTO                  │
│ • Call service               │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Interview Service            │
│ • Validate business rules    │
│ • Check user quota           │
│ • Create interview entity    │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Interview Repository         │
│ • Generate UUID              │
│ • Insert into database       │
│ • Return created interview   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ SQLite Database              │
│ INSERT INTO interviews       │
└──────────┬───────────────────┘
           │
           │ Interview entity
           ▼
┌──────────────────────────────┐
│ Interview Service            │
│ • Map to DTO                 │
│ • Add computed fields        │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Interview Controller         │
│ • Build API response         │
│ • Set status code (201)      │
└──────────┬───────────────────┘
           │
           ▼
Client Response
{
  success: true,
  data: {
    id: "uuid",
    topic: "NodeJS",
    difficulty: "Intermediate",
    status: "InProgress",
    progress: 0,
    createdAt: "2024-06-09T10:30:00.000Z"
  },
  metadata: {
    timestamp: "...",
    requestId: "..."
  }
}
```

---

## Question Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│      POST /api/v1/questions/generate - Generate Question        │
└─────────────────────────────────────────────────────────────────┘

Client Request
   │
   │ POST /api/v1/questions/generate
   │ {
   │   interviewId: "uuid",
   │   previousQuestions: ["Q1", "Q2"],
   │   isFollowUp: false
   │ }
   │
   ▼
┌──────────────────────────────┐
│ Question Controller          │
│ • Parse request              │
│ • Call service               │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Question Service             │
│ • Get interview details      │
│ • Validate question count    │
│ • Build question context     │
└──────────┬───────────────────┘
           │
           ├─→ Check Cache ──────────────┐
           │   • Key: interview_id        │
           │   • Check for cached Q's     │
           │                              │
           ▼                              │
┌──────────────────────────────┐         │
│ OpenAI Service               │         │
│ • Build prompt               │◄────────┘ (Cache miss)
│ • Set context                │
│ • Call OpenAI API            │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ OpenAI API                   │
│ • Process prompt             │
│ • Generate question          │
│ • Return response            │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Question Service             │
│ • Parse AI response          │
│ • Create question entity     │
│ • Increment question number  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Question Repository          │
│ • Save question              │
│ • Link to interview          │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Cache Service                │
│ • Cache question (short TTL) │
│ • Update interview cache     │
└──────────┬───────────────────┘
           │
           ▼
Client Response
{
  success: true,
  data: {
    id: "uuid",
    questionText: "How does Node.js handle concurrency?",
    questionNumber: 3,
    isFollowUp: false,
    createdAt: "..."
  }
}
```

---

## Answer Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│     POST /api/v1/evaluations - Evaluate Answer                  │
└─────────────────────────────────────────────────────────────────┘

Client Request
   │
   │ POST /api/v1/evaluations
   │ {
   │   answerId: "uuid"
   │ }
   │
   ▼
┌──────────────────────────────┐
│ Evaluation Controller        │
│ • Parse request              │
│ • Call service               │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Evaluation Service           │
│ • Get answer                 │
│ • Get question               │
│ • Get interview              │
│ • Build evaluation context   │
└──────────┬───────────────────┘
           │
           ├─→ Answer Repository
           │   • Get answer text
           │
           ├─→ Question Repository
           │   • Get question text
           │
           └─→ Interview Repository
               • Get topic, difficulty
           │
           ▼
┌──────────────────────────────┐
│ OpenAI Service               │
│ • Build evaluation prompt    │
│ • Set scoring criteria       │
│ • Request structured output  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ OpenAI API                   │
│ • Analyze answer             │
│ • Score on 5 dimensions      │
│ • Generate feedback          │
│ • Return JSON                │
└──────────┬───────────────────┘
           │
           │ {
           │   technical: 8,
           │   communication: 7,
           │   leadership: 6,
           │   problemSolving: 8,
           │   confidence: 7,
           │   strengths: [...],
           │   weaknesses: [...],
           │   improvements: [...]
           │ }
           │
           ▼
┌──────────────────────────────┐
│ Evaluation Service           │
│ • Parse AI response          │
│ • Validate scores (0-10)     │
│ • Calculate overall score    │
│ • Create evaluation entity   │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Evaluation Repository        │
│ • Save evaluation            │
│ • Link to answer             │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Cache Service                │
│ • Invalidate report cache    │
└──────────┬───────────────────┘
           │
           ▼
Client Response
{
  success: true,
  data: {
    id: "uuid",
    scores: {
      technical: 8,
      communication: 7,
      leadership: 6,
      problemSolving: 8,
      confidence: 7,
      overall: 7.2
    },
    feedback: {
      strengths: [...],
      weaknesses: [...],
      improvements: [...]
    }
  }
}
```

---

## Report Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│    GET /api/v1/reports/:interviewId - Generate Report           │
└─────────────────────────────────────────────────────────────────┘

Client Request
   │
   │ GET /api/v1/reports/uuid-123
   │
   ▼
┌──────────────────────────────┐
│ Report Controller            │
│ • Extract interview ID       │
│ • Call service               │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Report Service               │
│ • Check cache                │
└──────────┬───────────────────┘
           │
           ├─→ Cache Hit? ──────────────┐
           │                            │
           │ (Cache miss)               │
           │                            │
           ▼                            │
┌──────────────────────────────┐       │
│ Parallel Data Fetching       │       │
│                              │       │
│ ┌──────────────────────────┐│       │
│ │Interview Repository      ││       │
│ │• Get interview details   ││       │
│ └──────────────────────────┘│       │
│                              │       │
│ ┌──────────────────────────┐│       │
│ │Question Repository       ││       │
│ │• Get all questions       ││       │
│ └──────────────────────────┘│       │
│                              │       │
│ ┌──────────────────────────┐│       │
│ │Answer Repository         ││       │
│ │• Get all answers         ││       │
│ └──────────────────────────┘│       │
│                              │       │
│ ┌──────────────────────────┐│       │
│ │Evaluation Repository     ││       │
│ │• Get all evaluations     ││       │
│ └──────────────────────────┘│       │
└──────────┬───────────────────┘       │
           │                            │
           ▼                            │
┌──────────────────────────────┐       │
│ Report Service               │       │
│ • Aggregate data             │       │
│ • Calculate average scores   │       │
│ • Build timeline             │       │
│ • Generate insights          │       │
└──────────┬───────────────────┘       │
           │                            │
           ├─→ OpenAI Service           │
           │   • Generate summary       │
           │   • Identify patterns      │
           │                            │
           ▼                            │
┌──────────────────────────────┐       │
│ Report Service               │       │
│ • Build report DTO           │       │
│ • Add metadata               │       │
│ • Cache report (30 min TTL)  │──────┘
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Interview Service            │
│ • Update interview status    │
│ • Set completedAt            │
└──────────┬───────────────────┘
           │
           ▼
Client Response
{
  success: true,
  data: {
    interview: {...},
    questions: [
      {
        question: {...},
        answer: {...},
        evaluation: {...}
      }
    ],
    averageScores: {
      technical: 7.5,
      communication: 8.0,
      leadership: 6.5,
      problemSolving: 8.2,
      confidence: 7.8,
      overall: 7.6
    },
    summary: {
      strengths: [...],
      weaknesses: [...],
      improvements: [...]
    },
    timeline: [...]
  }
}
```

---

## Dependency Injection Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              Dependency Injection Container                      │
└─────────────────────────────────────────────────────────────────┘

Application Startup
   │
   ▼
┌──────────────────────────────┐
│ DI Container Registration    │
│                              │
│ container.register(          │
│   'ILogger',                 │
│   { useClass: Logger }       │
│ )                            │
│                              │
│ container.register(          │
│   'IDatabase',               │
│   { useClass: SQLiteDB }     │
│ )                            │
│                              │
│ container.register(          │
│   'IInterviewRepository',    │
│   { useClass:                │
│      InterviewRepository }   │
│ )                            │
│                              │
│ ... (register all services)  │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Controller Resolution        │
│                              │
│ const controller =           │
│   container.resolve(         │
│     InterviewController      │
│   )                          │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│ Automatic Dependency Tree    │
│                              │
│ InterviewController          │
│   │                          │
│   ├─→ IInterviewService      │
│   │    │                     │
│   │    ├─→ IInterviewRepo    │
│   │    │    │                │
│   │    │    └─→ IDatabase    │
│   │    │                     │
│   │    ├─→ IQuestionService  │
│   │    │                     │
│   │    ├─→ ICacheService     │
│   │    │                     │
│   │    └─→ ILogger           │
│   │                          │
│   └─→ ILogger                │
│                              │
│ All dependencies resolved!   │
└──────────────────────────────┘
```

---

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Error Handling Chain                          │
└─────────────────────────────────────────────────────────────────┘

Error Occurs
   │
   ├─→ Repository Layer
   │   • Database error
   │   • Query failed
   │   │
   │   └─→ Throw DatabaseError
   │
   ├─→ Service Layer
   │   • Business rule violation
   │   • External service error
   │   │
   │   └─→ Wrap and throw
   │
   ├─→ Controller Layer
   │   • Pass to next(error)
   │
   │
   ▼
┌──────────────────────────────┐
│ Error Handler Middleware     │
│                              │
│ 1. Identify error type       │
│    • Operational             │
│    • Programming             │
│                              │
│ 2. Log error                 │
│    • Full stack (server)     │
│    • Sanitized (client)      │
│                              │
│ 3. Determine status code     │
│    • 400: Bad Request        │
│    • 401: Unauthorized       │
│    • 403: Forbidden          │
│    • 404: Not Found          │
│    • 409: Conflict           │
│    • 500: Server Error       │
│    • 503: Service Unavail    │
│                              │
│ 4. Format response           │
│    • Generic message (prod)  │
│    • Detailed (dev)          │
│                              │
│ 5. Send response             │
└──────────┬───────────────────┘
           │
           ▼
Client Error Response
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Invalid input",
    details: [
      {
        field: "experience",
        message: "Must be between 0 and 50"
      }
    ]
  },
  metadata: {
    timestamp: "...",
    requestId: "..."
  }
}
```

---

## Database Schema & Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                     Database Schema                              │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│    interviews        │
├──────────────────────┤
│ id (PK)              │
│ userId               │
│ topic                │
│ difficulty           │
│ experience           │
│ numberOfQuestions    │
│ jobDescription       │
│ status               │
│ createdAt            │
│ updatedAt            │
│ completedAt          │
└──────┬───────────────┘
       │
       │ 1:N
       │
       ▼
┌──────────────────────┐
│    questions         │
├──────────────────────┤
│ id (PK)              │
│ interviewId (FK) ────┼──┐
│ questionText         │  │
│ questionNumber       │  │
│ isFollowUp           │  │
│ parentQuestionId(FK) │◄─┘ (self-reference)
│ metadata             │
│ createdAt            │
└──────┬───────────────┘
       │
       │ 1:1
       │
       ▼
┌──────────────────────┐
│    answers           │
├──────────────────────┤
│ id (PK)              │
│ questionId (FK) ─────┤
│ answerText           │
│ transcriptData       │
│ durationSeconds      │
│ createdAt            │
└──────┬───────────────┘
       │
       │ 1:1
       │
       ▼
┌──────────────────────┐
│   evaluations        │
├──────────────────────┤
│ id (PK)              │
│ answerId (FK) ───────┤
│ technical            │
│ communication        │
│ leadership           │
│ problemSolving       │
│ confidence           │
│ strengths (JSON)     │
│ weaknesses (JSON)    │
│ missingPoints (JSON) │
│ improvements (JSON)  │
│ overallFeedback      │
│ createdAt            │
└──────────────────────┘

Indexes:
- interviews: userId, status, topic, createdAt
- questions: interviewId, parentQuestionId
- answers: questionId
- evaluations: answerId
```

---

## Service Communication Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│              Service Communication Patterns                      │
└─────────────────────────────────────────────────────────────────┘

Pattern 1: Direct Service Call
┌──────────────────┐     ┌──────────────────┐
│ Interview Service│────→│ Question Service │
└──────────────────┘     └──────────────────┘
    (Synchronous)

Pattern 2: Repository Orchestration
┌──────────────────┐
│ Report Service   │
└────────┬─────────┘
         │
         ├─→ Interview Repository
         ├─→ Question Repository
         ├─→ Answer Repository
         └─→ Evaluation Repository
    (Parallel queries)

Pattern 3: External Service with Retry
┌──────────────────┐     ┌──────────────────┐
│  Question Service│────→│  OpenAI Service  │
└──────────────────┘     └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │  Retry Logic     │
                         │  • Attempt 1     │
                         │  • Wait 1s       │
                         │  • Attempt 2     │
                         │  • Wait 2s       │
                         │  • Attempt 3     │
                         └──────────────────┘

Pattern 4: Cache-Aside
┌──────────────────┐     ┌──────────────────┐
│  Service         │────→│  Cache Service   │
└────────┬─────────┘     └──────────────────┘
         │                        │
         │ (Cache miss)           │
         │                        │
         └─→ Repository ──────────┘
              (Update cache)

Pattern 5: Transaction Pattern
┌──────────────────┐
│  Service         │
└────────┬─────────┘
         │
         ├─→ Begin Transaction
         ├─→ Repository Op 1
         ├─→ Repository Op 2
         ├─→ Repository Op 3
         │
         ├─→ Commit (success)
         └─→ Rollback (error)
```

---

## Caching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Caching Strategy                              │
└─────────────────────────────────────────────────────────────────┘

Cache Layers:

Level 1: In-Memory Cache (Node.js)
┌──────────────────────────────────────┐
│ • Interview details (5 min TTL)      │
│ • Question templates (1 hour TTL)    │
│ • User sessions (15 min TTL)         │
│ • Configuration (no expiry)          │
└──────────────────────────────────────┘

Level 2: Redis Cache (Future)
┌──────────────────────────────────────┐
│ • Generated reports (30 min TTL)     │
│ • User interview list (10 min TTL)   │
│ • Aggregated stats (1 hour TTL)      │
│ • API responses (vary by endpoint)   │
└──────────────────────────────────────┘

Cache Invalidation Strategy:

Event-Based:
• Interview updated → Clear interview cache
• Answer submitted → Clear report cache
• Evaluation created → Clear report cache

Time-Based (TTL):
• Short-lived: 5-15 minutes
• Medium: 30-60 minutes
• Long-lived: 2-24 hours

Manual Invalidation:
• Admin triggers
• Data corrections
• System updates
```

---

## OpenAI Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              OpenAI Service Architecture                         │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────┐
│   OpenAI Service             │
├──────────────────────────────┤
│                              │
│ ┌──────────────────────────┐│
│ │ Prompt Manager           ││
│ │ • Load templates         ││
│ │ • Inject context         ││
│ │ • Version control        ││
│ └──────────────────────────┘│
│                              │
│ ┌──────────────────────────┐│
│ │ API Client               ││
│ │ • Connection pool        ││
│ │ • Request queuing        ││
│ │ • Rate limiting          ││
│ └──────────────────────────┘│
│                              │
│ ┌──────────────────────────┐│
│ │ Response Parser          ││
│ │ • JSON extraction        ││
│ │ • Validation             ││
│ │ • Error handling         ││
│ └──────────────────────────┘│
│                              │
│ ┌──────────────────────────┐│
│ │ Circuit Breaker          ││
│ │ • Failure detection      ││
│ │ • Auto-recovery          ││
│ │ • Fallback responses     ││
│ └──────────────────────────┘│
│                              │
│ ┌──────────────────────────┐│
│ │ Retry Logic              ││
│ │ • Exponential backoff    ││
│ │ • Max attempts: 3        ││
│ │ • Timeout: 30s           ││
│ └──────────────────────────┘│
└──────────────────────────────┘

Request Flow:
1. Receive request → Build prompt
2. Check circuit breaker status
3. Queue request (rate limiting)
4. Call OpenAI API
5. Parse response
6. Validate output
7. Return result

Error Handling:
• Network error → Retry with backoff
• Rate limit → Queue and retry
• Invalid response → Log and throw
• Timeout → Retry or fail
• Service down → Circuit breaker opens
```

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Security Architecture                           │
└─────────────────────────────────────────────────────────────────┘

Request Security Pipeline:

1. Network Layer
   ┌──────────────────────┐
   │ • HTTPS only         │
   │ • TLS 1.3            │
   │ • Certificate pinning│
   └──────────────────────┘

2. Application Gateway
   ┌──────────────────────┐
   │ • CORS validation    │
   │ • Helmet headers     │
   │ • Rate limiting      │
   └──────────────────────┘

3. Authentication
   ┌──────────────────────┐
   │ • JWT verification   │
   │ • Token expiry check │
   │ • Refresh token flow │
   └──────────────────────┘

4. Authorization
   ┌──────────────────────┐
   │ • Role-based access  │
   │ • Resource ownership │
   │ • Permission check   │
   └──────────────────────┘

5. Input Validation
   ┌──────────────────────┐
   │ • Schema validation  │
   │ • Type checking      │
   │ • Sanitization       │
   │ • SQL injection prev │
   │ • XSS prevention     │
   └──────────────────────┘

6. Business Logic
   ┌──────────────────────┐
   │ • Business rules     │
   │ • Data access control│
   └──────────────────────┘

7. Data Layer
   ┌──────────────────────┐
   │ • Parameterized query│
   │ • Connection pooling │
   │ • Query timeout      │
   └──────────────────────┘

Security Headers (Helmet):
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security
- Content-Security-Policy
```

---

This visual architecture document complements the main architecture document and provides clear diagrams of system flow, component interaction, and data movement through the application.

