# MongoDB Architecture - Part 3: Advanced Features

## Soft Delete Strategy

### Implementation

Soft delete prevents permanent data loss and enables data recovery while hiding deleted records from normal queries.

### 1. Schema Design

```typescript
// Add deletedAt field to all collections
interface ISoftDelete {
  deletedAt?: Date;
}

// Update interface
interface IInterviewAggregate extends ISoftDelete {
  // ... other fields
}
```

### 2. Mongoose Plugin

```typescript
import { Schema, Document, Model } from 'mongoose';

interface ISoftDeleteDocument extends Document {
  deletedAt?: Date;
  delete(): Promise<this>;
  restore(): Promise<this>;
}

interface ISoftDeleteModel<T extends Document> extends Model<T> {
  findNotDeleted(filter?: any): any;
  findOneNotDeleted(filter?: any): any;
  countNotDeleted(filter?: any): Promise<number>;
  deleteById(id: string): Promise<T | null>;
  restoreById(id: string): Promise<T | null>;
}

function softDeletePlugin(schema: Schema) {
  // Add deletedAt field
  schema.add({
    deletedAt: {
      type: Date,
      index: true,
      sparse: true,
    },
  });
  
  // Instance method: soft delete
  schema.methods.delete = function () {
    this.deletedAt = new Date();
    return this.save();
  };
  
  // Instance method: restore
  schema.methods.restore = function () {
    this.deletedAt = undefined;
    return this.save();
  };
  
  // Static method: find not deleted
  schema.statics.findNotDeleted = function (filter = {}) {
    return this.find({
      ...filter,
      deletedAt: { $exists: false },
    });
  };
  
  // Static method: find one not deleted
  schema.statics.findOneNotDeleted = function (filter = {}) {
    return this.findOne({
      ...filter,
      deletedAt: { $exists: false },
    });
  };
  
  // Static method: count not deleted
  schema.statics.countNotDeleted = function (filter = {}) {
    return this.countDocuments({
      ...filter,
      deletedAt: { $exists: false },
    });
  };
  
  // Static method: delete by ID
  schema.statics.deleteById = function (id: string) {
    return this.findByIdAndUpdate(
      id,
      { deletedAt: new Date() },
      { new: true }
    );
  };
  
  // Static method: restore by ID
  schema.statics.restoreById = function (id: string) {
    return this.findByIdAndUpdate(
      id,
      { $unset: { deletedAt: 1 } },
      { new: true }
    );
  };
  
  // Pre-find hook: exclude deleted by default
  schema.pre(/^find/, function (next) {
    // Only apply if not explicitly querying deleted
    if (!(this as any).getOptions().includeDeleted) {
      this.where({ deletedAt: { $exists: false } });
    }
    next();
  });
  
  // Pre-count hook
  schema.pre('countDocuments', function (next) {
    if (!(this as any).getOptions().includeDeleted) {
      this.where({ deletedAt: { $exists: false } });
    }
    next();
  });
}

export default softDeletePlugin;
```

### 3. Usage

```typescript
// Apply plugin to schema
interviewAggregateSchema.plugin(softDeletePlugin);

// Soft delete interview
const interview = await InterviewAggregate.findById(interviewId);
await interview.delete();

// Restore interview
await interview.restore();

// Find non-deleted interviews (automatic)
const interviews = await InterviewAggregate.find({ userId });

// Find all including deleted
const allInterviews = await InterviewAggregate.find({ userId })
  .setOptions({ includeDeleted: true });

// Delete by ID
await InterviewAggregate.deleteById(interviewId);

// Restore by ID
await InterviewAggregate.restoreById(interviewId);

// Count non-deleted
const count = await InterviewAggregate.countNotDeleted({ userId });
```

### 4. Permanent Delete (Admin Only)

```typescript
async function permanentlyDeleteInterview(interviewId: string) {
  // First check if soft deleted
  const interview = await InterviewAggregate.findById(interviewId)
    .setOptions({ includeDeleted: true });
  
  if (!interview) {
    throw new Error('Interview not found');
  }
  
  if (!interview.deletedAt) {
    throw new Error('Interview must be soft deleted first');
  }
  
  // Check if deleted more than 30 days ago
  const daysSinceDeleted = Math.floor(
    (Date.now() - interview.deletedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceDeleted < 30) {
    throw new Error('Interview can only be permanently deleted after 30 days');
  }
  
  // Permanently delete
  await InterviewAggregate.findByIdAndDelete(interviewId);
  
  return { message: 'Interview permanently deleted' };
}
```

### 5. Cleanup Job (Scheduled)

```typescript
import cron from 'node-cron';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Find interviews soft-deleted more than 30 days ago
  const result = await InterviewAggregate.deleteMany({
    deletedAt: { $lt: thirtyDaysAgo },
  });
  
  console.log(`Permanently deleted ${result.deletedCount} interviews`);
});
```

---

## Scalability Strategy

### 1. Sharding Strategy

**When to Shard:**
- Collection size > 100GB
- Working set > RAM
- High write throughput
- Geographic distribution needed

**Shard Key Selection:**

```typescript
// Option 1: userId (Recommended)
// Pros: Even distribution, queries by user are efficient
// Cons: Single user queries hit one shard

db.interviews_aggregate.createIndex({ userId: 1, _id: 1 });
sh.shardCollection(
  'interview_coach.interviews_aggregate',
  { userId: 1, _id: 1 }
);

// Option 2: Hashed userId
// Pros: Better distribution, no hotspots
// Cons: Range queries across all shards

db.interviews_aggregate.createIndex({ userId: 'hashed' });
sh.shardCollection(
  'interview_coach.interviews_aggregate',
  { userId: 'hashed' }
);

// Option 3: Compound (userId + createdAt)
// Pros: Time-based queries efficient, good distribution
// Cons: More complex

db.interviews_aggregate.createIndex({ userId: 1, createdAt: 1 });
sh.shardCollection(
  'interview_coach.interviews_aggregate',
  { userId: 1, createdAt: 1 }
);
```

**Sharding Configuration:**

```javascript
// Enable sharding on database
sh.enableSharding('interview_coach');

// Create shard key index
db.interviews_aggregate.createIndex({ userId: 1, _id: 1 });

// Shard the collection
sh.shardCollection(
  'interview_coach.interviews_aggregate',
  { userId: 1, _id: 1 },
  false, // unique: false
  {
    numInitialChunks: 4, // Create 4 initial chunks
  }
);

// Check sharding status
sh.status();

// Monitor chunk distribution
db.chunks.aggregate([
  { $match: { ns: 'interview_coach.interviews_aggregate' } },
  { $group: { _id: '$shard', count: { $sum: 1 } } },
]);
```

### 2. Replication Strategy

**Replica Set Configuration:**

```javascript
// Configure replica set
rs.initiate({
  _id: 'interview-rs',
  members: [
    { _id: 0, host: 'mongo1.example.com:27017', priority: 2 },
    { _id: 1, host: 'mongo2.example.com:27017', priority: 1 },
    { _id: 2, host: 'mongo3.example.com:27017', priority: 1 },
    {
      _id: 3,
      host: 'mongo4.example.com:27017',
      priority: 0,
      hidden: true,
      tags: { usage: 'analytics' },
    },
  ],
  settings: {
    electionTimeoutMillis: 5000,
  },
});
```

**Read Preference:**

```typescript
import mongoose from 'mongoose';

// Primary (default) - All reads from primary
mongoose.connect(process.env.MONGO_URI!, {
  readPreference: 'primary',
});

// Secondary Preferred - Analytics queries
const analyticsConnection = mongoose.createConnection(process.env.MONGO_URI!, {
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'majority' },
});

// Usage
export async function getAnalyticsData(userId: string) {
  // Use secondary for heavy analytics
  const AnalyticsModel = analyticsConnection.model(
    'InterviewAggregate',
    interviewAggregateSchema
  );
  
  return AnalyticsModel.aggregate([
    // Complex analytics pipeline
  ]).read('secondaryPreferred');
}
```

### 3. Connection Pooling

```typescript
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGO_URI!, {
  // Connection pool settings
  maxPoolSize: 50, // Maximum connections
  minPoolSize: 10, // Minimum connections
  maxIdleTimeMS: 30000, // Close idle connections after 30s
  serverSelectionTimeoutMS: 5000, // Timeout for server selection
  socketTimeoutMS: 45000, // Socket timeout
  family: 4, // Use IPv4
  
  // Compression
  compressors: ['snappy', 'zlib'],
  
  // Retry writes
  retryWrites: true,
  retryReads: true,
  
  // Write concern
  writeConcern: {
    w: 'majority',
    j: true, // Wait for journal
    wtimeout: 5000,
  },
  
  // Read concern
  readConcern: {
    level: 'majority',
  },
});

// Monitor connection pool
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
```

### 4. Caching Layer

```typescript
import Redis from 'ioredis';
import { createHash } from 'crypto';

class CacheService {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
  }
  
  // Generate cache key
  private generateKey(prefix: string, params: any): string {
    const hash = createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `${prefix}:${hash}`;
  }
  
  // Get from cache
  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  // Set in cache
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
  
  // Delete from cache
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
  
  // Delete pattern
  async delPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
  
  // Cached query wrapper
  async cachedQuery<T>(
    cacheKey: string,
    queryFn: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Execute query
    const result = await queryFn();
    
    // Cache result
    await this.set(cacheKey, result, ttl);
    
    return result;
  }
}

export const cacheService = new CacheService();

// Usage
export async function getInterviewWithCache(interviewId: string) {
  const cacheKey = `interview:${interviewId}`;
  
  return cacheService.cachedQuery(
    cacheKey,
    () => InterviewAggregate.findById(interviewId).lean(),
    3600 // 1 hour TTL
  );
}

// Invalidate on update
export async function updateInterview(interviewId: string, data: any) {
  const interview = await InterviewAggregate.findByIdAndUpdate(
    interviewId,
    data,
    { new: true }
  );
  
  // Invalidate cache
  await cacheService.del(`interview:${interviewId}`);
  await cacheService.delPattern(`user:${interview.userId}:*`);
  
  return interview;
}
```

### 5. Database Archival Strategy

```typescript
// Archive old interviews to separate collection
async function archiveOldInterviews(daysOld: number = 365) {
  const archiveDate = new Date();
  archiveDate.setDate(archiveDate.getDate() - daysOld);
  
  // Find old completed interviews
  const oldInterviews = await InterviewAggregate.find({
    status: 'completed',
    completedAt: { $lt: archiveDate },
    deletedAt: { $exists: false },
  }).lean();
  
  if (oldInterviews.length === 0) {
    return { archived: 0 };
  }
  
  // Insert into archive collection
  await mongoose.connection.collection('interviews_archive').insertMany(
    oldInterviews.map(interview => ({
      ...interview,
      archivedAt: new Date(),
    }))
  );
  
  // Delete from main collection
  const interviewIds = oldInterviews.map(i => i._id);
  await InterviewAggregate.updateMany(
    { _id: { $in: interviewIds } },
    { $set: { deletedAt: new Date() } }
  );
  
  return { archived: oldInterviews.length };
}

// Schedule archival job (monthly)
cron.schedule('0 0 1 * *', async () => {
  const result = await archiveOldInterviews(365);
  console.log(`Archived ${result.archived} interviews`);
});
```

### 6. Horizontal Scaling

```typescript
// Load balancing with multiple app instances
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numWorkers = os.cpus().length;
  
  console.log(`Master process ${process.pid} is running`);
  console.log(`Starting ${numWorkers} workers...`);
  
  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }
  
  // Handle worker death
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    console.log('Starting a new worker');
    cluster.fork();
  });
} else {
  // Worker processes run the app
  import('./app').then(({ app }) => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Worker ${process.pid} listening on port ${PORT}`);
    });
  });
}
```

---

## Best Practices

### 1. Schema Design Best Practices

```typescript
// ✅ GOOD: Embed frequently accessed together
{
  user: {
    profile: {
      firstName: string;
      lastName: string;
    }
  }
}

// ❌ BAD: Separate collections for always-joined data
{
  users: { _id, profileId }
  profiles: { _id, firstName, lastName }
}

// ✅ GOOD: Reference rarely accessed large data
{
  interview: {
    _id: ObjectId;
    reportId: ObjectId; // Reference
  }
}

// ❌ BAD: Embed large infrequently accessed data
{
  interview: {
    report: { /* 5MB of data */ }
  }
}

// ✅ GOOD: Limit array size with capped arrays
{
  questions: { type: Array, validate: { validator: v => v.length <= 50 } }
}

// ❌ BAD: Unbounded arrays
{
  questions: [] // Can grow indefinitely
}
```

### 2. Query Best Practices

```typescript
// ✅ GOOD: Use lean() for read-only operations
const interviews = await InterviewAggregate.find({ userId }).lean();

// ❌ BAD: Full Mongoose documents when not needed
const interviews = await InterviewAggregate.find({ userId });

// ✅ GOOD: Project only needed fields
const interviews = await InterviewAggregate.find({ userId })
  .select('topic status createdAt')
  .lean();

// ❌ BAD: Return entire documents
const interviews = await InterviewAggregate.find({ userId });

// ✅ GOOD: Use indexes
await InterviewAggregate.find({ userId, status: 'completed' });

// ❌ BAD: Query without indexes
await InterviewAggregate.find({ 
  'questions.answer.transcript': /keyword/i 
});

// ✅ GOOD: Batch operations
await InterviewAggregate.bulkWrite([/* operations */]);

// ❌ BAD: Loop with individual queries
for (const item of items) {
  await InterviewAggregate.updateOne(/* ... */);
}
```

### 3. Error Handling

```typescript
// Custom error classes
export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public errors: any[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Error handler
export async function handleDatabaseOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Mongoose validation error
    if (error.name === 'ValidationError') {
      throw new ValidationError('Validation failed', error.errors);
    }
    
    // Duplicate key error
    if (error.code === 11000) {
      throw new DatabaseError('Duplicate key error', 'DUPLICATE_KEY');
    }
    
    // Cast error
    if (error.name === 'CastError') {
      throw new ValidationError('Invalid ID format', [error]);
    }
    
    // Connection error
    if (error.name === 'MongoNetworkError') {
      throw new DatabaseError('Database connection error', 'CONNECTION_ERROR');
    }
    
    // Generic database error
    throw new DatabaseError(error.message);
  }
}

// Usage
export async function getInterview(interviewId: string) {
  return handleDatabaseOperation(() =>
    InterviewAggregate.findById(interviewId)
  );
}
```

### 4. Transaction Handling

```typescript
// Multi-document transaction (when needed)
export async function completeInterview(interviewId: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Update interview status
    const interview = await InterviewAggregate.findByIdAndUpdate(
      interviewId,
      {
        status: 'completed',
        completedAt: new Date(),
      },
      { new: true, session }
    );
    
    if (!interview) {
      throw new Error('Interview not found');
    }
    
    // Update user statistics
    await User.findByIdAndUpdate(
      interview.userId,
      {
        $inc: { 'statistics.completedInterviews': 1 },
        $set: { 'statistics.lastInterviewDate': new Date() },
      },
      { session }
    );
    
    // Commit transaction
    await session.commitTransaction();
    
    return interview;
  } catch (error) {
    // Rollback transaction
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 5. Monitoring & Logging

```typescript
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Log slow queries
mongoose.set('debug', (collectionName, method, query, doc) => {
  logger.info('MongoDB Query', {
    collection: collectionName,
    method,
    query,
    doc,
  });
});

// Monitor connection events
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB error', { error: err });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

// Query performance monitoring
export async function monitoredQuery<T>(
  name: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    if (duration > 1000) {
      logger.warn('Slow query detected', {
        name,
        duration,
      });
    }
    
    return result;
  } catch (error) {
    logger.error('Query failed', {
      name,
      error,
    });
    throw error;
  }
}
```

### 6. Testing Strategy

```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Test setup
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Test example
describe('Interview Operations', () => {
  it('should create interview', async () => {
    const interview = await InterviewAggregate.create({
      userId: new Types.ObjectId(),
      topic: 'React',
      difficulty: 'Intermediate',
      experienceYears: 5,
      totalQuestions: 10,
      interviewType: 'technical',
    });
    
    expect(interview._id).toBeDefined();
    expect(interview.status).toBe('not-started');
  });
  
  it('should add question to interview', async () => {
    const interview = await InterviewAggregate.create({
      userId: new Types.ObjectId(),
      topic: 'React',
      difficulty: 'Intermediate',
      experienceYears: 5,
      totalQuestions: 10,
      interviewType: 'technical',
    });
    
    await interview.addQuestion({
      questionText: 'What is React?',
      sequenceNumber: 1,
      questionType: 'primary',
      difficulty: 'easy',
    });
    
    expect(interview.questions).toHaveLength(1);
    expect(interview.progress.questionsAsked).toBe(1);
  });
});
```

### 7. Security Best Practices

```typescript
// ✅ GOOD: Sanitize user input
import mongoSanitize from 'express-mongo-sanitize';
app.use(mongoSanitize());

// ✅ GOOD: Use parameterized queries
await InterviewAggregate.find({ userId: sanitizedUserId });

// ❌ BAD: String concatenation in queries
await InterviewAggregate.find({ userId: `${userInput}` });

// ✅ GOOD: Limit query results
await InterviewAggregate.find({ userId }).limit(100);

// ❌ BAD: Unbounded queries
await InterviewAggregate.find({ userId });

// ✅ GOOD: Use environment variables
const MONGO_URI = process.env.MONGO_URI;

// ❌ BAD: Hardcoded credentials
const MONGO_URI = 'mongodb://user:pass@localhost:27017/db';
```

---

## Performance Checklist

### Pre-Production Checklist

- [ ] **Indexes created** for all common queries
- [ ] **Compound indexes** optimized for query patterns
- [ ] **Text indexes** created for search functionality
- [ ] **Sparse indexes** for optional fields
- [ ] **TTL indexes** for auto-expiring data (if applicable)
- [ ] **Query explain** analyzed for all critical paths
- [ ] **Slow query log** enabled and monitored
- [ ] **Connection pool** sized appropriately
- [ ] **Read preference** configured for analytics
- [ ] **Write concern** set for data criticality
- [ ] **Replica set** configured (3+ nodes)
- [ ] **Backup strategy** implemented
- [ ] **Monitoring** setup (Atlas, Ops Manager, or similar)
- [ ] **Alerts** configured for errors and performance
- [ ] **Caching layer** implemented (Redis)
- [ ] **Soft delete** implemented
- [ ] **Archival strategy** planned
- [ ] **Transaction handling** for critical operations
- [ ] **Error handling** comprehensive
- [ ] **Logging** structured and searchable
- [ ] **Testing** complete (unit, integration, load)

---

## Migration Guide

### From SQLite to MongoDB

```typescript
// Step 1: Export SQLite data
import sqlite3 from 'sqlite3';
import { promisify } from 'util';

async function exportFromSQLite() {
  const db = new sqlite3.Database('interview.db');
  const all = promisify(db.all.bind(db));
  
  const interviews = await all('SELECT * FROM interviews');
  const questions = await all('SELECT * FROM questions');
  const answers = await all('SELECT * FROM answers');
  const evaluations = await all('SELECT * FROM evaluations');
  
  return { interviews, questions, answers, evaluations };
}

// Step 2: Transform and import to MongoDB
async function importToMongoDB() {
  const data = await exportFromSQLite();
  
  for (const interview of data.interviews) {
    // Get related questions
    const relatedQuestions = data.questions.filter(
      q => q.interview_id === interview.id
    );
    
    // Transform to MongoDB structure
    const mongoInterview = {
      userId: new Types.ObjectId(interview.user_id),
      topic: interview.topic,
      difficulty: interview.difficulty,
      experienceYears: interview.experience_years,
      totalQuestions: interview.total_questions,
      jobDescription: interview.job_description,
      interviewType: interview.interview_type,
      status: interview.status,
      createdAt: new Date(interview.created_at),
      completedAt: interview.completed_at ? new Date(interview.completed_at) : undefined,
      questions: [],
    };
    
    // Add questions with answers and evaluations
    for (const question of relatedQuestions) {
      const answer = data.answers.find(a => a.question_id === question.id);
      const evaluation = answer ? data.evaluations.find(e => e.answer_id === answer.id) : null;
      
      const mongoQuestion: any = {
        _id: new Types.ObjectId(),
        questionText: question.question_text,
        sequenceNumber: question.sequence_number,
        questionType: question.question_type,
        difficulty: question.difficulty,
        createdAt: new Date(question.created_at),
      };
      
      if (answer) {
        mongoQuestion.answer = {
          _id: new Types.ObjectId(),
          transcript: answer.transcript,
          answerDuration: answer.answer_duration,
          recordingMetadata: JSON.parse(answer.recording_metadata || '{}'),
          metrics: JSON.parse(answer.metrics || '{}'),
          createdAt: new Date(answer.created_at),
        };
        
        if (evaluation) {
          mongoQuestion.answer.evaluation = {
            _id: new Types.ObjectId(),
            scores: {
              technical: evaluation.technical_score,
              communication: evaluation.communication_score,
              leadership: evaluation.leadership_score,
              problemSolving: evaluation.problem_solving_score,
              confidence: evaluation.confidence_score,
              overall: evaluation.overall_score,
            },
            feedback: {
              strengths: JSON.parse(evaluation.strengths || '[]'),
              weaknesses: JSON.parse(evaluation.weaknesses || '[]'),
              suggestions: JSON.parse(evaluation.suggestions || '[]'),
            },
            createdAt: new Date(evaluation.created_at),
          };
        }
      }
      
      mongoInterview.questions.push(mongoQuestion);
    }
    
    // Insert into MongoDB
    await InterviewAggregate.create(mongoInterview);
  }
}
```

---

## Conclusion

This MongoDB architecture provides:

✅ **Production-ready** schema design  
✅ **Scalable** from day one  
✅ **Performant** with proper indexing  
✅ **Flexible** for future requirements  
✅ **Maintainable** with clear patterns  
✅ **Secure** with best practices  

**Recommended Approach**: Embedded documents (Approach B) with 50 question limit

**Next Steps**:
1. Implement base schemas
2. Add indexes
3. Setup soft delete plugin
4. Implement caching layer
5. Add monitoring
6. Load test with production-like data

---

**Document Version**: 1.0  
**Last Updated**: June 9, 2026  
**Status**: ✅ Complete & Production-Ready
