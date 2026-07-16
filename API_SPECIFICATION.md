# API Specification Document

## Document Overview

Comprehensive REST API specification for the AI Voice Interview Coach backend system.

**Base URL**: `/api/v1`  
**Content Type**: `application/json`  
**Authentication**: JWT Bearer Token

---

## Table of Contents

1. [API Conventions](#api-conventions)
2. [Authentication](#authentication)
3. [Interview Endpoints](#interview-endpoints)
4. [Question Endpoints](#question-endpoints)
5. [Answer Endpoints](#answer-endpoints)
6. [Evaluation Endpoints](#evaluation-endpoints)
7. [Report Endpoints](#report-endpoints)
8. [Error Responses](#error-responses)
9. [Rate Limiting](#rate-limiting)
10. [Pagination](#pagination)

---

## API Conventions

### Request Format

```json
{
  "field1": "value1",
  "field2": "value2"
}
```

### Response Format

**Success Response:**
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid",
    "version": "1.0"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": []
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PATCH, DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | External service down |

---

## Authentication

### Register User

```http
POST /api/v1/auth/register
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

### Refresh Token

```http
POST /api/v1/auth/refresh
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d"
  }
}
```

---

## Interview Endpoints

### Create Interview

```http
POST /api/v1/interviews
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "topic": "NodeJS",
  "difficulty": "Intermediate",
  "experience": 5,
  "numberOfQuestions": 10,
  "jobDescription": "We are looking for a Node.js developer..." // optional
}
```

**Validation Rules:**
- `topic`: Required, enum ["NodeJS", "Angular", "React", "MongoDB", "TypeScript", "SystemDesign", "TeamLead", "EngineeringManager", "HRInterview", "CustomTopic"]
- `difficulty`: Required, enum ["Beginner", "Intermediate", "Advanced", "Expert"]
- `experience`: Required, integer, min: 0, max: 50
- `numberOfQuestions`: Required, integer, min: 1, max: 50
- `jobDescription`: Optional, string, max: 5000 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "topic": "NodeJS",
    "difficulty": "Intermediate",
    "experience": 5,
    "numberOfQuestions": 10,
    "status": "InProgress",
    "progress": {
      "totalQuestions": 10,
      "answeredQuestions": 0,
      "evaluatedQuestions": 0,
      "percentComplete": 0
    },
    "createdAt": "2024-06-09T10:30:00.000Z"
  }
}
```

### Get Interview

```http
GET /api/v1/interviews/{id}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "topic": "NodeJS",
    "difficulty": "Intermediate",
    "experience": 5,
    "numberOfQuestions": 10,
    "jobDescription": "...",
    "status": "InProgress",
    "progress": {
      "totalQuestions": 10,
      "answeredQuestions": 5,
      "evaluatedQuestions": 3,
      "percentComplete": 50
    },
    "createdAt": "2024-06-09T10:30:00.000Z",
    "updatedAt": "2024-06-09T11:00:00.000Z",
    "completedAt": null
  }
}
```

### List Interviews

```http
GET /api/v1/interviews?page=1&limit=10&status=InProgress&topic=NodeJS&sort=-createdAt
Authorization: Bearer {token}
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `status`: Filter by status ["InProgress", "Completed", "Paused", "Cancelled"]
- `topic`: Filter by topic
- `difficulty`: Filter by difficulty
- `sort`: Sort field (prefix with - for descending, e.g., -createdAt)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "topic": "NodeJS",
      "difficulty": "Intermediate",
      "status": "InProgress",
      "progress": {
        "percentComplete": 50
      },
      "createdAt": "2024-06-09T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

### Update Interview

```http
PATCH /api/v1/interviews/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "Paused",
  "numberOfQuestions": 15
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "Paused",
    "numberOfQuestions": 15,
    "updatedAt": "2024-06-09T11:30:00.000Z"
  }
}
```

### Delete Interview

```http
DELETE /api/v1/interviews/{id}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Interview deleted successfully",
    "deletedId": "uuid"
  }
}
```

---

## Question Endpoints

### Generate Question

```http
POST /api/v1/questions/generate
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "interviewId": "uuid",
  "isFollowUp": false,
  "previousQuestions": ["Q1", "Q2", "Q3"]  // optional
}
```

**Validation Rules:**
- `interviewId`: Required, valid UUID
- `isFollowUp`: Optional, boolean (default: false)
- `previousQuestions`: Optional, array of strings

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "interviewId": "uuid",
    "questionText": "How does Node.js handle concurrency and what is the event loop?",
    "questionNumber": 4,
    "isFollowUp": false,
    "parentQuestionId": null,
    "createdAt": "2024-06-09T10:35:00.000Z"
  }
}
```

### Generate Follow-up Question

```http
POST /api/v1/questions/follow-up
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "interviewId": "uuid",
  "parentQuestionId": "uuid",
  "lastAnswerText": "Node.js uses an event-driven architecture..."
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "interviewId": "uuid",
    "questionText": "Can you provide a specific example of how you've used async/await in production?",
    "questionNumber": 5,
    "isFollowUp": true,
    "parentQuestionId": "uuid",
    "createdAt": "2024-06-09T10:40:00.000Z"
  }
}
```

### Get Question

```http
GET /api/v1/questions/{id}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "interviewId": "uuid",
    "questionText": "How does Node.js handle concurrency?",
    "questionNumber": 4,
    "isFollowUp": false,
    "parentQuestionId": null,
    "metadata": {
      "generatedBy": "GPT-4",
      "promptVersion": "1.0"
    },
    "createdAt": "2024-06-09T10:35:00.000Z"
  }
}
```

### List Questions by Interview

```http
GET /api/v1/interviews/{interviewId}/questions
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "questionText": "How does Node.js handle concurrency?",
      "questionNumber": 1,
      "isFollowUp": false,
      "hasAnswer": true,
      "hasEvaluation": true
    },
    {
      "id": "uuid",
      "questionText": "Can you explain the event loop?",
      "questionNumber": 2,
      "isFollowUp": false,
      "hasAnswer": true,
      "hasEvaluation": false
    }
  ]
}
```

---

## Answer Endpoints

### Submit Answer

```http
POST /api/v1/answers
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "questionId": "uuid",
  "answerText": "Node.js uses an event-driven, non-blocking I/O model...",
  "durationSeconds": 180,
  "transcriptData": {  // optional
    "segments": [
      {
        "text": "Node.js uses",
        "confidence": 0.95,
        "timestamp": 0
      }
    ],
    "averageConfidence": 0.92
  }
}
```

**Validation Rules:**
- `questionId`: Required, valid UUID
- `answerText`: Required, string, min: 10 characters, max: 10000 characters
- `durationSeconds`: Optional, integer, min: 0
- `transcriptData`: Optional, object

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "questionId": "uuid",
    "answerText": "Node.js uses an event-driven...",
    "durationSeconds": 180,
    "wordCount": 250,
    "createdAt": "2024-06-09T10:38:00.000Z"
  }
}
```

### Get Answer

```http
GET /api/v1/answers/{id}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "questionId": "uuid",
    "answerText": "Node.js uses an event-driven...",
    "transcriptData": {...},
    "durationSeconds": 180,
    "wordCount": 250,
    "createdAt": "2024-06-09T10:38:00.000Z"
  }
}
```

### Update Answer

```http
PATCH /api/v1/answers/{id}
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "answerText": "Updated answer text..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "answerText": "Updated answer text...",
    "updatedAt": "2024-06-09T10:40:00.000Z"
  }
}
```

---

## Evaluation Endpoints

### Evaluate Answer

```http
POST /api/v1/evaluations
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "answerId": "uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "answerId": "uuid",
    "scores": {
      "technical": 8,
      "communication": 7,
      "leadership": 6,
      "problemSolving": 8,
      "confidence": 7,
      "overall": 7.2
    },
    "feedback": {
      "strengths": [
        "Clear understanding of event loop",
        "Good explanation of non-blocking I/O",
        "Used relevant examples"
      ],
      "weaknesses": [
        "Could provide more real-world examples",
        "Lacked depth in worker threads discussion"
      ],
      "missingPoints": [
        "No mention of clustering",
        "Didn't discuss thread pool",
        "Missing error handling patterns"
      ],
      "improvements": [
        "Study Node.js clustering in detail",
        "Practice more code examples",
        "Learn about worker threads"
      ]
    },
    "overallFeedback": "Strong foundational understanding of Node.js concurrency model. The explanation of the event loop was accurate and well-structured. To improve, focus on practical applications and advanced topics like worker threads and clustering.",
    "createdAt": "2024-06-09T10:39:00.000Z"
  }
}
```

### Get Evaluation

```http
GET /api/v1/evaluations/{id}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "answerId": "uuid",
    "questionId": "uuid",
    "scores": {...},
    "feedback": {...},
    "overallFeedback": "...",
    "createdAt": "2024-06-09T10:39:00.000Z"
  }
}
```

### Recalculate Evaluation

```http
POST /api/v1/evaluations/{id}/recalculate
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "scores": {...},
    "feedback": {...},
    "updatedAt": "2024-06-09T11:00:00.000Z"
  }
}
```

---

## Report Endpoints

### Get Interview Report

```http
GET /api/v1/reports/{interviewId}
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "interview": {
      "id": "uuid",
      "topic": "NodeJS",
      "difficulty": "Intermediate",
      "experience": 5,
      "status": "Completed",
      "completedAt": "2024-06-09T12:00:00.000Z"
    },
    "questions": [
      {
        "question": {
          "id": "uuid",
          "questionText": "How does Node.js handle concurrency?",
          "questionNumber": 1
        },
        "answer": {
          "id": "uuid",
          "answerText": "...",
          "durationSeconds": 180
        },
        "evaluation": {
          "id": "uuid",
          "scores": {
            "technical": 8,
            "communication": 7,
            "leadership": 6,
            "problemSolving": 8,
            "confidence": 7,
            "overall": 7.2
          },
          "feedback": {...}
        }
      }
    ],
    "averageScores": {
      "technical": 7.8,
      "communication": 7.2,
      "leadership": 6.5,
      "problemSolving": 8.0,
      "confidence": 7.5,
      "overall": 7.4
    },
    "summary": {
      "strengths": [
        "Strong technical knowledge",
        "Clear communication",
        "Good problem-solving approach"
      ],
      "weaknesses": [
        "Need more practical examples",
        "Could improve on leadership topics"
      ],
      "improvements": [
        "Study real-world case studies",
        "Practice explaining complex topics simply",
        "Work on team leadership scenarios"
      ],
      "overallAssessment": "Solid performance with strong technical foundation..."
    },
    "statistics": {
      "totalQuestions": 10,
      "totalAnswers": 10,
      "totalEvaluations": 10,
      "averageDuration": 165,
      "totalDuration": 1650
    },
    "timeline": [
      {
        "timestamp": "2024-06-09T10:30:00.000Z",
        "event": "interview_started"
      },
      {
        "timestamp": "2024-06-09T10:35:00.000Z",
        "event": "question_generated",
        "questionNumber": 1
      },
      {
        "timestamp": "2024-06-09T10:38:00.000Z",
        "event": "answer_submitted",
        "questionNumber": 1
      }
    ]
  }
}
```

### Export Report

```http
POST /api/v1/reports/{interviewId}/export
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "format": "pdf" // or "json", "csv"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "downloadUrl": "https://api.example.com/downloads/report-uuid.pdf",
    "expiresAt": "2024-06-09T13:00:00.000Z",
    "format": "pdf",
    "size": 1048576
  }
}
```

### Get Report Summary

```http
GET /api/v1/reports/{interviewId}/summary
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "interviewId": "uuid",
    "overallScore": 7.4,
    "totalQuestions": 10,
    "completionRate": 100,
    "topStrengths": [
      "Technical knowledge",
      "Problem solving"
    ],
    "topWeaknesses": [
      "Leadership",
      "Real-world examples"
    ],
    "recommendation": "Focus on leadership development and practical experience"
  }
}
```

---

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "experience",
        "message": "Must be between 0 and 50",
        "value": 60
      },
      {
        "field": "numberOfQuestions",
        "message": "Required field missing"
      }
    ]
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

### Unauthorized Error (401)

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

### Not Found Error (404)

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Interview with id 'uuid' not found"
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

### Rate Limit Error (429)

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "limit": 100,
      "remaining": 0,
      "resetAt": "2024-06-09T11:00:00.000Z"
    }
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

### Server Error (500)

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  },
  "metadata": {
    "timestamp": "2024-06-09T10:30:00.000Z",
    "requestId": "uuid"
  }
}
```

---

## Rate Limiting

### Rate Limit Headers

All API responses include rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1623247200
```

### Rate Limit Tiers

| Endpoint | Limit | Window |
|----------|-------|--------|
| Global | 1000 requests | 15 minutes |
| Authentication | 10 requests | 15 minutes |
| Interview Creation | 10 requests | 1 hour |
| Question Generation | 30 requests | 1 hour |
| Answer Submission | 50 requests | 1 hour |
| Report Generation | 20 requests | 1 hour |

---

## Pagination

### Request Parameters

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `sort`: Sort field (prefix with - for descending)

### Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 95,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false
  },
  "links": {
    "first": "/api/v1/interviews?page=1&limit=10",
    "last": "/api/v1/interviews?page=10&limit=10",
    "next": "/api/v1/interviews?page=2&limit=10",
    "prev": null
  }
}
```

---

## Webhooks (Future Feature)

### Webhook Events

```json
{
  "event": "interview.completed",
  "timestamp": "2024-06-09T12:00:00.000Z",
  "data": {
    "interviewId": "uuid",
    "userId": "uuid",
    "overallScore": 7.4
  }
}
```

### Available Events

- `interview.started`
- `interview.completed`
- `interview.paused`
- `question.generated`
- `answer.submitted`
- `evaluation.completed`

---

## API Versioning Strategy

### Version Header (Alternative)

```http
GET /api/interviews
API-Version: 1.0
```

### Deprecation Notice

When an endpoint is deprecated:

```http
HTTP/1.1 200 OK
X-API-Deprecation: version=1.0, sunset=2025-01-01
X-API-Deprecation-Info: https://api.example.com/docs/deprecation/v1
```

---

## Testing the API

### Using cURL

```bash
# Create interview
curl -X POST https://api.example.com/api/v1/interviews \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "NodeJS",
    "difficulty": "Intermediate",
    "experience": 5,
    "numberOfQuestions": 10
  }'

# Get interview
curl -X GET https://api.example.com/api/v1/interviews/uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# List interviews
curl -X GET "https://api.example.com/api/v1/interviews?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using JavaScript (fetch)

```javascript
// Create interview
const response = await fetch('https://api.example.com/api/v1/interviews', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'NodeJS',
    difficulty: 'Intermediate',
    experience: 5,
    numberOfQuestions: 10
  })
});

const data = await response.json();
```

---

**API Version**: 1.0  
**Last Updated**: June 9, 2026  
**Maintainer**: Backend Team
