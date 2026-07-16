# AI Voice Interview Coach - Backend

Production-ready Node.js backend for AI-powered interview preparation application.

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript 5.x
- **Database**: MongoDB 7.0+ with Mongoose 8.x
- **AI**: OpenAI API (GPT-3.5-turbo, GPT-4)
- **Authentication**: JWT
- **Validation**: Express-validator
- **Logging**: Winston

## Architecture

Clean Architecture with 4 layers:

```
src/
├── config/          # Configuration (database, environment)
├── controllers/     # HTTP request handlers
├── middleware/      # Express middleware (auth, logging, error handling)
├── models/          # Mongoose schemas
├── routes/          # API route definitions
├── services/        # Business logic
├── utils/           # Utility functions
├── types/           # TypeScript types
├── app.ts          # Express app configuration
└── server.ts       # Server entry point
```

## Features

- ✅ User authentication (JWT)
- ✅ Interview management (CRUD operations)
- ✅ AI-powered question generation (GPT-3.5-turbo)
- ✅ AI-powered evaluation (GPT-4)
- ✅ Voice transcription support
- ✅ Real-time interview state management
- ✅ Comprehensive error handling
- ✅ Request validation
- ✅ Rate limiting
- ✅ Logging (Winston)
- ✅ MongoDB embedded document approach

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure environment variables
# Edit .env with your values
```

## Environment Variables

```env
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/interview-coach
MONGODB_URI_PROD=mongodb+srv://...

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRE=7d

# OpenAI
OPENAI_API_KEY=sk-...

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## Development

```bash
# Start development server
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Run tests
npm test
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user
- `PUT /api/v1/auth/profile` - Update profile
- `PUT /api/v1/auth/password` - Update password
- `POST /api/v1/auth/forgot-password` - Request password reset
- `PUT /api/v1/auth/reset-password/:token` - Reset password

### Users

- `GET /api/v1/users` - Get all users (admin)
- `GET /api/v1/users/stats` - Get user statistics
- `GET /api/v1/users/:id` - Get user by ID
- `PUT /api/v1/users/:id` - Update user
- `DELETE /api/v1/users/:id` - Delete user (admin)

### Interviews

- `POST /api/v1/interviews` - Create new interview
- `GET /api/v1/interviews` - Get user's interviews
- `GET /api/v1/interviews/stats` - Get interview statistics
- `GET /api/v1/interviews/:id` - Get interview by ID
- `POST /api/v1/interviews/:id/start` - Start interview
- `POST /api/v1/interviews/:id/pause` - Pause interview
- `POST /api/v1/interviews/:id/resume` - Resume interview
- `POST /api/v1/interviews/:id/answer` - Submit answer
- `POST /api/v1/interviews/:id/question` - Generate next question
- `POST /api/v1/interviews/:id/complete` - Complete interview
- `POST /api/v1/interviews/:id/evaluate` - Evaluate interview
- `DELETE /api/v1/interviews/:id` - Delete interview

## Request Examples

### Create Interview

```bash
POST /api/v1/interviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "technical",
  "difficulty": "intermediate",
  "topic": "React Hooks",
  "customInstructions": "Focus on useState and useEffect"
}
```

### Submit Answer

```bash
POST /api/v1/interviews/:id/answer
Authorization: Bearer <token>
Content-Type: application/json

{
  "questionId": "q-1234567890",
  "answer": "React Hooks are functions that...",
  "transcriptionConfidence": 0.95,
  "duration": 45,
  "audioUrl": "https://..."
}
```

## Database Schema

MongoDB embedded document approach (Approach B):

```typescript
Interview {
  _id: ObjectId
  userId: string
  type: enum
  difficulty: enum
  topic: string
  status: enum
  questions: [
    {
      id: string
      text: string
      askedAt: Date
      answer: {
        text: string
        transcriptionConfidence: number
        duration: number
        answeredAt: Date
      }
    }
  ]
  evaluation: {
    overallScore: number
    grade: string
    breakdown: {
      technicalKnowledge: number
      communication: number
      leadership: number
      problemSolving: number
      confidence: number
    }
    strengths: string[]
    weaknesses: string[]
    suggestions: string[]
  }
  createdAt: Date
  updatedAt: Date
}
```

## OpenAI Integration

### Question Generation (GPT-3.5-turbo)

- Cost: ~$0.0005 per question
- Temperature: 0.8 (creative)
- Max tokens: 500

### Evaluation (GPT-4)

- Cost: ~$0.08 per evaluation
- Temperature: 0.3 (deterministic)
- Max tokens: 2000

### Cost Optimization

- Use GPT-3.5 for questions (saves 95%)
- Use GPT-4 for evaluations (better quality)
- Average cost per interview: $0.45-0.60

## Error Handling

Global error handling middleware catches:

- Mongoose CastError → 404 Resource not found
- Mongoose ValidationError → 400 Validation error
- Duplicate key errors → 400 Duplicate field
- JWT errors → 401 Invalid/expired token
- Custom ApiError → Custom status code

## Logging

Winston logger with:

- Console transport (development)
- File transport (production)
- Error log: `logs/error.log`
- Combined log: `logs/combined.log`

## Security

- Helmet.js for security headers
- CORS configuration
- Rate limiting (100 requests per 15 minutes)
- JWT authentication
- Password hashing (bcrypt)
- Input validation and sanitization

## Performance

- MongoDB indexes for fast queries
- Connection pooling (10 connections)
- Response compression
- Embedded documents (10-15x faster reads)

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Deployment

```bash
# Build for production
npm run build

# Start production server
NODE_ENV=production npm start
```

## License

MIT
