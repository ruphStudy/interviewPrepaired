# Database Schema & Migration Strategy

## Document Overview

This document provides detailed database schema design, migration strategies, and guidelines for transitioning from SQLite to MongoDB.

---

## Table of Contents

1. [Database Design Principles](#database-design-principles)
2. [SQLite Schema](#sqlite-schema)
3. [MongoDB Schema Design](#mongodb-schema-design)
4. [Migration Strategy](#migration-strategy)
5. [Indexing Strategy](#indexing-strategy)
6. [Query Patterns](#query-patterns)
7. [Data Integrity](#data-integrity)
8. [Backup Strategy](#backup-strategy)

---

## Database Design Principles

### Normalization Strategy
- **3NF (Third Normal Form)** for SQLite
- **Denormalization acceptable** for performance
- **No duplicate data** except for caching
- **Foreign key constraints** enforced

### Design Goals
1. **Data Integrity**: Referential integrity through foreign keys
2. **Performance**: Proper indexing for common queries
3. **Scalability**: Easy migration path to MongoDB
4. **Maintainability**: Clear schema with documentation

---

## SQLite Schema

### Entity Relationship Diagram

```
┌──────────────────────────────────────┐
│           interviews                 │
├──────────────────────────────────────┤
│ id                  TEXT PK          │
│ userId              TEXT NOT NULL    │
│ topic               TEXT NOT NULL    │
│ difficulty          TEXT NOT NULL    │
│ experience          INTEGER NOT NULL │
│ numberOfQuestions   INTEGER NOT NULL │
│ jobDescription      TEXT             │
│ status              TEXT NOT NULL    │
│ createdAt           TEXT NOT NULL    │
│ updatedAt           TEXT NOT NULL    │
│ completedAt         TEXT             │
└───────────┬──────────────────────────┘
            │
            │ 1:N
            │
┌───────────▼──────────────────────────┐
│           questions                  │
├──────────────────────────────────────┤
│ id                  TEXT PK          │
│ interviewId         TEXT NOT NULL FK │
│ questionText        TEXT NOT NULL    │
│ questionNumber      INTEGER NOT NULL │
│ isFollowUp          INTEGER NOT NULL │
│ parentQuestionId    TEXT FK          │
│ metadata            TEXT             │
│ createdAt           TEXT NOT NULL    │
└───────────┬──────────────────────────┘
            │
            │ 1:1
            │
┌───────────▼──────────────────────────┐
│           answers                    │
├──────────────────────────────────────┤
│ id                  TEXT PK          │
│ questionId          TEXT NOT NULL FK │
│ answerText          TEXT NOT NULL    │
│ transcriptData      TEXT             │
│ durationSeconds     INTEGER          │
│ createdAt           TEXT NOT NULL    │
└───────────┬──────────────────────────┘
            │
            │ 1:1
            │
┌───────────▼──────────────────────────┐
│           evaluations                │
├──────────────────────────────────────┤
│ id                  TEXT PK          │
│ answerId            TEXT NOT NULL FK │
│ technical           INTEGER NOT NULL │
│ communication       INTEGER NOT NULL │
│ leadership          INTEGER NOT NULL │
│ problemSolving      INTEGER NOT NULL │
│ confidence          INTEGER NOT NULL │
│ strengths           TEXT NOT NULL    │
│ weaknesses          TEXT NOT NULL    │
│ missingPoints       TEXT NOT NULL    │
│ improvements        TEXT NOT NULL    │
│ overallFeedback     TEXT             │
│ createdAt           TEXT NOT NULL    │
└──────────────────────────────────────┘
```

### Table Definitions

#### 1. Interviews Table

```sql
CREATE TABLE IF NOT EXISTS interviews (
  id                TEXT PRIMARY KEY,
  userId            TEXT NOT NULL,
  topic             TEXT NOT NULL CHECK(topic IN (
    'NodeJS', 'Angular', 'React', 'MongoDB', 'TypeScript',
    'SystemDesign', 'TeamLead', 'EngineeringManager', 
    'HRInterview', 'CustomTopic'
  )),
  difficulty        TEXT NOT NULL CHECK(difficulty IN (
    'Beginner', 'Intermediate', 'Advanced', 'Expert'
  )),
  experience        INTEGER NOT NULL CHECK(experience >= 0 AND experience <= 50),
  numberOfQuestions INTEGER NOT NULL CHECK(numberOfQuestions >= 1 AND numberOfQuestions <= 50),
  jobDescription    TEXT,
  status            TEXT NOT NULL DEFAULT 'InProgress' CHECK(status IN (
    'InProgress', 'Completed', 'Paused', 'Cancelled'
  )),
  createdAt         TEXT NOT NULL,
  updatedAt         TEXT NOT NULL,
  completedAt       TEXT,
  
  CONSTRAINT fk_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for interviews table
CREATE INDEX IF NOT EXISTS idx_interviews_userId ON interviews(userId);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status);
CREATE INDEX IF NOT EXISTS idx_interviews_topic ON interviews(topic);
CREATE INDEX IF NOT EXISTS idx_interviews_difficulty ON interviews(difficulty);
CREATE INDEX IF NOT EXISTS idx_interviews_createdAt ON interviews(createdAt);
CREATE INDEX IF NOT EXISTS idx_interviews_userId_status ON interviews(userId, status);
```

#### 2. Questions Table

```sql
CREATE TABLE IF NOT EXISTS questions (
  id               TEXT PRIMARY KEY,
  interviewId      TEXT NOT NULL,
  questionText     TEXT NOT NULL,
  questionNumber   INTEGER NOT NULL CHECK(questionNumber > 0),
  isFollowUp       INTEGER NOT NULL DEFAULT 0 CHECK(isFollowUp IN (0, 1)),
  parentQuestionId TEXT,
  metadata         TEXT, -- JSON string
  createdAt        TEXT NOT NULL,
  
  CONSTRAINT fk_interviewId FOREIGN KEY (interviewId) 
    REFERENCES interviews(id) ON DELETE CASCADE,
  CONSTRAINT fk_parentQuestionId FOREIGN KEY (parentQuestionId) 
    REFERENCES questions(id) ON DELETE SET NULL,
  CONSTRAINT unique_question_number UNIQUE(interviewId, questionNumber)
);

-- Indexes for questions table
CREATE INDEX IF NOT EXISTS idx_questions_interviewId ON questions(interviewId);
CREATE INDEX IF NOT EXISTS idx_questions_parentQuestionId ON questions(parentQuestionId);
CREATE INDEX IF NOT EXISTS idx_questions_questionNumber ON questions(interviewId, questionNumber);
```

#### 3. Answers Table

```sql
CREATE TABLE IF NOT EXISTS answers (
  id              TEXT PRIMARY KEY,
  questionId      TEXT NOT NULL UNIQUE,
  answerText      TEXT NOT NULL,
  transcriptData  TEXT, -- JSON string
  durationSeconds INTEGER CHECK(durationSeconds >= 0),
  createdAt       TEXT NOT NULL,
  
  CONSTRAINT fk_questionId FOREIGN KEY (questionId) 
    REFERENCES questions(id) ON DELETE CASCADE
);

-- Indexes for answers table
CREATE INDEX IF NOT EXISTS idx_answers_questionId ON answers(questionId);
CREATE INDEX IF NOT EXISTS idx_answers_createdAt ON answers(createdAt);
```

#### 4. Evaluations Table

```sql
CREATE TABLE IF NOT EXISTS evaluations (
  id              TEXT PRIMARY KEY,
  answerId        TEXT NOT NULL UNIQUE,
  technical       INTEGER NOT NULL CHECK(technical >= 0 AND technical <= 10),
  communication   INTEGER NOT NULL CHECK(communication >= 0 AND communication <= 10),
  leadership      INTEGER NOT NULL CHECK(leadership >= 0 AND leadership <= 10),
  problemSolving  INTEGER NOT NULL CHECK(problemSolving >= 0 AND problemSolving <= 10),
  confidence      INTEGER NOT NULL CHECK(confidence >= 0 AND confidence <= 10),
  strengths       TEXT NOT NULL, -- JSON array
  weaknesses      TEXT NOT NULL, -- JSON array
  missingPoints   TEXT NOT NULL, -- JSON array
  improvements    TEXT NOT NULL, -- JSON array
  overallFeedback TEXT,
  createdAt       TEXT NOT NULL,
  
  CONSTRAINT fk_answerId FOREIGN KEY (answerId) 
    REFERENCES answers(id) ON DELETE CASCADE
);

-- Indexes for evaluations table
CREATE INDEX IF NOT EXISTS idx_evaluations_answerId ON evaluations(answerId);
CREATE INDEX IF NOT EXISTS idx_evaluations_technical ON evaluations(technical);
CREATE INDEX IF NOT EXISTS idx_evaluations_overall 
  ON evaluations((technical + communication + leadership + problemSolving + confidence) / 5);
```

#### 5. Users Table (Optional - for future use)

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  passwordHash  TEXT NOT NULL,
  firstName     TEXT NOT NULL,
  lastName      TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
  isActive      INTEGER NOT NULL DEFAULT 1 CHECK(isActive IN (0, 1)),
  createdAt     TEXT NOT NULL,
  updatedAt     TEXT NOT NULL,
  lastLoginAt   TEXT
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_isActive ON users(isActive);
```

### Triggers for Data Integrity

```sql
-- Automatically update updatedAt timestamp
CREATE TRIGGER IF NOT EXISTS update_interviews_timestamp 
AFTER UPDATE ON interviews
BEGIN
  UPDATE interviews 
  SET updatedAt = datetime('now') 
  WHERE id = NEW.id;
END;

-- Validate question number sequence
CREATE TRIGGER IF NOT EXISTS validate_question_number
BEFORE INSERT ON questions
BEGIN
  SELECT CASE
    WHEN (
      SELECT COUNT(*) FROM questions 
      WHERE interviewId = NEW.interviewId 
      AND questionNumber = NEW.questionNumber
    ) > 0
    THEN RAISE(ABORT, 'Question number must be unique within interview')
  END;
END;

-- Prevent deletion of interview with unevaluated answers
CREATE TRIGGER IF NOT EXISTS prevent_premature_deletion
BEFORE DELETE ON interviews
BEGIN
  SELECT CASE
    WHEN (
      SELECT COUNT(*) FROM answers a
      JOIN questions q ON q.id = a.questionId
      LEFT JOIN evaluations e ON e.answerId = a.id
      WHERE q.interviewId = OLD.id AND e.id IS NULL
    ) > 0
    THEN RAISE(ABORT, 'Cannot delete interview with unevaluated answers')
  END;
END;
```

### Views for Common Queries

```sql
-- View for interview summary
CREATE VIEW IF NOT EXISTS v_interview_summary AS
SELECT 
  i.id,
  i.userId,
  i.topic,
  i.difficulty,
  i.status,
  COUNT(DISTINCT q.id) as totalQuestions,
  COUNT(DISTINCT a.id) as totalAnswers,
  COUNT(DISTINCT e.id) as totalEvaluations,
  AVG(e.technical) as avgTechnical,
  AVG(e.communication) as avgCommunication,
  AVG(e.leadership) as avgLeadership,
  AVG(e.problemSolving) as avgProblemSolving,
  AVG(e.confidence) as avgConfidence,
  (AVG(e.technical) + AVG(e.communication) + AVG(e.leadership) + 
   AVG(e.problemSolving) + AVG(e.confidence)) / 5 as avgOverall,
  i.createdAt,
  i.completedAt
FROM interviews i
LEFT JOIN questions q ON q.interviewId = i.id
LEFT JOIN answers a ON a.questionId = q.id
LEFT JOIN evaluations e ON e.answerId = a.id
GROUP BY i.id;

-- View for question with answer and evaluation
CREATE VIEW IF NOT EXISTS v_question_details AS
SELECT 
  q.id as questionId,
  q.interviewId,
  q.questionText,
  q.questionNumber,
  q.isFollowUp,
  a.id as answerId,
  a.answerText,
  a.durationSeconds,
  e.id as evaluationId,
  e.technical,
  e.communication,
  e.leadership,
  e.problemSolving,
  e.confidence,
  e.strengths,
  e.weaknesses,
  e.improvements,
  q.createdAt as questionCreatedAt,
  a.createdAt as answerCreatedAt,
  e.createdAt as evaluationCreatedAt
FROM questions q
LEFT JOIN answers a ON a.questionId = q.id
LEFT JOIN evaluations e ON e.answerId = a.id;
```

---

## MongoDB Schema Design

### Collection Structure

When migrating to MongoDB, we'll use a hybrid approach:
- **Normalized collections** for interviews and users
- **Embedded documents** for questions, answers, and evaluations (optional)

#### 1. Interviews Collection

```javascript
// interviews collection
{
  _id: ObjectId("..."),
  userId: ObjectId("..."),
  topic: "NodeJS",
  difficulty: "Intermediate",
  experience: 5,
  numberOfQuestions: 10,
  jobDescription: "...",
  status: "InProgress",
  createdAt: ISODate("2024-06-09T10:30:00Z"),
  updatedAt: ISODate("2024-06-09T10:30:00Z"),
  completedAt: null,
  
  // Optional: Embedded questions for performance
  questions: [
    {
      _id: ObjectId("..."),
      questionText: "...",
      questionNumber: 1,
      isFollowUp: false,
      parentQuestionId: null,
      metadata: {},
      createdAt: ISODate("..."),
      
      // Optionally embed answer and evaluation
      answer: {
        _id: ObjectId("..."),
        answerText: "...",
        transcriptData: {},
        durationSeconds: 180,
        createdAt: ISODate("..."),
        
        evaluation: {
          _id: ObjectId("..."),
          technical: 8,
          communication: 7,
          leadership: 6,
          problemSolving: 8,
          confidence: 7,
          strengths: ["...", "..."],
          weaknesses: ["...", "..."],
          missingPoints: ["...", "..."],
          improvements: ["...", "..."],
          overallFeedback: "...",
          createdAt: ISODate("...")
        }
      }
    }
  ],
  
  // Computed fields
  progress: {
    totalQuestions: 10,
    answeredQuestions: 5,
    evaluatedQuestions: 3,
    percentComplete: 50
  },
  
  // Aggregated scores
  averageScores: {
    technical: 7.5,
    communication: 8.0,
    leadership: 6.5,
    problemSolving: 8.2,
    confidence: 7.8,
    overall: 7.6
  }
}
```

#### 2. Questions Collection (Normalized Approach)

```javascript
// questions collection
{
  _id: ObjectId("..."),
  interviewId: ObjectId("..."),
  questionText: "How does Node.js handle concurrency?",
  questionNumber: 1,
  isFollowUp: false,
  parentQuestionId: null,
  metadata: {
    generatedBy: "GPT-4",
    promptVersion: "1.0",
    generationTime: 1500
  },
  createdAt: ISODate("2024-06-09T10:30:00Z")
}
```

#### 3. Answers Collection

```javascript
// answers collection
{
  _id: ObjectId("..."),
  questionId: ObjectId("..."),
  interviewId: ObjectId("..."), // Denormalized for queries
  answerText: "Node.js uses an event-driven, non-blocking I/O model...",
  transcriptData: {
    segments: [
      { text: "Node.js uses", confidence: 0.95, timestamp: 0 },
      // ...
    ],
    averageConfidence: 0.92
  },
  durationSeconds: 180,
  createdAt: ISODate("2024-06-09T10:32:00Z")
}
```

#### 4. Evaluations Collection

```javascript
// evaluations collection
{
  _id: ObjectId("..."),
  answerId: ObjectId("..."),
  questionId: ObjectId("..."), // Denormalized
  interviewId: ObjectId("..."), // Denormalized
  scores: {
    technical: 8,
    communication: 7,
    leadership: 6,
    problemSolving: 8,
    confidence: 7,
    overall: 7.2
  },
  feedback: {
    strengths: [
      "Clear understanding of event loop",
      "Good explanation of non-blocking I/O"
    ],
    weaknesses: [
      "Could provide more real-world examples",
      "Lacked depth in worker threads discussion"
    ],
    missingPoints: [
      "No mention of clustering",
      "Didn't discuss thread pool"
    ],
    improvements: [
      "Study Node.js clustering",
      "Practice more code examples"
    ]
  },
  overallFeedback: "Strong foundational understanding...",
  metadata: {
    modelUsed: "GPT-4",
    evaluationTime: 2000
  },
  createdAt: ISODate("2024-06-09T10:33:00Z")
}
```

#### 5. Users Collection

```javascript
// users collection
{
  _id: ObjectId("..."),
  email: "user@example.com",
  passwordHash: "$2b$10$...",
  profile: {
    firstName: "John",
    lastName: "Doe",
    avatar: "https://...",
    bio: "..."
  },
  role: "user",
  isActive: true,
  preferences: {
    theme: "dark",
    notifications: true,
    emailUpdates: false
  },
  statistics: {
    totalInterviews: 25,
    completedInterviews: 20,
    averageScore: 7.8,
    strongestArea: "Technical",
    weakestArea: "Communication"
  },
  createdAt: ISODate("2024-01-01T00:00:00Z"),
  updatedAt: ISODate("2024-06-09T10:30:00Z"),
  lastLoginAt: ISODate("2024-06-09T10:00:00Z")
}
```

### MongoDB Indexes

```javascript
// Interviews collection
db.interviews.createIndex({ userId: 1, status: 1 });
db.interviews.createIndex({ topic: 1, difficulty: 1 });
db.interviews.createIndex({ createdAt: -1 });
db.interviews.createIndex({ userId: 1, createdAt: -1 });
db.interviews.createIndex({ status: 1, createdAt: -1 });

// Questions collection
db.questions.createIndex({ interviewId: 1, questionNumber: 1 }, { unique: true });
db.questions.createIndex({ parentQuestionId: 1 });
db.questions.createIndex({ createdAt: -1 });

// Answers collection
db.answers.createIndex({ questionId: 1 }, { unique: true });
db.answers.createIndex({ interviewId: 1 });
db.answers.createIndex({ createdAt: -1 });

// Evaluations collection
db.evaluations.createIndex({ answerId: 1 }, { unique: true });
db.evaluations.createIndex({ questionId: 1 });
db.evaluations.createIndex({ interviewId: 1 });
db.evaluations.createIndex({ "scores.overall": -1 });
db.evaluations.createIndex({ createdAt: -1 });

// Users collection
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ isActive: 1 });
db.users.createIndex({ createdAt: -1 });

// Compound indexes for common queries
db.interviews.createIndex({ 
  userId: 1, 
  status: 1, 
  "averageScores.overall": -1 
});
```

---

## Migration Strategy

### Phase 1: Preparation (Week 1)

**Goals:**
- Analyze current data structure
- Design MongoDB schema
- Create migration scripts
- Setup test MongoDB instance

**Tasks:**
1. Export current SQLite data
2. Analyze data patterns and relationships
3. Design optimal MongoDB schema
4. Create data transformation scripts
5. Setup MongoDB development environment

### Phase 2: Dual-Write Implementation (Week 2-3)

**Goals:**
- Implement repository abstraction
- Write to both databases simultaneously
- Validate data consistency

**Implementation:**

```typescript
// Repository factory
class RepositoryFactory {
  static createInterviewRepository(): IInterviewRepository {
    const dbType = process.env.DB_TYPE;
    
    if (dbType === 'mongodb') {
      return container.resolve(MongoInterviewRepository);
    }
    return container.resolve(SQLiteInterviewRepository);
  }
}

// Dual-write wrapper
class DualWriteInterviewRepository implements IInterviewRepository {
  constructor(
    private sqliteRepo: SQLiteInterviewRepository,
    private mongoRepo: MongoInterviewRepository
  ) {}

  async create(data: Partial<Interview>): Promise<Interview> {
    // Write to both databases
    const [sqliteResult, mongoResult] = await Promise.all([
      this.sqliteRepo.create(data),
      this.mongoRepo.create(data)
    ]);

    // Validate consistency
    this.validateConsistency(sqliteResult, mongoResult);

    return sqliteResult; // Return SQLite as source of truth
  }

  private validateConsistency(sqlite: Interview, mongo: Interview): void {
    // Compare results and log discrepancies
    if (sqlite.id !== mongo.id) {
      logger.error('Data inconsistency detected', { sqlite, mongo });
    }
  }
}
```

### Phase 3: Data Migration (Week 4)

**Goals:**
- Migrate historical data
- Verify data integrity
- Performance testing

**Migration Script:**

```typescript
class DataMigrationService {
  async migrateInterviews(): Promise<void> {
    logger.info('Starting interview migration');

    const sqliteInterviews = await this.sqliteRepo.findAll();
    const batchSize = 100;

    for (let i = 0; i < sqliteInterviews.length; i += batchSize) {
      const batch = sqliteInterviews.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(interview => this.migrateInterview(interview))
      );

      logger.info(`Migrated ${i + batch.length} / ${sqliteInterviews.length} interviews`);
    }

    logger.info('Interview migration completed');
  }

  private async migrateInterview(interview: Interview): Promise<void> {
    // Transform SQLite data to MongoDB format
    const mongoDoc = this.transformToMongo(interview);

    // Insert with same ID
    await this.mongoRepo.insertWithId(mongoDoc);

    // Verify
    const inserted = await this.mongoRepo.findById(interview.id);
    if (!inserted) {
      throw new Error(`Failed to migrate interview ${interview.id}`);
    }
  }

  private transformToMongo(interview: Interview): any {
    return {
      _id: interview.id,
      userId: interview.userId,
      topic: interview.topic,
      difficulty: interview.difficulty,
      // ... map all fields
      createdAt: new Date(interview.createdAt),
      updatedAt: new Date(interview.updatedAt)
    };
  }
}
```

### Phase 4: Read Migration (Week 5)

**Goals:**
- Gradually shift reads to MongoDB
- Monitor performance
- Rollback capability

**Implementation:**

```typescript
class ReadMigrationService {
  private readPercentage = 0; // 0-100

  async getInterview(id: string): Promise<Interview> {
    // Randomly decide which database to read from
    if (Math.random() * 100 < this.readPercentage) {
      try {
        return await this.mongoRepo.findById(id);
      } catch (error) {
        logger.error('MongoDB read failed, falling back to SQLite', error);
        return await this.sqliteRepo.findById(id);
      }
    }

    return await this.sqliteRepo.findById(id);
  }

  // Gradually increase read percentage
  increaseReadPercentage(amount: number): void {
    this.readPercentage = Math.min(100, this.readPercentage + amount);
    logger.info(`MongoDB read percentage: ${this.readPercentage}%`);
  }
}
```

### Phase 5: Cutover (Week 6)

**Goals:**
- Switch to MongoDB completely
- Remove SQLite dependencies
- Cleanup code

**Cutover Checklist:**
- [ ] 100% of reads from MongoDB
- [ ] 100% of writes to MongoDB
- [ ] Performance metrics acceptable
- [ ] No data inconsistencies
- [ ] Backup strategy in place
- [ ] Rollback plan tested
- [ ] Team training completed
- [ ] Documentation updated

---

## Indexing Strategy

### SQLite Index Guidelines

1. **Single Column Indexes**: For simple WHERE clauses
2. **Composite Indexes**: For multi-column WHERE/ORDER BY
3. **Covering Indexes**: Include all columns needed in query
4. **Avoid Over-Indexing**: Each index has write cost

### MongoDB Index Guidelines

1. **Compound Indexes**: Match query patterns
2. **Index Prefix**: Use efficiently
3. **Index Cardinality**: High cardinality fields first
4. **Text Indexes**: For full-text search (if needed)
5. **TTL Indexes**: For automatic document expiration (if needed)

### Index Monitoring

```typescript
// Check index usage (SQLite)
const checkIndexUsage = async (): Promise<void> => {
  const query = `
    SELECT * FROM sqlite_stat1
    WHERE tbl IN ('interviews', 'questions', 'answers', 'evaluations')
  `;
  const stats = await db.all(query);
  console.log('Index statistics:', stats);
};

// Check index usage (MongoDB)
const checkMongoIndexUsage = async (): Promise<void> => {
  const stats = await db.collection('interviews').aggregate([
    { $indexStats: {} }
  ]).toArray();
  console.log('Index statistics:', stats);
};
```

---

## Query Patterns

### Common Query Patterns

#### 1. Get Interview with All Details

**SQLite:**
```sql
SELECT 
  i.*,
  json_group_array(
    json_object(
      'id', q.id,
      'questionText', q.questionText,
      'answer', (
        SELECT json_object(
          'id', a.id,
          'answerText', a.answerText,
          'evaluation', (
            SELECT json_object(
              'id', e.id,
              'technical', e.technical,
              'communication', e.communication
            )
            FROM evaluations e WHERE e.answerId = a.id
          )
        )
        FROM answers a WHERE a.questionId = q.id
      )
    )
  ) as questions
FROM interviews i
LEFT JOIN questions q ON q.interviewId = i.id
WHERE i.id = ?
GROUP BY i.id;
```

**MongoDB:**
```javascript
db.interviews.aggregate([
  { $match: { _id: ObjectId("...") } },
  {
    $lookup: {
      from: "questions",
      localField: "_id",
      foreignField: "interviewId",
      as: "questions"
    }
  },
  {
    $lookup: {
      from: "answers",
      localField: "questions._id",
      foreignField: "questionId",
      as: "answers"
    }
  },
  {
    $lookup: {
      from: "evaluations",
      localField: "answers._id",
      foreignField: "answerId",
      as: "evaluations"
    }
  }
]);
```

#### 2. Get User Interview History with Scores

**SQLite:**
```sql
SELECT 
  i.id,
  i.topic,
  i.difficulty,
  i.status,
  COUNT(DISTINCT q.id) as totalQuestions,
  AVG(e.technical) as avgTechnical,
  AVG(e.communication) as avgCommunication,
  (AVG(e.technical) + AVG(e.communication) + AVG(e.leadership) + 
   AVG(e.problemSolving) + AVG(e.confidence)) / 5 as avgOverall
FROM interviews i
LEFT JOIN questions q ON q.interviewId = i.id
LEFT JOIN answers a ON a.questionId = q.id
LEFT JOIN evaluations e ON e.answerId = a.id
WHERE i.userId = ?
GROUP BY i.id
ORDER BY i.createdAt DESC
LIMIT ? OFFSET ?;
```

**MongoDB:**
```javascript
db.interviews.aggregate([
  { $match: { userId: ObjectId("...") } },
  { $sort: { createdAt: -1 } },
  { $skip: offset },
  { $limit: limit },
  {
    $project: {
      id: "$_id",
      topic: 1,
      difficulty: 1,
      status: 1,
      totalQuestions: { $size: "$questions" },
      avgOverall: "$averageScores.overall"
    }
  }
]);
```

---

## Data Integrity

### Referential Integrity Rules

1. **Cascade Delete**: When interview deleted, delete all related data
2. **Restrict Delete**: Cannot delete if unevaluated answers exist
3. **Set Null**: When parent question deleted, set parentQuestionId to null
4. **No Action**: For some relationships

### Data Validation Rules

1. **Interview**: 
   - numberOfQuestions: 1-50
   - experience: 0-50
   - status: enum values only

2. **Question**:
   - questionNumber: > 0, unique per interview
   - isFollowUp: boolean (0 or 1)

3. **Evaluation**:
   - All scores: 0-10
   - Arrays: non-empty

### Consistency Checks

```typescript
class DataIntegrityService {
  async checkIntegrity(): Promise<IntegrityReport> {
    const checks = await Promise.all([
      this.checkOrphanedQuestions(),
      this.checkOrphanedAnswers(),
      this.checkOrphanedEvaluations(),
      this.checkInvalidScores(),
      this.checkDuplicateQuestionNumbers()
    ]);

    return {
      checks,
      hasIssues: checks.some(c => c.issues.length > 0),
      totalIssues: checks.reduce((sum, c) => sum + c.issues.length, 0)
    };
  }

  private async checkOrphanedQuestions(): Promise<IntegrityCheck> {
    // Find questions without interviews
    const orphaned = await db.all(`
      SELECT q.id FROM questions q
      LEFT JOIN interviews i ON i.id = q.interviewId
      WHERE i.id IS NULL
    `);

    return {
      name: 'Orphaned Questions',
      issues: orphaned,
      severity: 'high'
    };
  }
}
```

---

## Backup Strategy

### SQLite Backup

```typescript
class SQLiteBackupService {
  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `./backups/interview_${timestamp}.db`;

    // Copy database file
    await fs.copyFile(process.env.DATABASE_PATH!, backupPath);

    // Compress
    await this.compress(backupPath);

    logger.info(`Backup created: ${backupPath}.gz`);
    return `${backupPath}.gz`;
  }

  async restoreBackup(backupPath: string): Promise<void> {
    // Decompress
    const dbPath = await this.decompress(backupPath);

    // Verify integrity
    const isValid = await this.verifyDatabase(dbPath);
    if (!isValid) {
      throw new Error('Backup file is corrupted');
    }

    // Replace current database
    await fs.copyFile(dbPath, process.env.DATABASE_PATH!);

    logger.info('Database restored from backup');
  }

  async scheduleBackups(): void {
    // Daily backups
    cron.schedule('0 2 * * *', async () => {
      await this.createBackup();
      await this.cleanOldBackups(30); // Keep 30 days
    });
  }
}
```

### MongoDB Backup

```bash
# Backup entire database
mongodump --uri="mongodb://localhost:27017/interview-coach" --out=/backups/$(date +%Y%m%d)

# Backup specific collection
mongodump --uri="mongodb://localhost:27017/interview-coach" --collection=interviews --out=/backups

# Restore
mongorestore --uri="mongodb://localhost:27017/interview-coach" /backups/20240609
```

---

This database schema and migration strategy ensures data integrity, performance, and a smooth transition from SQLite to MongoDB when needed.

