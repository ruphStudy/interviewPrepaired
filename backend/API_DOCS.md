# API Documentation

Base URL: `http://localhost:5000/api/v1`

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

---

## Auth Endpoints

### Register User

**POST** `/auth/register`

Create a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user"
    }
  }
}
```

### Login

**POST** `/auth/login`

Authenticate and get JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

### Get Current User

**GET** `/auth/me` 🔒

Get the currently authenticated user.

**Response (200):**
```json
{
  "success": true,
  "message": "User retrieved successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user",
    "preferences": {
      "notifications": true,
      "theme": "auto"
    },
    "stats": {
      "totalInterviews": 15,
      "completedInterviews": 12,
      "averageScore": 8.3
    }
  }
}
```

---

## Interview Endpoints

### Create Interview

**POST** `/interviews` 🔒

Create a new interview session.

**Request Body:**
```json
{
  "type": "technical",
  "difficulty": "intermediate",
  "topic": "React Hooks",
  "customInstructions": "Focus on useState and useEffect"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Interview created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "type": "technical",
    "difficulty": "intermediate",
    "topic": "React Hooks",
    "status": "created",
    "questions": [],
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Get User Interviews

**GET** `/interviews?page=1&limit=10&type=technical&status=completed` 🔒

Get all interviews for the authenticated user with optional filters.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `type` (optional): Filter by interview type
- `status` (optional): Filter by status
- `difficulty` (optional): Filter by difficulty

**Response (200):**
```json
{
  "success": true,
  "message": "Interviews retrieved successfully",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "type": "technical",
      "topic": "React Hooks",
      "status": "evaluated",
      "evaluation": {
        "overallScore": 8.5,
        "grade": "A"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "metadata": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 15,
      "pages": 2
    }
  }
}
```

### Start Interview

**POST** `/interviews/:id/start` 🔒

Start an interview and generate the first question.

**Response (200):**
```json
{
  "success": true,
  "message": "Interview started successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "status": "in-progress",
    "startedAt": "2024-01-15T10:35:00.000Z",
    "questions": [
      {
        "id": "q-1705318500000",
        "text": "What are React Hooks and why were they introduced?",
        "askedAt": "2024-01-15T10:35:00.000Z"
      }
    ]
  }
}
```

### Submit Answer

**POST** `/interviews/:id/answer` 🔒

Submit an answer to a question.

**Request Body:**
```json
{
  "questionId": "q-1705318500000",
  "answer": "React Hooks are functions that let you use state and other React features...",
  "transcriptionConfidence": 0.95,
  "duration": 45,
  "audioUrl": "https://..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Answer submitted successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "questions": [
      {
        "id": "q-1705318500000",
        "text": "What are React Hooks...",
        "answer": {
          "text": "React Hooks are functions...",
          "transcriptionConfidence": 0.95,
          "duration": 45,
          "answeredAt": "2024-01-15T10:36:00.000Z"
        }
      }
    ]
  }
}
```

### Generate Next Question

**POST** `/interviews/:id/question` 🔒

Generate the next interview question.

**Response (200):**
```json
{
  "success": true,
  "message": "Question generated successfully",
  "data": {
    "questions": [
      {
        "id": "q-1705318600000",
        "text": "Can you explain the difference between useState and useReducer?",
        "askedAt": "2024-01-15T10:37:00.000Z"
      }
    ]
  }
}
```

### Complete Interview

**POST** `/interviews/:id/complete` 🔒

Mark the interview as completed.

**Response (200):**
```json
{
  "success": true,
  "message": "Interview completed successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "status": "completed",
    "completedAt": "2024-01-15T10:45:00.000Z",
    "totalDuration": 600
  }
}
```

### Evaluate Interview

**POST** `/interviews/:id/evaluate` 🔒

Evaluate the interview using AI.

**Response (200):**
```json
{
  "success": true,
  "message": "Interview evaluated successfully",
  "data": {
    "status": "evaluated",
    "evaluation": {
      "overallScore": 8.5,
      "grade": "A",
      "breakdown": {
        "technicalKnowledge": 9.0,
        "communication": 8.5,
        "leadership": 7.5,
        "problemSolving": 8.5,
        "confidence": 8.5
      },
      "strengths": [
        "Clear understanding of React Hooks concepts",
        "Good communication and articulation"
      ],
      "weaknesses": [
        "Could provide more real-world examples"
      ],
      "suggestions": [
        "Practice explaining concepts with concrete examples"
      ],
      "recommendedTopics": [
        "Custom Hooks",
        "useCallback and useMemo optimization"
      ],
      "detailedFeedback": "You demonstrated strong knowledge...",
      "evaluatedAt": "2024-01-15T10:46:00.000Z",
      "model": "gpt-4",
      "tokensUsed": 1250,
      "cost": 0.075
    }
  }
}
```

### Get Interview Stats

**GET** `/interviews/stats` 🔒

Get statistics about user's interviews.

**Response (200):**
```json
{
  "success": true,
  "message": "Interview stats retrieved successfully",
  "data": {
    "totalInterviews": 15,
    "completedInterviews": 12,
    "evaluatedInterviews": 10,
    "averageScore": 8.3,
    "typeBreakdown": {
      "technical": 8,
      "behavioral": 4,
      "leadership": 3
    },
    "averageScoreByType": {
      "technical": 8.5,
      "behavioral": 8.0,
      "leadership": 8.2
    }
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email",
      "value": "invalid-email"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Server Error"
}
```

---

## Rate Limiting

- **Window**: 15 minutes
- **Max Requests**: 100 per window
- **Applies to**: All `/api/*` endpoints

---

## Data Types

### Interview Types
- `technical`
- `behavioral`
- `leadership`
- `managerial`
- `system-design`
- `coding`
- `product`
- `general`

### Difficulty Levels
- `beginner`
- `intermediate`
- `advanced`
- `expert`

### Interview Statuses
- `created`
- `in-progress`
- `paused`
- `completed`
- `evaluated`
- `archived`

### Grades
- `A+` (9.5-10)
- `A` (8.5-9.4)
- `B` (7.0-8.4)
- `C` (5.0-6.9)
- `D` (3.0-4.9)
- `F` (0-2.9)
