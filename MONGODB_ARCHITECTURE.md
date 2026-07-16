# MongoDB Database Architecture - AI Voice Interview Coach

## Document Overview

Complete MongoDB database schema design with two architectural approaches, comparison, and production-ready implementation guidelines.

**Database**: MongoDB 7.0+  
**ODM**: Mongoose 8.x  
**Language**: TypeScript 5.x  
**Date**: June 9, 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Approach A: Normalized Collections](#approach-a-normalized-collections)
3. [Approach B: Embedded Documents](#approach-b-embedded-documents)
4. [Comparison & Recommendation](#comparison--recommendation)
5. [Indexing Strategy](#indexing-strategy)
6. [Aggregation Pipelines](#aggregation-pipelines)
7. [Query Optimization](#query-optimization)
8. [Validation Rules](#validation-rules)
9. [Pagination Strategy](#pagination-strategy)
10. [Soft Delete Strategy](#soft-delete-strategy)
11. [Scalability Strategy](#scalability-strategy)
12. [Best Practices](#best-practices)

---

## Architecture Overview

### Database Design Goals

1. **Performance**: Fast reads for reports and analytics
2. **Scalability**: Handle growing interview data efficiently
3. **Flexibility**: Easy to query and aggregate data
4. **Data Integrity**: Maintain relationships and consistency
5. **Development Speed**: Simple to implement and maintain

### Data Characteristics

| Aspect | Characteristic | Implication |
|--------|---------------|-------------|
| **Read/Write Ratio** | 70% Read, 30% Write | Optimize for reads |
| **Data Growth** | Linear with users | Plan for sharding |
| **Access Pattern** | Interview-centric | Consider embedding |
| **Document Size** | Varies (questions × answers) | Monitor 16MB limit |
| **Relationship Type** | One-to-many | Good for embedding |
| **Update Frequency** | Append-only (mostly) | Suitable for arrays |
| **Query Pattern** | Full interview retrieval | Favor embedding |

---

## Approach A: Normalized Collections

### Collection Structure

```
MongoDB Database: interview_coach
├── users (User accounts)
├── interviews (Interview sessions)
├── questions (Interview questions)
├── answers (Candidate answers)
├── evaluations (AI evaluations)
└── reports (Performance reports)
```

### 1. Users Collection

**TypeScript Interface:**

```typescript
interface IUser {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  profile: {
    firstName: string;
    lastName: string;
    avatar?: string;
    bio?: string;
  };
  role: 'user' | 'admin';
  isActive: boolean;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
    emailUpdates: boolean;
  };
  statistics: {
    totalInterviews: number;
    completedInterviews: number;
    averageScore: number;
    lastInterviewDate?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
import { Schema, model, Document } from 'mongoose';

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Don't return in queries by default
    },
    profile: {
      firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters'],
      },
      lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters'],
      },
      avatar: {
        type: String,
        match: [/^https?:\/\/.+/, 'Please enter a valid URL'],
      },
      bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
      },
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light',
      },
      notifications: {
        type: Boolean,
        default: true,
      },
      emailUpdates: {
        type: Boolean,
        default: false,
      },
    },
    statistics: {
      totalInterviews: {
        type: Number,
        default: 0,
        min: 0,
      },
      completedInterviews: {
        type: Number,
        default: 0,
        min: 0,
      },
      averageScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 10,
      },
      lastInterviewDate: Date,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ deletedAt: 1 }, { sparse: true });

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

export const User = model<IUser>('User', userSchema);
```

### 2. Interviews Collection

**TypeScript Interface:**

```typescript
interface IInterview {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  experienceYears: number;
  totalQuestions: number;
  jobDescription?: string;
  interviewType: 'technical' | 'behavioral' | 'system-design' | 'leadership';
  status: 'not-started' | 'in-progress' | 'completed' | 'abandoned';
  progress: {
    questionsAsked: number;
    questionsAnswered: number;
    questionsEvaluated: number;
    currentQuestionNumber?: number;
  };
  metadata: {
    duration?: number; // in seconds
    averageAnswerTime?: number;
    ipAddress?: string;
    userAgent?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const interviewSchema = new Schema<IInterview>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      enum: [
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
      ],
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    experienceYears: {
      type: Number,
      required: [true, 'Experience years is required'],
      min: [0, 'Experience cannot be negative'],
      max: [50, 'Experience cannot exceed 50 years'],
    },
    totalQuestions: {
      type: Number,
      required: [true, 'Total questions is required'],
      min: [1, 'Must have at least 1 question'],
      max: [50, 'Cannot exceed 50 questions'],
    },
    jobDescription: {
      type: String,
      maxlength: [5000, 'Job description cannot exceed 5000 characters'],
    },
    interviewType: {
      type: String,
      required: true,
      enum: ['technical', 'behavioral', 'system-design', 'leadership'],
      default: 'technical',
    },
    status: {
      type: String,
      required: true,
      enum: ['not-started', 'in-progress', 'completed', 'abandoned'],
      default: 'not-started',
    },
    progress: {
      questionsAsked: {
        type: Number,
        default: 0,
        min: 0,
      },
      questionsAnswered: {
        type: Number,
        default: 0,
        min: 0,
      },
      questionsEvaluated: {
        type: Number,
        default: 0,
        min: 0,
      },
      currentQuestionNumber: Number,
    },
    metadata: {
      duration: Number,
      averageAnswerTime: Number,
      ipAddress: String,
      userAgent: String,
    },
    completedAt: Date,
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'interviews',
  }
);

// Compound Indexes
interviewSchema.index({ userId: 1, status: 1 });
interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ topic: 1, difficulty: 1 });
interviewSchema.index({ status: 1, createdAt: -1 });
interviewSchema.index({ deletedAt: 1 }, { sparse: true });

// Virtual for completion percentage
interviewSchema.virtual('completionPercentage').get(function () {
  if (this.totalQuestions === 0) return 0;
  return (this.progress.questionsAnswered / this.totalQuestions) * 100;
});

export const Interview = model<IInterview>('Interview', interviewSchema);
```

### 3. Questions Collection

**TypeScript Interface:**

```typescript
interface IQuestion {
  _id: Types.ObjectId;
  interviewId: Types.ObjectId;
  questionText: string;
  sequenceNumber: number;
  questionType: 'primary' | 'follow-up';
  parentQuestionId?: Types.ObjectId;
  difficulty: 'easy' | 'medium' | 'hard';
  category?: string;
  expectedKeywords?: string[];
  metadata: {
    generatedBy: 'GPT-4' | 'GPT-3.5';
    promptVersion: string;
    generationTime: number; // in milliseconds
    tokenCount?: number;
  };
  createdAt: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const questionSchema = new Schema<IQuestion>(
  {
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
      required: [true, 'Interview ID is required'],
      index: true,
    },
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      minlength: [10, 'Question must be at least 10 characters'],
      maxlength: [1000, 'Question cannot exceed 1000 characters'],
    },
    sequenceNumber: {
      type: Number,
      required: [true, 'Sequence number is required'],
      min: [1, 'Sequence number must be at least 1'],
    },
    questionType: {
      type: String,
      required: true,
      enum: ['primary', 'follow-up'],
      default: 'primary',
    },
    parentQuestionId: {
      type: Schema.Types.ObjectId,
      ref: 'Question',
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    category: String,
    expectedKeywords: [String],
    metadata: {
      generatedBy: {
        type: String,
        enum: ['GPT-4', 'GPT-3.5'],
        default: 'GPT-4',
      },
      promptVersion: String,
      generationTime: Number,
      tokenCount: Number,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'questions',
  }
);

// Compound Indexes
questionSchema.index({ interviewId: 1, sequenceNumber: 1 }, { unique: true });
questionSchema.index({ parentQuestionId: 1 });
questionSchema.index({ createdAt: -1 });
questionSchema.index({ deletedAt: 1 }, { sparse: true });

export const Question = model<IQuestion>('Question', questionSchema);
```

### 4. Answers Collection

**TypeScript Interface:**

```typescript
interface IAnswer {
  _id: Types.ObjectId;
  questionId: Types.ObjectId;
  interviewId: Types.ObjectId; // Denormalized for faster queries
  transcript: string;
  answerDuration: number; // in seconds
  recordingMetadata: {
    audioQuality?: string;
    transcriptionConfidence?: number;
    language: string;
    silenceDuration?: number;
    fillerWords?: {
      word: string;
      count: number;
    }[];
    speakingPace?: number; // words per minute
  };
  metrics: {
    wordCount: number;
    characterCount: number;
    sentenceCount: number;
    averageWordsPerSentence?: number;
  };
  createdAt: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const answerSchema = new Schema<IAnswer>(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Question ID is required'],
      unique: true, // One answer per question
      index: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
      required: [true, 'Interview ID is required'],
      index: true,
    },
    transcript: {
      type: String,
      required: [true, 'Transcript is required'],
      minlength: [10, 'Answer must be at least 10 characters'],
      maxlength: [10000, 'Answer cannot exceed 10000 characters'],
    },
    answerDuration: {
      type: Number,
      required: [true, 'Answer duration is required'],
      min: [0, 'Duration cannot be negative'],
    },
    recordingMetadata: {
      audioQuality: String,
      transcriptionConfidence: {
        type: Number,
        min: 0,
        max: 1,
      },
      language: {
        type: String,
        default: 'en-US',
      },
      silenceDuration: Number,
      fillerWords: [
        {
          word: String,
          count: Number,
        },
      ],
      speakingPace: Number,
    },
    metrics: {
      wordCount: {
        type: Number,
        required: true,
        min: 0,
      },
      characterCount: {
        type: Number,
        required: true,
        min: 0,
      },
      sentenceCount: {
        type: Number,
        required: true,
        min: 0,
      },
      averageWordsPerSentence: Number,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'answers',
  }
);

// Indexes
answerSchema.index({ questionId: 1 }, { unique: true });
answerSchema.index({ interviewId: 1 });
answerSchema.index({ createdAt: -1 });
answerSchema.index({ deletedAt: 1 }, { sparse: true });

// Pre-save hook to calculate metrics
answerSchema.pre('save', function (next) {
  if (this.isModified('transcript')) {
    const words = this.transcript.trim().split(/\s+/);
    const sentences = this.transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    this.metrics.wordCount = words.length;
    this.metrics.characterCount = this.transcript.length;
    this.metrics.sentenceCount = sentences.length;
    
    if (sentences.length > 0) {
      this.metrics.averageWordsPerSentence = words.length / sentences.length;
    }
  }
  next();
});

export const Answer = model<IAnswer>('Answer', answerSchema);
```

### 5. Evaluations Collection

**TypeScript Interface:**

```typescript
interface IEvaluation {
  _id: Types.ObjectId;
  answerId: Types.ObjectId;
  questionId: Types.ObjectId; // Denormalized
  interviewId: Types.ObjectId; // Denormalized
  scores: {
    technical: number;
    communication: number;
    leadership: number;
    problemSolving: number;
    confidence: number;
    overall: number;
  };
  feedback: {
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    detailedAnalysis?: string;
  };
  metrics: {
    keywordMatch?: number; // percentage
    responseCompleteness?: number; // percentage
    relevanceScore?: number; // 0-10
  };
  metadata: {
    evaluatedBy: 'GPT-4' | 'GPT-3.5';
    promptVersion: string;
    evaluationTime: number; // in milliseconds
    tokenCount?: number;
  };
  createdAt: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const evaluationSchema = new Schema<IEvaluation>(
  {
    answerId: {
      type: Schema.Types.ObjectId,
      ref: 'Answer',
      required: [true, 'Answer ID is required'],
      unique: true, // One evaluation per answer
      index: true,
    },
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Question ID is required'],
      index: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
      required: [true, 'Interview ID is required'],
      index: true,
    },
    scores: {
      technical: {
        type: Number,
        required: [true, 'Technical score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
      communication: {
        type: Number,
        required: [true, 'Communication score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
      leadership: {
        type: Number,
        required: [true, 'Leadership score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
      problemSolving: {
        type: Number,
        required: [true, 'Problem solving score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
      confidence: {
        type: Number,
        required: [true, 'Confidence score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
      overall: {
        type: Number,
        required: [true, 'Overall score is required'],
        min: [0, 'Score cannot be less than 0'],
        max: [10, 'Score cannot exceed 10'],
      },
    },
    feedback: {
      strengths: {
        type: [String],
        default: [],
      },
      weaknesses: {
        type: [String],
        default: [],
      },
      suggestions: {
        type: [String],
        default: [],
      },
      detailedAnalysis: String,
    },
    metrics: {
      keywordMatch: {
        type: Number,
        min: 0,
        max: 100,
      },
      responseCompleteness: {
        type: Number,
        min: 0,
        max: 100,
      },
      relevanceScore: {
        type: Number,
        min: 0,
        max: 10,
      },
    },
    metadata: {
      evaluatedBy: {
        type: String,
        enum: ['GPT-4', 'GPT-3.5'],
        default: 'GPT-4',
      },
      promptVersion: String,
      evaluationTime: Number,
      tokenCount: Number,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'evaluations',
  }
);

// Indexes
evaluationSchema.index({ answerId: 1 }, { unique: true });
evaluationSchema.index({ questionId: 1 });
evaluationSchema.index({ interviewId: 1 });
evaluationSchema.index({ 'scores.overall': -1 });
evaluationSchema.index({ createdAt: -1 });
evaluationSchema.index({ deletedAt: 1 }, { sparse: true });

// Pre-save hook to calculate overall score
evaluationSchema.pre('save', function (next) {
  if (this.isModified('scores')) {
    const { technical, communication, leadership, problemSolving, confidence } = this.scores;
    this.scores.overall = (technical + communication + leadership + problemSolving + confidence) / 5;
  }
  next();
});

export const Evaluation = model<IEvaluation>('Evaluation', evaluationSchema);
```

### 6. Reports Collection

**TypeScript Interface:**

```typescript
interface IReport {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  interviewId: Types.ObjectId;
  averageScores: {
    technical: number;
    communication: number;
    leadership: number;
    problemSolving: number;
    confidence: number;
    overall: number;
  };
  scoreDistribution: {
    range: string; // e.g., "0-2", "2-4", etc.
    count: number;
  }[];
  summary: {
    totalQuestions: number;
    totalAnswered: number;
    totalEvaluated: number;
    averageAnswerTime: number;
    totalDuration: number;
  };
  insights: {
    topStrengths: string[];
    topWeaknesses: string[];
    improvementAreas: string[];
    overallAssessment: string;
  };
  recommendations: {
    studyTopics: string[];
    practiceAreas: string[];
    resourceLinks?: string[];
  };
  comparison?: {
    previousInterviewScore?: number;
    averageScoreChange?: number;
    industryAverage?: number;
  };
  generatedAt: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const reportSchema = new Schema<IReport>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
      required: [true, 'Interview ID is required'],
      unique: true, // One report per interview
      index: true,
    },
    averageScores: {
      technical: { type: Number, min: 0, max: 10, required: true },
      communication: { type: Number, min: 0, max: 10, required: true },
      leadership: { type: Number, min: 0, max: 10, required: true },
      problemSolving: { type: Number, min: 0, max: 10, required: true },
      confidence: { type: Number, min: 0, max: 10, required: true },
      overall: { type: Number, min: 0, max: 10, required: true },
    },
    scoreDistribution: [
      {
        range: String,
        count: Number,
      },
    ],
    summary: {
      totalQuestions: { type: Number, required: true },
      totalAnswered: { type: Number, required: true },
      totalEvaluated: { type: Number, required: true },
      averageAnswerTime: Number,
      totalDuration: Number,
    },
    insights: {
      topStrengths: [String],
      topWeaknesses: [String],
      improvementAreas: [String],
      overallAssessment: String,
    },
    recommendations: {
      studyTopics: [String],
      practiceAreas: [String],
      resourceLinks: [String],
    },
    comparison: {
      previousInterviewScore: Number,
      averageScoreChange: Number,
      industryAverage: Number,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    deletedAt: Date,
  },
  {
    timestamps: false,
    collection: 'reports',
  }
);

// Indexes
reportSchema.index({ userId: 1, generatedAt: -1 });
reportSchema.index({ interviewId: 1 }, { unique: true });
reportSchema.index({ 'averageScores.overall': -1 });
reportSchema.index({ deletedAt: 1 }, { sparse: true });

export const Report = model<IReport>('Report', reportSchema);
```

---

## Approach B: Embedded Documents

### Single Interview Aggregate Document

**TypeScript Interface:**

```typescript
interface IInterviewAggregate {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  
  // Interview Info
  topic: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  experienceYears: number;
  totalQuestions: number;
  jobDescription?: string;
  interviewType: 'technical' | 'behavioral' | 'system-design' | 'leadership';
  status: 'not-started' | 'in-progress' | 'completed' | 'abandoned';
  
  // Embedded Questions with Answers and Evaluations
  questions: Array<{
    _id: Types.ObjectId;
    questionText: string;
    sequenceNumber: number;
    questionType: 'primary' | 'follow-up';
    parentQuestionId?: Types.ObjectId;
    difficulty: 'easy' | 'medium' | 'hard';
    category?: string;
    expectedKeywords?: string[];
    createdAt: Date;
    
    // Embedded Answer
    answer?: {
      _id: Types.ObjectId;
      transcript: string;
      answerDuration: number;
      recordingMetadata: {
        audioQuality?: string;
        transcriptionConfidence?: number;
        language: string;
        silenceDuration?: number;
        fillerWords?: Array<{ word: string; count: number }>;
        speakingPace?: number;
      };
      metrics: {
        wordCount: number;
        characterCount: number;
        sentenceCount: number;
        averageWordsPerSentence?: number;
      };
      createdAt: Date;
      
      // Embedded Evaluation
      evaluation?: {
        _id: Types.ObjectId;
        scores: {
          technical: number;
          communication: number;
          leadership: number;
          problemSolving: number;
          confidence: number;
          overall: number;
        };
        feedback: {
          strengths: string[];
          weaknesses: string[];
          suggestions: string[];
          detailedAnalysis?: string;
        };
        metrics: {
          keywordMatch?: number;
          responseCompleteness?: number;
          relevanceScore?: number;
        };
        createdAt: Date;
      };
    };
  }>;
  
  // Computed Report Data
  report?: {
    averageScores: {
      technical: number;
      communication: number;
      leadership: number;
      problemSolving: number;
      confidence: number;
      overall: number;
    };
    summary: {
      totalQuestions: number;
      totalAnswered: number;
      totalEvaluated: number;
      averageAnswerTime: number;
      totalDuration: number;
    };
    insights: {
      topStrengths: string[];
      topWeaknesses: string[];
      improvementAreas: string[];
      overallAssessment: string;
    };
    generatedAt: Date;
  };
  
  // Metadata
  progress: {
    questionsAsked: number;
    questionsAnswered: number;
    questionsEvaluated: number;
    currentQuestionNumber?: number;
  };
  metadata: {
    duration?: number;
    averageAnswerTime?: number;
  };
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  deletedAt?: Date;
}
```

**Mongoose Schema:**

```typescript
const interviewAggregateSchema = new Schema<IInterviewAggregate>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      enum: [
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
      ],
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    experienceYears: {
      type: Number,
      required: [true, 'Experience years is required'],
      min: [0, 'Experience cannot be negative'],
      max: [50, 'Experience cannot exceed 50 years'],
    },
    totalQuestions: {
      type: Number,
      required: [true, 'Total questions is required'],
      min: [1, 'Must have at least 1 question'],
      max: [50, 'Cannot exceed 50 questions'],
    },
    jobDescription: {
      type: String,
      maxlength: [5000, 'Job description cannot exceed 5000 characters'],
    },
    interviewType: {
      type: String,
      required: true,
      enum: ['technical', 'behavioral', 'system-design', 'leadership'],
      default: 'technical',
    },
    status: {
      type: String,
      required: true,
      enum: ['not-started', 'in-progress', 'completed', 'abandoned'],
      default: 'not-started',
    },
    
    // Embedded Questions Array
    questions: [
      {
        questionText: {
          type: String,
          required: [true, 'Question text is required'],
          minlength: [10, 'Question must be at least 10 characters'],
          maxlength: [1000, 'Question cannot exceed 1000 characters'],
        },
        sequenceNumber: {
          type: Number,
          required: [true, 'Sequence number is required'],
          min: [1, 'Sequence number must be at least 1'],
        },
        questionType: {
          type: String,
          required: true,
          enum: ['primary', 'follow-up'],
          default: 'primary',
        },
        parentQuestionId: Schema.Types.ObjectId,
        difficulty: {
          type: String,
          enum: ['easy', 'medium', 'hard'],
          default: 'medium',
        },
        category: String,
        expectedKeywords: [String],
        createdAt: {
          type: Date,
          default: Date.now,
        },
        
        // Embedded Answer
        answer: {
          transcript: {
            type: String,
            minlength: [10, 'Answer must be at least 10 characters'],
            maxlength: [10000, 'Answer cannot exceed 10000 characters'],
          },
          answerDuration: {
            type: Number,
            min: [0, 'Duration cannot be negative'],
          },
          recordingMetadata: {
            audioQuality: String,
            transcriptionConfidence: {
              type: Number,
              min: 0,
              max: 1,
            },
            language: {
              type: String,
              default: 'en-US',
            },
            silenceDuration: Number,
            fillerWords: [
              {
                word: String,
                count: Number,
              },
            ],
            speakingPace: Number,
          },
          metrics: {
            wordCount: {
              type: Number,
              min: 0,
            },
            characterCount: {
              type: Number,
              min: 0,
            },
            sentenceCount: {
              type: Number,
              min: 0,
            },
            averageWordsPerSentence: Number,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
          
          // Embedded Evaluation
          evaluation: {
            scores: {
              technical: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
              communication: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
              leadership: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
              problemSolving: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
              confidence: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
              overall: {
                type: Number,
                min: [0, 'Score cannot be less than 0'],
                max: [10, 'Score cannot exceed 10'],
              },
            },
            feedback: {
              strengths: [String],
              weaknesses: [String],
              suggestions: [String],
              detailedAnalysis: String,
            },
            metrics: {
              keywordMatch: {
                type: Number,
                min: 0,
                max: 100,
              },
              responseCompleteness: {
                type: Number,
                min: 0,
                max: 100,
              },
              relevanceScore: {
                type: Number,
                min: 0,
                max: 10,
              },
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
        },
      },
    ],
    
    // Computed Report
    report: {
      averageScores: {
        technical: { type: Number, min: 0, max: 10 },
        communication: { type: Number, min: 0, max: 10 },
        leadership: { type: Number, min: 0, max: 10 },
        problemSolving: { type: Number, min: 0, max: 10 },
        confidence: { type: Number, min: 0, max: 10 },
        overall: { type: Number, min: 0, max: 10 },
      },
      summary: {
        totalQuestions: Number,
        totalAnswered: Number,
        totalEvaluated: Number,
        averageAnswerTime: Number,
        totalDuration: Number,
      },
      insights: {
        topStrengths: [String],
        topWeaknesses: [String],
        improvementAreas: [String],
        overallAssessment: String,
      },
      generatedAt: Date,
    },
    
    progress: {
      questionsAsked: {
        type: Number,
        default: 0,
        min: 0,
      },
      questionsAnswered: {
        type: Number,
        default: 0,
        min: 0,
      },
      questionsEvaluated: {
        type: Number,
        default: 0,
        min: 0,
      },
      currentQuestionNumber: Number,
    },
    metadata: {
      duration: Number,
      averageAnswerTime: Number,
    },
    completedAt: Date,
    deletedAt: Date,
  },
  {
    timestamps: true,
    collection: 'interviews_aggregate',
  }
);

// Indexes
interviewAggregateSchema.index({ userId: 1, status: 1 });
interviewAggregateSchema.index({ userId: 1, createdAt: -1 });
interviewAggregateSchema.index({ topic: 1, difficulty: 1 });
interviewAggregateSchema.index({ status: 1, createdAt: -1 });
interviewAggregateSchema.index({ 'report.averageScores.overall': -1 });
interviewAggregateSchema.index({ deletedAt: 1 }, { sparse: true });

// Method to add question
interviewAggregateSchema.methods.addQuestion = function (questionData: any) {
  this.questions.push({
    _id: new Types.ObjectId(),
    ...questionData,
    createdAt: new Date(),
  });
  this.progress.questionsAsked = this.questions.length;
  return this.save();
};

// Method to add answer
interviewAggregateSchema.methods.addAnswer = function (questionId: string, answerData: any) {
  const question = this.questions.id(questionId);
  if (!question) {
    throw new Error('Question not found');
  }
  
  question.answer = {
    _id: new Types.ObjectId(),
    ...answerData,
    createdAt: new Date(),
  };
  
  this.progress.questionsAnswered += 1;
  return this.save();
};

// Method to add evaluation
interviewAggregateSchema.methods.addEvaluation = function (
  questionId: string,
  evaluationData: any
) {
  const question = this.questions.id(questionId);
  if (!question || !question.answer) {
    throw new Error('Question or answer not found');
  }
  
  question.answer.evaluation = {
    _id: new Types.ObjectId(),
    ...evaluationData,
    createdAt: new Date(),
  };
  
  this.progress.questionsEvaluated += 1;
  return this.save();
};

// Method to generate report
interviewAggregateSchema.methods.generateReport = function () {
  const evaluatedQuestions = this.questions.filter(
    q => q.answer?.evaluation
  );
  
  if (evaluatedQuestions.length === 0) {
    throw new Error('No evaluated questions found');
  }
  
  // Calculate average scores
  const scores = {
    technical: 0,
    communication: 0,
    leadership: 0,
    problemSolving: 0,
    confidence: 0,
  };
  
  evaluatedQuestions.forEach(q => {
    const eval = q.answer!.evaluation!;
    scores.technical += eval.scores.technical;
    scores.communication += eval.scores.communication;
    scores.leadership += eval.scores.leadership;
    scores.problemSolving += eval.scores.problemSolving;
    scores.confidence += eval.scores.confidence;
  });
  
  const count = evaluatedQuestions.length;
  const averageScores = {
    technical: scores.technical / count,
    communication: scores.communication / count,
    leadership: scores.leadership / count,
    problemSolving: scores.problemSolving / count,
    confidence: scores.confidence / count,
    overall: 0,
  };
  
  averageScores.overall =
    (averageScores.technical +
      averageScores.communication +
      averageScores.leadership +
      averageScores.problemSolving +
      averageScores.confidence) /
    5;
  
  // Aggregate feedback
  const allStrengths = new Set<string>();
  const allWeaknesses = new Set<string>();
  const allSuggestions = new Set<string>();
  
  evaluatedQuestions.forEach(q => {
    const feedback = q.answer!.evaluation!.feedback;
    feedback.strengths.forEach(s => allStrengths.add(s));
    feedback.weaknesses.forEach(w => allWeaknesses.add(w));
    feedback.suggestions.forEach(s => allSuggestions.add(s));
  });
  
  this.report = {
    averageScores,
    summary: {
      totalQuestions: this.questions.length,
      totalAnswered: this.progress.questionsAnswered,
      totalEvaluated: this.progress.questionsEvaluated,
      averageAnswerTime: this.metadata.averageAnswerTime || 0,
      totalDuration: this.metadata.duration || 0,
    },
    insights: {
      topStrengths: Array.from(allStrengths).slice(0, 5),
      topWeaknesses: Array.from(allWeaknesses).slice(0, 5),
      improvementAreas: Array.from(allSuggestions).slice(0, 5),
      overallAssessment: '',
    },
    generatedAt: new Date(),
  };
  
  return this.save();
};

export const InterviewAggregate = model<IInterviewAggregate>(
  'InterviewAggregate',
  interviewAggregateSchema
);
```

---

## Comparison & Recommendation

### Approach A: Normalized Collections

**Advantages:**
✅ **Flexibility**: Easy to query individual entities independently  
✅ **Data Integrity**: Clear relationships with references  
✅ **Scalability**: Better for large datasets (no 16MB document limit concerns)  
✅ **Granular Updates**: Update specific entities without loading entire interview  
✅ **Indexing**: More targeted indexes on specific collections  
✅ **Reusability**: Questions could potentially be reused across interviews  
✅ **Analytics**: Easier to perform cross-interview analytics  
✅ **Partial Data**: Can query partial data (e.g., all answers without questions)  

**Disadvantages:**
❌ **Multiple Queries**: Requires joins/lookups to get complete interview data  
❌ **Complexity**: More complex queries with $lookup operations  
❌ **Performance**: Slower for complete interview retrieval  
❌ **Consistency**: Need careful transaction handling for related updates  
❌ **Network Overhead**: More database round trips  

**Best For:**
- Large-scale applications with millions of interviews
- Complex analytics and reporting requirements
- Applications where questions/answers are queried independently
- Need for granular access control

---

### Approach B: Embedded Documents

**Advantages:**
✅ **Performance**: Single query retrieves entire interview  
✅ **Atomicity**: Updates are atomic within single document  
✅ **Simplicity**: No need for complex joins  
✅ **Data Locality**: Related data stored together  
✅ **Transaction Safety**: No need for multi-document transactions  
✅ **Read Performance**: Optimized for interview-centric access  
✅ **Reduced Network**: Fewer database round trips  

**Disadvantages:**
❌ **Document Size**: Risk hitting 16MB limit (at ~160 questions with detailed evaluations)  
❌ **Update Performance**: Entire document updated even for small changes  
❌ **Index Limitations**: Limited indexing on nested fields  
❌ **Array Performance**: Large array updates can be slow  
❌ **Difficult Analytics**: Cross-interview analysis requires aggregation  
❌ **Data Duplication**: Report data duplicated in document  

**Best For:**
- Small to medium-scale applications
- Interview-centric access patterns
- Applications where complete interview data is always needed
- Simpler architecture with faster development

---

### **Recommended Approach: Hybrid Model**

**Best of Both Worlds:**

```typescript
// Primary: Embedded Document (Approach B)
// - Use for active interviews (in-progress)
// - Fast reads/writes during interview session
// - Simple atomic updates

// Secondary: Normalized Collections (Approach A)
// - Archive completed interviews to separate collections
// - Enable complex analytics
// - Reduce document size over time
```

**Implementation Strategy:**

1. **Active Interviews** (Approach B - Embedded):
   - Store in `interviews_active` collection
   - Embedded questions, answers, evaluations
   - Limited to 50 questions (safe from 16MB limit)
   - Optimized for interview session

2. **Completed Interviews** (Approach A - Normalized):
   - Move to separate collections on completion
   - `interviews`, `questions`, `answers`, `evaluations`, `reports`
   - Enable complex analytics
   - Better for long-term storage

3. **Migration Trigger**:
   ```typescript
   // When interview status changes to 'completed'
   async function archiveInterview(interviewId: string) {
     // 1. Read from interviews_active
     // 2. Split into normalized collections
     // 3. Create report
     // 4. Delete from interviews_active
     // 5. Update user statistics
   }
   ```

---

### **Final Recommendation: Approach B (Embedded) with Limits**

**Why:**

1. **Access Pattern**: 99% of operations need complete interview data
2. **Performance**: Critical for user experience during interview
3. **Simplicity**: Faster development and maintenance
4. **Atomic Updates**: Safer data consistency
5. **Document Size**: Safe with 50 question limit (max ~2-3MB per interview)

**With Safeguards:**

```typescript
// Document size calculation
// Assumptions:
// - Question: ~500 bytes
// - Answer: ~2KB (with metadata)
// - Evaluation: ~1.5KB (with feedback)
// Total per Q&A: ~4KB
// 50 questions × 4KB = 200KB (well under 16MB)

// Even with overhead:
// - Interview metadata: ~5KB
// - Report: ~10KB
// - Total: ~215KB per interview ✓ Safe
```

**Migration Path:**

If application grows beyond 10,000 interviews or needs complex analytics:
1. Implement Approach A alongside Approach B
2. Use Approach B for active interviews
3. Archive to Approach A for completed interviews
4. Use Approach A for analytics

---

**Next sections continued in the document...**

