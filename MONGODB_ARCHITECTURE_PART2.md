# MongoDB Architecture - Part 2: Advanced Strategies

## Indexing Strategy

### Overview

Indexes improve query performance but come with overhead for writes. Strategic indexing is crucial for production performance.

### Index Types Used

1. **Single Field Indexes**: Fast lookups on one field
2. **Compound Indexes**: Multi-field queries
3. **Text Indexes**: Full-text search capabilities
4. **Sparse Indexes**: Only index documents with field present
5. **Unique Indexes**: Ensure uniqueness

---

### Approach B (Embedded) - Index Strategy

```typescript
// InterviewAggregate Collection Indexes

// 1. User queries - most common
db.interviews_aggregate.createIndex(
  { userId: 1, createdAt: -1 },
  { name: 'idx_user_created' }
);

// 2. Status filtering
db.interviews_aggregate.createIndex(
  { userId: 1, status: 1 },
  { name: 'idx_user_status' }
);

// 3. Topic and difficulty filtering
db.interviews_aggregate.createIndex(
  { topic: 1, difficulty: 1 },
  { name: 'idx_topic_difficulty' }
);

// 4. Overall score sorting (for leaderboards)
db.interviews_aggregate.createIndex(
  { 'report.averageScores.overall': -1 },
  { name: 'idx_overall_score' }
);

// 5. Soft delete support
db.interviews_aggregate.createIndex(
  { deletedAt: 1 },
  { sparse: true, name: 'idx_deleted' }
);

// 6. Recent interviews
db.interviews_aggregate.createIndex(
  { status: 1, createdAt: -1 },
  { name: 'idx_status_created' }
);

// 7. Interview type filtering
db.interviews_aggregate.createIndex(
  { userId: 1, interviewType: 1, createdAt: -1 },
  { name: 'idx_user_type_created' }
);

// 8. Completed interviews with scores
db.interviews_aggregate.createIndex(
  { 
    userId: 1, 
    status: 1, 
    'report.averageScores.overall': -1 
  },
  { 
    name: 'idx_user_status_score',
    partialFilterExpression: { status: 'completed' }
  }
);

// 9. Text search on job description
db.interviews_aggregate.createIndex(
  { jobDescription: 'text', topic: 'text' },
  { name: 'idx_text_search' }
);

// 10. Question text search within interview
db.interviews_aggregate.createIndex(
  { 'questions.questionText': 'text' },
  { name: 'idx_question_text' }
);
```

### Index Usage Patterns

```typescript
// Query 1: Get user's recent interviews
// Uses: idx_user_created
await InterviewAggregate.find({ userId })
  .sort({ createdAt: -1 })
  .limit(10);

// Query 2: Get in-progress interviews
// Uses: idx_user_status
await InterviewAggregate.find({ 
  userId, 
  status: 'in-progress' 
});

// Query 3: Filter by topic and difficulty
// Uses: idx_topic_difficulty
await InterviewAggregate.find({ 
  topic: 'React', 
  difficulty: 'Advanced' 
});

// Query 4: Top scoring interviews
// Uses: idx_overall_score
await InterviewAggregate.find({ 
  status: 'completed' 
})
  .sort({ 'report.averageScores.overall': -1 })
  .limit(10);

// Query 5: Text search
// Uses: idx_text_search
await InterviewAggregate.find({
  $text: { $search: 'senior react developer' }
});
```

### Index Monitoring

```typescript
// Check index usage
db.interviews_aggregate.aggregate([
  { $indexStats: {} }
]);

// Explain query plan
db.interviews_aggregate.find({ userId }).explain('executionStats');

// Monitor slow queries (> 100ms)
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

---

## Aggregation Pipelines

### 1. Generate Interview Report

```typescript
async function generateInterviewReport(interviewId: string): Promise<IReport> {
  const result = await InterviewAggregate.aggregate([
    // Stage 1: Match the interview
    {
      $match: {
        _id: new Types.ObjectId(interviewId),
        status: 'completed',
      },
    },
    
    // Stage 2: Unwind questions for processing
    {
      $unwind: {
        path: '$questions',
        preserveNullAndEmptyArrays: false,
      },
    },
    
    // Stage 3: Filter only answered questions
    {
      $match: {
        'questions.answer': { $exists: true },
        'questions.answer.evaluation': { $exists: true },
      },
    },
    
    // Stage 4: Group and calculate averages
    {
      $group: {
        _id: '$_id',
        userId: { $first: '$userId' },
        topic: { $first: '$topic' },
        difficulty: { $first: '$difficulty' },
        totalQuestions: { $first: { $size: '$questions' } },
        totalAnswered: { $sum: 1 },
        totalDuration: { $first: '$metadata.duration' },
        
        // Average scores
        avgTechnical: {
          $avg: '$questions.answer.evaluation.scores.technical',
        },
        avgCommunication: {
          $avg: '$questions.answer.evaluation.scores.communication',
        },
        avgLeadership: {
          $avg: '$questions.answer.evaluation.scores.leadership',
        },
        avgProblemSolving: {
          $avg: '$questions.answer.evaluation.scores.problemSolving',
        },
        avgConfidence: {
          $avg: '$questions.answer.evaluation.scores.confidence',
        },
        avgOverall: {
          $avg: '$questions.answer.evaluation.scores.overall',
        },
        
        // Aggregate feedback
        allStrengths: {
          $push: '$questions.answer.evaluation.feedback.strengths',
        },
        allWeaknesses: {
          $push: '$questions.answer.evaluation.feedback.weaknesses',
        },
        allSuggestions: {
          $push: '$questions.answer.evaluation.feedback.suggestions',
        },
        
        // Answer metrics
        avgAnswerTime: {
          $avg: '$questions.answer.answerDuration',
        },
      },
    },
    
    // Stage 5: Process feedback arrays
    {
      $project: {
        userId: 1,
        topic: 1,
        difficulty: 1,
        averageScores: {
          technical: { $round: ['$avgTechnical', 2] },
          communication: { $round: ['$avgCommunication', 2] },
          leadership: { $round: ['$avgLeadership', 2] },
          problemSolving: { $round: ['$avgProblemSolving', 2] },
          confidence: { $round: ['$avgConfidence', 2] },
          overall: { $round: ['$avgOverall', 2] },
        },
        summary: {
          totalQuestions: '$totalQuestions',
          totalAnswered: '$totalAnswered',
          totalEvaluated: '$totalAnswered',
          averageAnswerTime: { $round: ['$avgAnswerTime', 0] },
          totalDuration: '$totalDuration',
        },
        insights: {
          topStrengths: {
            $slice: [
              {
                $reduce: {
                  input: '$allStrengths',
                  initialValue: [],
                  in: { $concatArrays: ['$$value', '$$this'] },
                },
              },
              5,
            ],
          },
          topWeaknesses: {
            $slice: [
              {
                $reduce: {
                  input: '$allWeaknesses',
                  initialValue: [],
                  in: { $concatArrays: ['$$value', '$$this'] },
                },
              },
              5,
            ],
          },
          improvementAreas: {
            $slice: [
              {
                $reduce: {
                  input: '$allSuggestions',
                  initialValue: [],
                  in: { $concatArrays: ['$$value', '$$this'] },
                },
              },
              5,
            ],
          },
        },
        generatedAt: new Date(),
      },
    },
  ]);
  
  return result[0];
}
```

### 2. User Performance Analytics

```typescript
async function getUserAnalytics(userId: string, timeRange: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeRange);
  
  const analytics = await InterviewAggregate.aggregate([
    // Stage 1: Match user's completed interviews
    {
      $match: {
        userId: new Types.ObjectId(userId),
        status: 'completed',
        completedAt: { $gte: startDate },
        deletedAt: { $exists: false },
      },
    },
    
    // Stage 2: Group by topic
    {
      $group: {
        _id: '$topic',
        totalInterviews: { $sum: 1 },
        averageScore: { $avg: '$report.averageScores.overall' },
        lastInterview: { $max: '$completedAt' },
        difficulties: { $push: '$difficulty' },
      },
    },
    
    // Stage 3: Sort by average score
    {
      $sort: { averageScore: -1 },
    },
    
    // Stage 4: Add global statistics
    {
      $group: {
        _id: null,
        byTopic: {
          $push: {
            topic: '$_id',
            totalInterviews: '$totalInterviews',
            averageScore: { $round: ['$averageScore', 2] },
            lastInterview: '$lastInterview',
          },
        },
        totalInterviews: { $sum: '$totalInterviews' },
        overallAverageScore: { $avg: '$averageScore' },
      },
    },
    
    // Stage 5: Final projection
    {
      $project: {
        _id: 0,
        totalInterviews: 1,
        overallAverageScore: { $round: ['$overallAverageScore', 2] },
        byTopic: 1,
      },
    },
  ]);
  
  return analytics[0];
}
```

### 3. Score Distribution Analysis

```typescript
async function getScoreDistribution(userId: string) {
  const distribution = await InterviewAggregate.aggregate([
    // Stage 1: Match user's completed interviews
    {
      $match: {
        userId: new Types.ObjectId(userId),
        status: 'completed',
        'report.averageScores.overall': { $exists: true },
        deletedAt: { $exists: false },
      },
    },
    
    // Stage 2: Bucket scores into ranges
    {
      $bucket: {
        groupBy: '$report.averageScores.overall',
        boundaries: [0, 2, 4, 6, 8, 10],
        default: 'Other',
        output: {
          count: { $sum: 1 },
          interviews: {
            $push: {
              _id: '$_id',
              topic: '$topic',
              score: '$report.averageScores.overall',
              completedAt: '$completedAt',
            },
          },
        },
      },
    },
    
    // Stage 3: Add percentage
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        ranges: { $push: '$$ROOT' },
      },
    },
    
    // Stage 4: Calculate percentages
    {
      $unwind: '$ranges',
    },
    {
      $project: {
        _id: 0,
        range: {
          $switch: {
            branches: [
              { case: { $eq: ['$ranges._id', 0] }, then: '0-2' },
              { case: { $eq: ['$ranges._id', 2] }, then: '2-4' },
              { case: { $eq: ['$ranges._id', 4] }, then: '4-6' },
              { case: { $eq: ['$ranges._id', 6] }, then: '6-8' },
              { case: { $eq: ['$ranges._id', 8] }, then: '8-10' },
            ],
            default: 'Other',
          },
        },
        count: '$ranges.count',
        percentage: {
          $multiply: [{ $divide: ['$ranges.count', '$total'] }, 100],
        },
        interviews: '$ranges.interviews',
      },
    },
    
    // Stage 5: Sort by range
    {
      $sort: { range: 1 },
    },
  ]);
  
  return distribution;
}
```

### 4. Comparison with Previous Interviews

```typescript
async function getProgressComparison(userId: string, interviewId: string) {
  const comparison = await InterviewAggregate.aggregate([
    // Stage 1: Match user's completed interviews
    {
      $match: {
        userId: new Types.ObjectId(userId),
        status: 'completed',
        deletedAt: { $exists: false },
      },
    },
    
    // Stage 2: Sort by completion date
    {
      $sort: { completedAt: -1 },
    },
    
    // Stage 3: Add ranking
    {
      $group: {
        _id: '$userId',
        interviews: {
          $push: {
            _id: '$_id',
            topic: '$topic',
            score: '$report.averageScores.overall',
            completedAt: '$completedAt',
          },
        },
      },
    },
    
    // Stage 4: Find target interview position
    {
      $project: {
        currentInterview: {
          $arrayElemAt: [
            '$interviews',
            {
              $indexOfArray: [
                '$interviews._id',
                new Types.ObjectId(interviewId),
              ],
            },
          ],
        },
        previousInterview: {
          $arrayElemAt: [
            '$interviews',
            {
              $add: [
                {
                  $indexOfArray: [
                    '$interviews._id',
                    new Types.ObjectId(interviewId),
                  ],
                },
                1,
              ],
            },
          ],
        },
        allInterviews: '$interviews',
      },
    },
    
    // Stage 5: Calculate improvement
    {
      $project: {
        currentScore: '$currentInterview.score',
        previousScore: '$previousInterview.score',
        improvement: {
          $subtract: ['$currentInterview.score', '$previousInterview.score'],
        },
        averageScore: { $avg: '$allInterviews.score' },
        totalInterviews: { $size: '$allInterviews' },
      },
    },
  ]);
  
  return comparison[0];
}
```

### 5. Top Performers Leaderboard

```typescript
async function getLeaderboard(
  topic?: string,
  difficulty?: string,
  limit: number = 10
) {
  const matchStage: any = {
    status: 'completed',
    'report.averageScores.overall': { $exists: true },
    deletedAt: { $exists: false },
  };
  
  if (topic) matchStage.topic = topic;
  if (difficulty) matchStage.difficulty = difficulty;
  
  const leaderboard = await InterviewAggregate.aggregate([
    // Stage 1: Match criteria
    {
      $match: matchStage,
    },
    
    // Stage 2: Sort by score
    {
      $sort: { 'report.averageScores.overall': -1 },
    },
    
    // Stage 3: Limit results
    {
      $limit: limit,
    },
    
    // Stage 4: Lookup user details
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    
    // Stage 5: Unwind user
    {
      $unwind: '$user',
    },
    
    // Stage 6: Project final fields
    {
      $project: {
        _id: 1,
        topic: 1,
        difficulty: 1,
        score: '$report.averageScores.overall',
        completedAt: 1,
        user: {
          name: {
            $concat: [
              '$user.profile.firstName',
              ' ',
              '$user.profile.lastName',
            ],
          },
          avatar: '$user.profile.avatar',
        },
      },
    },
  ]);
  
  return leaderboard;
}
```

---

## Query Optimization Strategy

### 1. Query Performance Guidelines

```typescript
// ✅ GOOD: Use indexes
await InterviewAggregate.find({ userId, status: 'completed' })
  .sort({ createdAt: -1 })
  .limit(10);

// ❌ BAD: No index on nested field
await InterviewAggregate.find({ 'questions.answer.transcript': /keyword/ });

// ✅ GOOD: Project only needed fields
await InterviewAggregate.find({ userId })
  .select('topic difficulty status createdAt')
  .lean(); // Returns plain JavaScript object

// ❌ BAD: Return entire document
await InterviewAggregate.find({ userId });

// ✅ GOOD: Use pagination with skip and limit
await InterviewAggregate.find({ userId })
  .skip((page - 1) * pageSize)
  .limit(pageSize);

// ❌ BAD: Load all documents
await InterviewAggregate.find({ userId });
```

### 2. Projection Optimization

```typescript
// Only return interview summary
async function getInterviewSummaries(userId: string) {
  return InterviewAggregate.find({ userId })
    .select({
      topic: 1,
      difficulty: 1,
      status: 1,
      'progress.questionsAnswered': 1,
      totalQuestions: 1,
      'report.averageScores.overall': 1,
      createdAt: 1,
      completedAt: 1,
    })
    .lean()
    .exec();
}

// Only return specific question
async function getQuestion(interviewId: string, sequenceNumber: number) {
  return InterviewAggregate.findOne(
    { _id: interviewId },
    {
      'questions.$': 1,
    }
  ).where('questions.sequenceNumber').equals(sequenceNumber);
}
```

### 3. Caching Strategy

```typescript
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

// Cache interview summaries
async function getInterviewWithCache(interviewId: string) {
  const cacheKey = `interview:${interviewId}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Query database
  const interview = await InterviewAggregate.findById(interviewId)
    .select({
      topic: 1,
      difficulty: 1,
      status: 1,
      'report.averageScores': 1,
    })
    .lean();
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, JSON.stringify(interview));
  
  return interview;
}

// Invalidate cache on update
async function updateInterviewStatus(interviewId: string, status: string) {
  await InterviewAggregate.findByIdAndUpdate(
    interviewId,
    { status },
    { new: true }
  );
  
  // Invalidate cache
  await redis.del(`interview:${interviewId}`);
}
```

### 4. Batch Operations

```typescript
// Batch insert questions
async function addQuestionsBatch(
  interviewId: string,
  questions: any[]
) {
  const questionsWithIds = questions.map((q, index) => ({
    _id: new Types.ObjectId(),
    ...q,
    sequenceNumber: index + 1,
    createdAt: new Date(),
  }));
  
  return InterviewAggregate.findByIdAndUpdate(
    interviewId,
    {
      $push: { questions: { $each: questionsWithIds } },
      $set: { 'progress.questionsAsked': questionsWithIds.length },
    },
    { new: true }
  );
}

// Batch update evaluations
async function updateEvaluationsBatch(
  interviewId: string,
  evaluations: Array<{ questionId: string; evaluation: any }>
) {
  const bulkOps = evaluations.map(({ questionId, evaluation }) => ({
    updateOne: {
      filter: {
        _id: interviewId,
        'questions._id': new Types.ObjectId(questionId),
      },
      update: {
        $set: {
          'questions.$.answer.evaluation': {
            _id: new Types.ObjectId(),
            ...evaluation,
            createdAt: new Date(),
          },
        },
        $inc: { 'progress.questionsEvaluated': 1 },
      },
    },
  }));
  
  return InterviewAggregate.bulkWrite(bulkOps);
}
```

---

## Validation Rules

### Schema-Level Validation

```typescript
// Custom validators
const emailValidator = {
  validator: function (v: string) {
    return /^\S+@\S+\.\S+$/.test(v);
  },
  message: 'Please enter a valid email address',
};

const urlValidator = {
  validator: function (v: string) {
    return /^https?:\/\/.+/.test(v);
  },
  message: 'Please enter a valid URL',
};

// Score validator
const scoreValidator = {
  validator: function (v: number) {
    return v >= 0 && v <= 10;
  },
  message: 'Score must be between 0 and 10',
};

// Experience validator
const experienceValidator = {
  validator: function (v: number) {
    return v >= 0 && v <= 50;
  },
  message: 'Experience must be between 0 and 50 years',
};
```

### Application-Level Validation (Zod)

```typescript
import { z } from 'zod';

// Interview creation validation
export const createInterviewSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID'),
  topic: z.enum([
    'NodeJS',
    'Angular',
    'React',
    'MongoDB',
    'TypeScript',
    'SystemDesign',
    'TeamLead',
    'EngineeringManager',
    'HRInterview',
    'CustomTopic',
  ]),
  difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Expert']),
  experienceYears: z.number().int().min(0).max(50),
  totalQuestions: z.number().int().min(1).max(50),
  jobDescription: z.string().max(5000).optional(),
  interviewType: z.enum(['technical', 'behavioral', 'system-design', 'leadership']),
});

// Answer submission validation
export const submitAnswerSchema = z.object({
  questionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid question ID'),
  transcript: z.string().min(10).max(10000),
  answerDuration: z.number().positive(),
  recordingMetadata: z.object({
    audioQuality: z.string().optional(),
    transcriptionConfidence: z.number().min(0).max(1).optional(),
    language: z.string().default('en-US'),
    silenceDuration: z.number().optional(),
    fillerWords: z
      .array(
        z.object({
          word: z.string(),
          count: z.number().int().positive(),
        })
      )
      .optional(),
    speakingPace: z.number().positive().optional(),
  }),
});

// Evaluation validation
export const evaluationSchema = z.object({
  answerId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid answer ID'),
  scores: z.object({
    technical: z.number().min(0).max(10),
    communication: z.number().min(0).max(10),
    leadership: z.number().min(0).max(10),
    problemSolving: z.number().min(0).max(10),
    confidence: z.number().min(0).max(10),
  }),
  feedback: z.object({
    strengths: z.array(z.string()).min(1).max(10),
    weaknesses: z.array(z.string()).min(1).max(10),
    suggestions: z.array(z.string()).min(1).max(10),
    detailedAnalysis: z.string().optional(),
  }),
});

// Usage in controller
export async function createInterview(req: Request, res: Response) {
  try {
    // Validate request body
    const validatedData = createInterviewSchema.parse(req.body);
    
    // Create interview
    const interview = await InterviewAggregate.create(validatedData);
    
    res.status(201).json({ success: true, data: interview });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        errors: error.errors,
      });
    }
    throw error;
  }
}
```

---

## Pagination Strategy

### 1. Offset-Based Pagination (Simple)

```typescript
interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

async function getInterviewsPaginated(
  userId: string,
  params: PaginationParams
) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
  
  const [interviews, total] = await Promise.all([
    InterviewAggregate.find({ userId, deletedAt: { $exists: false } })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('topic difficulty status createdAt report.averageScores.overall')
      .lean(),
    InterviewAggregate.countDocuments({ userId, deletedAt: { $exists: false } }),
  ]);
  
  return {
    data: interviews,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
  };
}
```

### 2. Cursor-Based Pagination (Scalable)

```typescript
interface CursorPaginationParams {
  cursor?: string; // Encoded last document ID
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

async function getInterviewsCursorPaginated(
  userId: string,
  params: CursorPaginationParams
) {
  const { cursor, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  
  const query: any = { 
    userId, 
    deletedAt: { $exists: false } 
  };
  
  // Add cursor filter
  if (cursor) {
    const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
    const [lastId, lastValue] = decodedCursor.split(':');
    
    if (sortOrder === 'desc') {
      query[sortBy] = { $lt: new Date(lastValue) };
    } else {
      query[sortBy] = { $gt: new Date(lastValue) };
    }
  }
  
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
  
  const interviews = await InterviewAggregate.find(query)
    .sort(sort)
    .limit(limit + 1) // Fetch one extra to check if there's more
    .select('topic difficulty status createdAt report.averageScores.overall')
    .lean();
  
  const hasNext = interviews.length > limit;
  if (hasNext) {
    interviews.pop(); // Remove extra document
  }
  
  // Generate next cursor
  let nextCursor: string | null = null;
  if (hasNext && interviews.length > 0) {
    const lastDoc = interviews[interviews.length - 1];
    const cursorValue = `${lastDoc._id}:${lastDoc[sortBy]}`;
    nextCursor = Buffer.from(cursorValue).toString('base64');
  }
  
  return {
    data: interviews,
    pagination: {
      nextCursor,
      hasNext,
      limit,
    },
  };
}
```

### 3. Search with Pagination

```typescript
interface SearchParams extends PaginationParams {
  query?: string;
  topic?: string;
  difficulty?: string;
  status?: string;
  minScore?: number;
  maxScore?: number;
}

async function searchInterviews(userId: string, params: SearchParams) {
  const {
    query,
    topic,
    difficulty,
    status,
    minScore,
    maxScore,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params;
  
  // Build filter
  const filter: any = { 
    userId, 
    deletedAt: { $exists: false } 
  };
  
  if (query) {
    filter.$text = { $search: query };
  }
  if (topic) {
    filter.topic = topic;
  }
  if (difficulty) {
    filter.difficulty = difficulty;
  }
  if (status) {
    filter.status = status;
  }
  if (minScore !== undefined || maxScore !== undefined) {
    filter['report.averageScores.overall'] = {};
    if (minScore !== undefined) {
      filter['report.averageScores.overall'].$gte = minScore;
    }
    if (maxScore !== undefined) {
      filter['report.averageScores.overall'].$lte = maxScore;
    }
  }
  
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
  
  const [interviews, total] = await Promise.all([
    InterviewAggregate.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .select('topic difficulty status createdAt report.averageScores.overall')
      .lean(),
    InterviewAggregate.countDocuments(filter),
  ]);
  
  return {
    data: interviews,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    },
    filters: {
      query,
      topic,
      difficulty,
      status,
      minScore,
      maxScore,
    },
  };
}
```

---

**Continue to Part 3...**
