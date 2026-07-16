# OpenAI Service - Complete Integration Guide

## Overview

Production-ready OpenAI integration service with retry logic, error handling, and JSON-only responses. Supports 9 interview topics with 4 core methods.

**File**: `OpenAIService.ts`  
**Lines**: 750+  
**SDK**: OpenAI Node SDK v4+  
**Language**: TypeScript

---

## Features

✅ **4 Core Methods**
- `generateQuestion()` - Generate interview questions
- `generateFollowUpQuestion()` - Generate intelligent follow-ups
- `evaluateAnswer()` - Score candidate answers (0-10 scale)
- `generateFinalReport()` - Comprehensive interview report

✅ **9 Interview Topics**
- Node.js, Angular, React, MongoDB, TypeScript
- System Design, Team Lead, Engineering Manager, HR Interview

✅ **Retry Logic**
- Exponential backoff (1s → 2s → 4s)
- Max 3 attempts per request
- Handles rate limits, timeouts, server errors

✅ **Error Handling**
- Specific error messages for each failure type
- Graceful degradation
- Connection testing

✅ **Type Safety**
- Complete TypeScript interfaces
- Request/response validation
- Compile-time type checking

✅ **JSON Responses Only**
- Structured output format
- Schema validation
- No markdown or plain text

---

## Installation

```bash
npm install openai
```

**Environment Variables**:
```env
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL=gpt-4  # Optional, defaults to gpt-4
```

---

## Quick Start

```typescript
import { OpenAIService, getOpenAIService } from './services/OpenAIService';

// Option 1: Singleton (recommended)
const aiService = getOpenAIService();

// Option 2: New instance
const aiService = new OpenAIService();

// Test connection
const isConnected = await aiService.testConnection();
console.log('OpenAI connected:', isConnected);

// Generate question
const question = await aiService.generateQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  experienceYears: 3,
});

console.log(question.question);
// "Explain the difference between useMemo and useCallback..."
```

---

## API Reference

### 1. generateQuestion()

Generate an interview question based on topic and difficulty.

**Signature**:
```typescript
async generateQuestion(request: QuestionRequest): Promise<QuestionResponse>
```

**Request**:
```typescript
interface QuestionRequest {
  topic: InterviewTopic;              // Required
  difficulty: DifficultyLevel;        // Required
  experienceYears: number;            // Required
  previousQuestions?: string[];       // Optional
  jobDescription?: string;            // Optional
}
```

**Response**:
```typescript
interface QuestionResponse {
  question: string;
  expectedPoints: string[];
  followUpTopics: string[];
}
```

**Example**:
```typescript
const result = await aiService.generateQuestion({
  topic: 'Node.js',
  difficulty: 'advanced',
  experienceYears: 5,
  previousQuestions: [
    'Explain the event loop',
    'What are streams in Node.js?'
  ],
  jobDescription: 'Senior Backend Engineer role using Express and MongoDB'
});

console.log(result);
// {
//   question: "Design a scalable Node.js microservice architecture...",
//   expectedPoints: [
//     "Load balancing strategies",
//     "Service discovery",
//     "Inter-service communication"
//   ],
//   followUpTopics: [
//     "Circuit breaker pattern",
//     "Message queues"
//   ]
// }
```

---

### 2. generateFollowUpQuestion()

Generate an intelligent follow-up question based on candidate's answer.

**Signature**:
```typescript
async generateFollowUpQuestion(
  request: FollowUpQuestionRequest
): Promise<FollowUpQuestionResponse>
```

**Request**:
```typescript
interface FollowUpQuestionRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  originalQuestion: string;
  answer: string;
  experienceYears: number;
}
```

**Response**:
```typescript
interface FollowUpQuestionResponse {
  question: string;
  reason: string;
}
```

**Example**:
```typescript
const followUp = await aiService.generateFollowUpQuestion({
  topic: 'React',
  difficulty: 'intermediate',
  originalQuestion: 'What are React Hooks?',
  answer: 'React Hooks are functions that let you use state and lifecycle features in functional components. The main hooks are useState and useEffect.',
  experienceYears: 3
});

console.log(followUp);
// {
//   question: "Can you explain a scenario where you'd use useReducer instead of useState?",
//   reason: "Tests deeper understanding of state management patterns and when complex state logic is needed"
// }
```

---

### 3. evaluateAnswer()

Evaluate a candidate's answer with detailed scoring and feedback.

**Signature**:
```typescript
async evaluateAnswer(request: EvaluationRequest): Promise<EvaluationResponse>
```

**Request**:
```typescript
interface EvaluationRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  question: string;
  answer: string;
  experienceYears: number;
}
```

**Response**:
```typescript
interface EvaluationResponse {
  technicalScore: number;        // 0-10
  communicationScore: number;    // 0-10
  leadershipScore: number;       // 0-10
  problemSolvingScore: number;   // 0-10
  confidenceScore: number;       // 0-10
  overallScore: number;          // 0-10 (weighted average)
  strengths: string[];           // 2-4 items
  weaknesses: string[];          // 2-4 items
  suggestions: string[];         // 2-4 items
  missingPoints: string[];       // Key points not covered
}
```

**Example**:
```typescript
const evaluation = await aiService.evaluateAnswer({
  topic: 'MongoDB',
  difficulty: 'intermediate',
  question: 'Explain the difference between embedded and referenced documents',
  answer: 'Embedded documents store related data within a single document, while referenced documents store data in separate collections with references...',
  experienceYears: 4
});

console.log(evaluation);
// {
//   technicalScore: 8.5,
//   communicationScore: 9.0,
//   leadershipScore: 7.0,
//   problemSolvingScore: 8.0,
//   confidenceScore: 8.5,
//   overallScore: 8.2,
//   strengths: [
//     "Clear explanation of both approaches",
//     "Good understanding of trade-offs",
//     "Mentioned performance implications"
//   ],
//   weaknesses: [
//     "Could elaborate on when to use each approach",
//     "Missing discussion of atomicity"
//   ],
//   suggestions: [
//     "Study MongoDB transactions in depth",
//     "Practice schema design patterns",
//     "Review aggregation pipeline for referenced docs"
//   ],
//   missingPoints: [
//     "Document size limitations (16MB)",
//     "Update performance differences"
//   ]
// }
```

---

### 4. generateFinalReport()

Generate comprehensive final interview report with overall assessment.

**Signature**:
```typescript
async generateFinalReport(request: FinalReportRequest): Promise<FinalReportResponse>
```

**Request**:
```typescript
interface FinalReportRequest {
  topic: InterviewTopic;
  difficulty: DifficultyLevel;
  experienceYears: number;
  evaluations: Array<{
    question: string;
    answer: string;
    evaluation: EvaluationResponse;
  }>;
}
```

**Response**:
```typescript
interface FinalReportResponse {
  overallScore: number;           // 0-10
  summary: string;                // 2-3 paragraphs
  recommendations: string[];      // 3-5 items
  strengthsOverview: string[];    // 3-5 items
  weaknessesOverview: string[];   // 3-5 items
  nextSteps: string[];            // 3-5 items
}
```

**Example**:
```typescript
const report = await aiService.generateFinalReport({
  topic: 'TypeScript',
  difficulty: 'advanced',
  experienceYears: 6,
  evaluations: [
    {
      question: 'Explain TypeScript generics',
      answer: 'Generics allow you to create reusable components...',
      evaluation: { /* scores */ }
    },
    {
      question: 'What are utility types?',
      answer: 'Utility types are built-in TypeScript types...',
      evaluation: { /* scores */ }
    },
    // ... more evaluations
  ]
});

console.log(report);
// {
//   overallScore: 8.5,
//   summary: "The candidate demonstrated strong TypeScript knowledge with excellent understanding of advanced concepts. Communication was clear and examples were relevant. Shows readiness for senior-level TypeScript work with some areas for refinement in edge cases and advanced type manipulations.",
//   recommendations: [
//     "Deep dive into conditional types and type inference",
//     "Practice building complex type utilities",
//     "Study TypeScript compiler internals",
//     "Contribute to DefinitelyTyped project"
//   ],
//   strengthsOverview: [
//     "Solid grasp of generics and constraints",
//     "Clear communication of complex concepts",
//     "Good understanding of practical applications"
//   ],
//   weaknessesOverview: [
//     "Could improve on advanced mapped types",
//     "Limited knowledge of template literal types"
//   ],
//   nextSteps: [
//     "Complete TypeScript advanced course",
//     "Build type-safe API client library",
//     "Study real-world TypeScript codebases"
//   ]
// }
```

---

## Complete Workflow Example

```typescript
import { getOpenAIService } from './services/OpenAIService';

async function conductInterview() {
  const aiService = getOpenAIService();
  
  // 1. Test connection
  const connected = await aiService.testConnection();
  if (!connected) {
    throw new Error('Failed to connect to OpenAI');
  }

  // 2. Generate first question
  const q1 = await aiService.generateQuestion({
    topic: 'React',
    difficulty: 'intermediate',
    experienceYears: 3
  });
  console.log('Question 1:', q1.question);

  // Simulate candidate answer
  const answer1 = "React is a JavaScript library for building user interfaces...";

  // 3. Evaluate first answer
  const eval1 = await aiService.evaluateAnswer({
    topic: 'React',
    difficulty: 'intermediate',
    question: q1.question,
    answer: answer1,
    experienceYears: 3
  });
  console.log('Score:', eval1.overallScore);

  // 4. Generate follow-up
  const followUp = await aiService.generateFollowUpQuestion({
    topic: 'React',
    difficulty: 'intermediate',
    originalQuestion: q1.question,
    answer: answer1,
    experienceYears: 3
  });
  console.log('Follow-up:', followUp.question);

  // 5. Generate second question
  const q2 = await aiService.generateQuestion({
    topic: 'React',
    difficulty: 'intermediate',
    experienceYears: 3,
    previousQuestions: [q1.question, followUp.question]
  });

  // Continue for all questions...

  // 6. Generate final report
  const report = await aiService.generateFinalReport({
    topic: 'React',
    difficulty: 'intermediate',
    experienceYears: 3,
    evaluations: [
      { question: q1.question, answer: answer1, evaluation: eval1 },
      // ... more evaluations
    ]
  });

  console.log('Final Report:', report);
}

conductInterview().catch(console.error);
```

---

## Error Handling

### Error Types

```typescript
try {
  const result = await aiService.generateQuestion(request);
} catch (error) {
  if (error.message.includes('authentication failed')) {
    // Invalid API key
    console.error('Check OPENAI_API_KEY in environment');
  } else if (error.message.includes('rate limit')) {
    // Too many requests
    console.error('Wait before retrying');
  } else if (error.message.includes('temporarily unavailable')) {
    // OpenAI service down
    console.error('Try again later');
  } else {
    // Other errors
    console.error('OpenAI error:', error.message);
  }
}
```

### Retry Behavior

The service automatically retries on:
- **429** - Rate limit exceeded
- **500** - Internal server error
- **502** - Bad gateway
- **503** - Service unavailable
- **ETIMEDOUT** - Request timeout
- **ECONNRESET** - Connection reset

**Retry Strategy**:
```
Attempt 1: Immediate
Attempt 2: Wait 1000ms
Attempt 3: Wait 2000ms
Attempt 4: Fail with error
```

---

## Configuration

### Environment Variables

```env
# Required
OPENAI_API_KEY=sk-your-api-key-here

# Optional (with defaults)
OPENAI_MODEL=gpt-4              # AI model to use
OPENAI_MAX_RETRIES=3            # Max retry attempts
OPENAI_TIMEOUT=60000            # Request timeout (ms)
OPENAI_TEMPERATURE=0.7          # Response creativity (0-2)
```

### Runtime Configuration

```typescript
const aiService = new OpenAIService();

// Change model
aiService.setModel('gpt-3.5-turbo');

// Change temperature (0 = deterministic, 2 = creative)
aiService.setTemperature(0.5);

// Get current config
const config = aiService.getConfig();
console.log(config);
// {
//   apiKey: 'sk-***',
//   model: 'gpt-4',
//   maxRetries: 3,
//   timeout: 60000,
//   temperature: 0.7
// }
```

---

## Interview Topics

### Technical Topics

**Node.js**
- Event loop, async/await, streams, Express
- Middleware, error handling, performance
- Microservices, testing, deployment

**Angular**
- Components, services, dependency injection
- RxJS, routing, forms, change detection
- State management, testing

**React**
- Components, hooks, state, lifecycle
- Context API, performance, testing
- Custom hooks, patterns

**MongoDB**
- Documents, collections, CRUD, indexes
- Aggregation, schema design, transactions
- Replication, sharding, optimization

**TypeScript**
- Types, interfaces, generics
- Utility types, type guards, decorators
- Advanced patterns, best practices

**System Design**
- Scalability, load balancing, caching
- Databases, microservices, APIs
- Monitoring, high availability, trade-offs

### Leadership Topics

**Team Lead**
- Team management, mentoring
- Code review, technical decisions
- Conflict resolution, delegation

**Engineering Manager**
- People management, hiring
- Performance reviews, career development
- Strategic planning, roadmap, metrics

**HR Interview**
- Behavioral questions, STAR method
- Teamwork, communication, adaptability
- Career goals, cultural fit

---

## Performance & Costs

### Response Times

| Method | Avg Time | Max Tokens |
|--------|----------|------------|
| generateQuestion | 2-4s | 800 |
| generateFollowUpQuestion | 1-3s | 500 |
| evaluateAnswer | 3-6s | 1500 |
| generateFinalReport | 4-8s | 2000 |

### OpenAI Costs (GPT-4)

| Method | Input Tokens | Output Tokens | Cost per Call |
|--------|--------------|---------------|---------------|
| generateQuestion | ~400 | ~300 | ~$0.03 |
| generateFollowUpQuestion | ~300 | ~200 | ~$0.02 |
| evaluateAnswer | ~500 | ~600 | ~$0.05 |
| generateFinalReport | ~1000 | ~800 | ~$0.08 |

**Total per 5-question interview**: ~$0.25 - $0.35

### Cost Optimization

```typescript
// Use GPT-3.5-turbo for questions (95% cheaper)
aiService.setModel('gpt-3.5-turbo');
const question = await aiService.generateQuestion(request);

// Use GPT-4 for evaluations (better quality)
aiService.setModel('gpt-4');
const evaluation = await aiService.evaluateAnswer(request);
```

---

## Testing

```typescript
import { OpenAIService } from './services/OpenAIService';

describe('OpenAIService', () => {
  let service: OpenAIService;

  beforeEach(() => {
    service = new OpenAIService();
  });

  it('should connect to OpenAI', async () => {
    const connected = await service.testConnection();
    expect(connected).toBe(true);
  });

  it('should generate question', async () => {
    const result = await service.generateQuestion({
      topic: 'React',
      difficulty: 'intermediate',
      experienceYears: 3
    });

    expect(result.question).toBeDefined();
    expect(result.expectedPoints).toBeInstanceOf(Array);
    expect(result.followUpTopics).toBeInstanceOf(Array);
  });

  it('should evaluate answer', async () => {
    const result = await service.evaluateAnswer({
      topic: 'React',
      difficulty: 'intermediate',
      question: 'What are React Hooks?',
      answer: 'React Hooks are...',
      experienceYears: 3
    });

    expect(result.technicalScore).toBeGreaterThanOrEqual(0);
    expect(result.technicalScore).toBeLessThanOrEqual(10);
    expect(result.overallScore).toBeDefined();
  });
});
```

---

## Best Practices

1. **Use Singleton**: Use `getOpenAIService()` for single instance
2. **Handle Errors**: Always wrap calls in try-catch
3. **Test Connection**: Call `testConnection()` before interview
4. **Avoid Duplicates**: Pass previousQuestions array
5. **Validate Responses**: Service validates JSON automatically
6. **Monitor Costs**: Track API usage in production
7. **Cache Results**: Cache questions for same parameters
8. **Set Timeouts**: Configure appropriate timeout values
9. **Rate Limiting**: Implement client-side rate limiting
10. **Error Recovery**: Handle retries gracefully

---

## Advanced Usage

### Custom Prompts

```typescript
// For specific job requirements
const question = await aiService.generateQuestion({
  topic: 'Node.js',
  difficulty: 'expert',
  experienceYears: 8,
  jobDescription: 'Lead Backend Architect for fintech startup. Must have experience with high-frequency trading systems, real-time data processing, and regulatory compliance.'
});
```

### Batch Processing

```typescript
const questions = await Promise.all([
  aiService.generateQuestion({ topic: 'React', difficulty: 'intermediate', experienceYears: 3 }),
  aiService.generateQuestion({ topic: 'TypeScript', difficulty: 'intermediate', experienceYears: 3 }),
  aiService.generateQuestion({ topic: 'Node.js', difficulty: 'intermediate', experienceYears: 3 })
]);
```

### Progressive Difficulty

```typescript
let difficulty: DifficultyLevel = 'beginner';

// Increase difficulty if score is high
if (evaluation.overallScore >= 8) {
  difficulty = 'intermediate';
}
if (evaluation.overallScore >= 9) {
  difficulty = 'advanced';
}

const nextQuestion = await aiService.generateQuestion({
  topic: 'React',
  difficulty,
  experienceYears: 3
});
```

---

## Troubleshooting

### Connection Issues

```typescript
const connected = await aiService.testConnection();
if (!connected) {
  console.error('Check:');
  console.error('1. OPENAI_API_KEY is set');
  console.error('2. API key is valid');
  console.error('3. Internet connection');
  console.error('4. OpenAI service status');
}
```

### Invalid Responses

If validation fails, check:
1. OpenAI model supports JSON mode (GPT-4, GPT-3.5-turbo)
2. Temperature not too high (keep < 1.0)
3. Max tokens sufficient for response

### Rate Limits

```typescript
// Implement exponential backoff
let delay = 1000;
let attempts = 0;

while (attempts < 5) {
  try {
    const result = await aiService.generateQuestion(request);
    break;
  } catch (error) {
    if (error.message.includes('rate limit')) {
      await sleep(delay);
      delay *= 2;
      attempts++;
    } else {
      throw error;
    }
  }
}
```

---

## Summary

✅ **750+ lines** of production-ready code  
✅ **4 core methods** with full functionality  
✅ **9 interview topics** with context  
✅ **Complete type safety** with TypeScript  
✅ **Automatic retry logic** with exponential backoff  
✅ **JSON-only responses** with validation  
✅ **Error handling** for all scenarios  
✅ **Environment variable** configuration  
✅ **Singleton pattern** for efficiency  
✅ **Test connection** method  
✅ **Configurable** model and temperature  

**Ready for production deployment!**
