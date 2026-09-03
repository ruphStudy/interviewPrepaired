import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { IInterviewMemory, interviewMemorySchema, createEmptyMemory } from './InterviewMemory.model';
import { ICompetencyCoverage, competencyCoverageSchema } from './CompetencyCoverage.model';
import { IDifficultyTracking, difficultyTrackingSchema } from './DifficultyTracking.model';
import { IClaimVerificationTracking, claimVerificationTrackingSchema, initializeClaimTracking } from './ClaimVerification.model';
import { IContradictionTracking, contradictionTrackingSchema, initializeContradictionTracking } from './ContradictionTracking.model';
import { ISTARAnalysis } from './STARAnalysis.model';
import { SUPPORTED_LANGUAGE_CODES, DEFAULT_LANGUAGE_CODE, SupportedLanguageCode } from '../config/languages';
import { InterviewStatus } from '../constants/interview';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface IEvaluationDimension {
  name: string;
  label: string;
  score: number;
  description: string;
  evidence?: string[]; // NEW: Specific evidence supporting this score
  missingEvidence?: string[]; // NEW: What evidence is missing for a higher score
}

export interface IPointComparison {
  expectedPoint: string;
  status: 'covered' | 'partial' | 'missing' | 'incorrect';
  candidateEvidence: string;
  evaluatorReason: string;
  improvementPoint: string;
}

export interface IEvaluation {
  // New dynamic format
  dimensions?: IEvaluationDimension[];
  
  // Old fixed format (for backward compatibility)
  technicalScore?: number;
  communicationScore?: number;
  leadershipScore?: number;
  problemSolvingScore?: number;
  confidenceScore?: number;
  
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  missingPoints?: string[];
  pointComparison?: IPointComparison[];
  
  // STAR Framework Analysis (for behavioral interviews)
  starAnalysis?: ISTARAnalysis;
}

export interface IQuestion {
  _id?: any;
  questionText: string;
  questionType?: string; // Type of question: fundamentals, coding, system-design, etc.
  expectedPoints?: string[]; // Key points that should be covered in the answer
  modelAnswer?: string; // Complete ideal answer for reference (generated after evaluation)
  questionSource?: 'ai' | 'uploaded'; // Where the question came from
  referenceAnswer?: string; // Reference answer supplied in an uploaded question set
  answerSource?: 'uploaded' | 'ai-generated'; // Where the expected answer came from
  answerText?: string;
  answeredAt?: Date;
  duration?: number;
  evaluation?: IEvaluation;
}

export interface IAIUsageCall {
  operation: string;
  model: string;
  questionIndex?: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  pricingStatus: 'calculated' | 'unknown';
  timestamp: Date;
}

export interface IAIUsageTotals {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  callCount: number;
  // Not user-facing — lets buildAICostReport() derive pricingComplete without rescanning calls[].
  pricingCompleteCallCount: number;
}

export interface IAIUsage {
  calls: IAIUsageCall[];
  totals: IAIUsageTotals;
}

export interface IFinalReport {
  overallScore: number;
  averageTechnicalScore: number;
  averageCommunicationScore: number;
  averageLeadershipScore: number;
  averageProblemSolvingScore: number;
  averageConfidenceScore: number;
  averageOverallScore: number;
  summary: string;
  recommendations: string[];
  strengthsOverview: string[];
  weaknessesOverview: string[];
  nextSteps: string[];
  generatedAt: Date;
}

export interface IInterview extends Document {
  userId: Types.ObjectId;
  topic: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  experienceYears: number;
  experienceLevel?: 'student' | 'entry' | 'professional' | 'senior' | 'expert';
  interviewStyle?: 'technical' | 'behavioral' | 'hr' | 'leadership' | 'situational' | 'general';
  
  // Blueprint Integration
  blueprintId?: Types.ObjectId; // Reference to InterviewBlueprint
  blueprintVersion?: string; // Blueprint version used for this interview
  roleName?: string; // Specific role title (e.g., "Senior Developer")
  industry?: string; // Industry context (e.g., "Healthcare", "Finance")
  
  totalQuestions: number;
  currentQuestion: number;
  status: InterviewStatus;
  interviewMode?: 'ai-generated' | 'uploaded';
  // Absent on interviews created before this feature — schema `default` below
  // makes those hydrate as 'en-IN', so no migration/backfill is needed.
  interviewLanguage?: SupportedLanguageCode;
  questions: IQuestion[];
  finalReport?: IFinalReport;
  // Absent entirely for interviews that predate this feature — never defaulted, so
  // "not tracked" is distinguishable from "tracked, zero cost".
  aiUsage?: IAIUsage;
  
  // Interview Memory - Accumulated facts from candidate's answers
  interviewMemory?: IInterviewMemory;
  
  // Competency Coverage - Track assessment of blueprint competencies
  competencyCoverage?: ICompetencyCoverage;
  
  // Difficulty Tracking - Adaptive difficulty adjustment
  difficultyTracking?: IDifficultyTracking;
  
  // Claim Verification - Track verifiable claims
  claimVerification?: IClaimVerificationTracking;
  
  // Contradiction Detection - Track logical contradictions
  contradictionTracking?: IContradictionTracking;
  
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date; // When interview was completed

  // Virtual fields
  completedQuestions: number;
  averageScore: number;
  progressPercentage: number;

  // Instance methods
  addQuestion(questionText: string, expectedPoints?: string[], questionType?: string): Promise<IInterview>;
  submitAnswer(questionIndex: number, answerText: string, duration?: number): Promise<IInterview>;
  evaluateQuestion(questionIndex: number, evaluation: IEvaluation): Promise<IInterview>;
  generateFinalReport(reportData: {
    summary: string;
    recommendations: string[];
    overallScore?: number;
    strengthsOverview?: string[];
    weaknessesOverview?: string[];
    nextSteps?: string[];
  }): Promise<IInterview>;
  /** fromStatus optionally overrides the "from" state — used internally by the pre-save hook to validate against the actual original persisted status rather than the already-mutated `this.status`. */
  canTransitionTo(newStatus: string, fromStatus?: string): boolean;
}

export interface IInterviewModel extends Model<IInterview> {
  // Static methods
  findByTopic(topic: string): Promise<IInterview[]>;
  findByDifficulty(difficulty: string): Promise<IInterview[]>;
  findInProgress(): Promise<IInterview[]>;
  getStatistics(): Promise<any>;
}

// ============================================================================
// Mongoose Schemas
// ============================================================================

const evaluationDimensionSchema = new Schema<IEvaluationDimension>(
  {
    name: { type: String, required: true },
    label: { type: String, required: true },
    score: { 
      type: Number, 
      required: true,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    description: { type: String, required: true },
    evidence: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 evidence items',
      },
    },
    missingEvidence: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 missing evidence items',
      },
    },
  },
  { _id: false }
);

const evaluationSchema = new Schema<IEvaluation>(
  {
    // New dynamic format
    dimensions: {
      type: [evaluationDimensionSchema],
    },
    // Old fixed format (backward compatibility)
    technicalScore: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    communicationScore: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    leadershipScore: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    problemSolvingScore: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    confidenceScore: {
      type: Number,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    overallScore: {
      type: Number,
      required: [true, 'Overall score is required'],
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    strengths: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 strengths',
      },
    },
    weaknesses: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 weaknesses',
      },
    },
    suggestions: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 10;
        },
        message: 'Cannot have more than 10 suggestions',
      },
    },
  },
  { _id: false }
);

const questionSchema = new Schema<IQuestion>(
  {
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      minlength: [10, 'Question must be at least 10 characters'],
      maxlength: [1000, 'Question cannot exceed 1000 characters'],
    },
    questionType: {
      type: String,
      required: false,
    },
    expectedPoints: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length <= 20;
        },
        message: 'Cannot have more than 20 expected points',
      },
    },
    modelAnswer: {
      type: String,
      trim: true,
    },
    questionSource: {
      type: String,
      enum: ['ai', 'uploaded'],
      default: 'ai',
    },
    referenceAnswer: {
      type: String,
      trim: true,
    },
    answerSource: {
      type: String,
      enum: ['uploaded', 'ai-generated'],
    },
    answerText: {
      type: String,
      trim: true,
      maxlength: [5000, 'Answer cannot exceed 5000 characters'],
    },
    answeredAt: {
      type: Date,
    },
    duration: {
      type: Number,
      min: [0, 'Duration cannot be negative'],
      max: [3600, 'Duration cannot exceed 1 hour'],
    },
    evaluation: {
      type: evaluationSchema,
    },
  },
  { _id: false, timestamps: false }
);

const aiUsageCallSchema = new Schema<IAIUsageCall>(
  {
    operation: { type: String, required: true },
    model: { type: String, required: true },
    questionIndex: { type: Number },
    inputTokens: { type: Number, required: true, default: 0 },
    cachedInputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    totalTokens: { type: Number, required: true, default: 0 },
    inputCostUsd: { type: Number, required: true, default: 0 },
    cachedInputCostUsd: { type: Number, required: true, default: 0 },
    outputCostUsd: { type: Number, required: true, default: 0 },
    totalCostUsd: { type: Number, required: true, default: 0 },
    pricingStatus: { type: String, enum: ['calculated', 'unknown'], required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const aiUsageTotalsSchema = new Schema<IAIUsageTotals>(
  {
    inputTokens: { type: Number, default: 0 },
    cachedInputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    inputCostUsd: { type: Number, default: 0 },
    cachedInputCostUsd: { type: Number, default: 0 },
    outputCostUsd: { type: Number, default: 0 },
    totalCostUsd: { type: Number, default: 0 },
    callCount: { type: Number, default: 0 },
    pricingCompleteCallCount: { type: Number, default: 0 },
  },
  { _id: false }
);

// No top-level default — an interview document must NOT get this path
// materialized just by being read/saved. It stays genuinely absent until the
// first AI call for that interview persists usage via $push/$inc, which is
// what lets old interviews be told "not tracked" instead of "zero cost".
const aiUsageSchema = new Schema<IAIUsage>(
  {
    calls: { type: [aiUsageCallSchema], default: [] },
    totals: { type: aiUsageTotalsSchema, default: () => ({}) },
  },
  { _id: false }
);

const finalReportSchema = new Schema<IFinalReport>(
  {
    overallScore: {
      type: Number,
      required: [true, 'Overall score is required'],
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageTechnicalScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageCommunicationScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageLeadershipScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageProblemSolvingScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageConfidenceScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    averageOverallScore: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Score cannot be less than 0'],
      max: [10, 'Score cannot be greater than 10'],
    },
    summary: {
      type: String,
      required: [true, 'Summary is required'],
      trim: true,
      minlength: [50, 'Summary must be at least 50 characters'],
      maxlength: [2000, 'Summary cannot exceed 2000 characters'],
    },
    recommendations: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.length > 0 && v.length <= 10;
        },
        message: 'Must have between 1 and 10 recommendations',
      },
    },
    strengthsOverview: {
      type: [String],
      default: [],
    },
    weaknessesOverview: {
      type: [String],
      default: [],
    },
    nextSteps: {
      type: [String],
      default: [],
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const interviewSchema = new Schema<IInterview, IInterviewModel>(
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
      trim: true,
      minlength: [3, 'Topic must be at least 3 characters'],
      maxlength: [100, 'Topic cannot exceed 100 characters'],
      index: true,
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: {
        values: ['beginner', 'intermediate', 'advanced', 'expert'],
        message: '{VALUE} is not a valid difficulty level',
      },
      index: true,
    },
    experienceYears: {
      type: Number,
      required: [true, 'Experience years is required'],
      min: [0, 'Experience years cannot be negative'],
      max: [50, 'Experience years cannot exceed 50'],
    },
    experienceLevel: {
      type: String,
      enum: ['student', 'entry', 'professional', 'senior', 'expert'],
      default: 'entry',
    },
    interviewStyle: {
      type: String,
      enum: ['technical', 'behavioral', 'hr', 'leadership', 'situational', 'general'],
      default: 'general',
    },
    blueprintId: {
      type: Schema.Types.ObjectId,
      ref: 'InterviewBlueprint',
      index: true,
    },
    blueprintVersion: {
      type: String,
      trim: true,
    },
    roleName: {
      type: String,
      trim: true,
      maxlength: [100, 'Role name cannot exceed 100 characters'],
    },
    industry: {
      type: String,
      trim: true,
      maxlength: [100, 'Industry cannot exceed 100 characters'],
    },
    totalQuestions: {
      type: Number,
      required: [true, 'Total questions is required'],
      min: [1, 'Must have at least 1 question'],
      // Schema-level ceiling only; AI-generated interviews stay capped at 10
      // by the route validator and InterviewService.startInterview() checks.
      // Uploaded-mode interviews may use up to this many questions.
      max: [200, 'Cannot have more than 200 questions'],
    },
    currentQuestion: {
      type: Number,
      required: [true, 'Current question number is required'],
      min: [1, 'Current question must be at least 1'],
      default: 1,
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: {
        values: Object.values(InterviewStatus),
        message: '{VALUE} is not a valid status',
      },
      default: InterviewStatus.CREATED,
      index: true,
    },
    interviewMode: {
      type: String,
      enum: ['ai-generated', 'uploaded'],
      default: 'ai-generated',
    },
    interviewLanguage: {
      type: String,
      enum: SUPPORTED_LANGUAGE_CODES,
      default: DEFAULT_LANGUAGE_CODE,
    },
    questions: {
      type: [questionSchema],
      default: [],
      validate: {
        validator: function (this: IInterview, v: IQuestion[]) {
          return v.length <= this.totalQuestions;
        },
        message: 'Number of questions cannot exceed totalQuestions',
      },
    },
    finalReport: {
      type: finalReportSchema,
    },
    aiUsage: {
      type: aiUsageSchema,
      required: false,
    },
    interviewMemory: {
      type: interviewMemorySchema,
      default: createEmptyMemory,
    },
    competencyCoverage: {
      type: competencyCoverageSchema,
    },
    difficultyTracking: {
      type: difficultyTrackingSchema,
    },
    claimVerification: {
      type: claimVerificationTrackingSchema,
      default: initializeClaimTracking,
    },
    contradictionTracking: {
      type: contradictionTrackingSchema,
      default: initializeContradictionTracking,
    },
    completedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    collection: 'interviews',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================================================================
// Indexes for Performance
// ============================================================================

// Compound indexes
interviewSchema.index({ topic: 1, difficulty: 1 });
interviewSchema.index({ status: 1, createdAt: -1 });
interviewSchema.index({ createdAt: -1 });
interviewSchema.index({ 'finalReport.overallScore': -1 });

// Text index for searching
interviewSchema.index({ topic: 'text' });

// ============================================================================
// Virtual Fields
// ============================================================================

interviewSchema.virtual('completedQuestions').get(function (this: IInterview) {
  return this.questions.filter((q) => q.answerText && q.answerText.length > 0).length;
});

interviewSchema.virtual('averageScore').get(function (this: IInterview) {
  const evaluatedQuestions = this.questions.filter((q) => q.evaluation);
  if (evaluatedQuestions.length === 0) return 0;

  const totalScore = evaluatedQuestions.reduce(
    (sum, q) => sum + (q.evaluation?.overallScore || 0),
    0
  );
  return parseFloat((totalScore / evaluatedQuestions.length).toFixed(2));
});

interviewSchema.virtual('progressPercentage').get(function (this: IInterview) {
  if (this.totalQuestions === 0) return 0;
  const completed = this.questions.filter((q) => q.answerText).length;
  return parseFloat(((completed / this.totalQuestions) * 100).toFixed(2));
});

// ============================================================================
// Instance Methods
// ============================================================================

interviewSchema.methods.addQuestion = async function (
  this: IInterview,
  questionText: string,
  expectedPoints?: string[],
  questionType?: string
): Promise<IInterview> {
  if (this.questions.length >= this.totalQuestions) {
    throw new Error('Maximum number of questions reached');
  }

  this.questions.push({ 
    questionText,
    questionType,
    expectedPoints: expectedPoints || []
  } as IQuestion);
  return await this.save();
};

interviewSchema.methods.submitAnswer = async function (
  this: IInterview,
  questionIndex: number,
  answerText: string,
  duration?: number
): Promise<IInterview> {
  if (questionIndex < 0 || questionIndex >= this.questions.length) {
    throw new Error('Invalid question index');
  }

  this.questions[questionIndex].answerText = answerText;
  this.questions[questionIndex].answeredAt = new Date();
  if (duration !== undefined) {
    this.questions[questionIndex].duration = duration;
  }

  if (this.status === InterviewStatus.CREATED) {
    this.status = InterviewStatus.IN_PROGRESS;
  }

  return await this.save();
};

interviewSchema.methods.evaluateQuestion = async function (
  this: IInterview,
  questionIndex: number,
  evaluation: IEvaluation
): Promise<IInterview> {
  if (questionIndex < 0 || questionIndex >= this.questions.length) {
    throw new Error('Invalid question index');
  }

  if (!this.questions[questionIndex].answerText) {
    throw new Error('Cannot evaluate a question without an answer');
  }

  this.questions[questionIndex].evaluation = evaluation;
  return await this.save();
};

interviewSchema.methods.generateFinalReport = async function (
  this: IInterview,
  reportData: {
    summary: string;
    recommendations: string[];
    overallScore?: number;
    strengthsOverview?: string[];
    weaknessesOverview?: string[];
    nextSteps?: string[];
  }
): Promise<IInterview> {
  const evaluatedQuestions = this.questions.filter((q) => q.evaluation);

  if (evaluatedQuestions.length === 0) {
    throw new Error('No evaluated questions to generate report');
  }

  // Check if we have new dynamic format or old fixed format
  const hasDynamicDimensions = evaluatedQuestions.some(q => q.evaluation?.dimensions && q.evaluation.dimensions.length > 0);

  let averageTechnicalScore = 0;
  let averageCommunicationScore = 0;
  let averageLeadershipScore = 0;
  let averageProblemSolvingScore = 0;
  let averageConfidenceScore = 0;
  let averageOverallScore = 0;

  if (hasDynamicDimensions) {
    // New format: Calculate averages from dimensions
    const dimensionSums = new Map<string, { sum: number; count: number }>();
    
    evaluatedQuestions.forEach(q => {
      if (q.evaluation?.dimensions) {
        q.evaluation.dimensions.forEach((dim: IEvaluationDimension) => {
          const existing = dimensionSums.get(dim.name) || { sum: 0, count: 0 };
          existing.sum += dim.score;
          existing.count += 1;
          dimensionSums.set(dim.name, existing);
        });
      }
    });

    // Map common dimension names to legacy fields
    const techDim = dimensionSums.get('technical') || dimensionSums.get('domainKnowledge');
    averageTechnicalScore = techDim ? parseFloat((techDim.sum / techDim.count).toFixed(2)) : 0;

    const commDim = dimensionSums.get('communication');
    averageCommunicationScore = commDim ? parseFloat((commDim.sum / commDim.count).toFixed(2)) : 0;

    const leadDim = dimensionSums.get('leadership');
    averageLeadershipScore = leadDim ? parseFloat((leadDim.sum / leadDim.count).toFixed(2)) : 0;

    const psDim = dimensionSums.get('problemSolving');
    averageProblemSolvingScore = psDim ? parseFloat((psDim.sum / psDim.count).toFixed(2)) : 0;

    const confDim = dimensionSums.get('confidence');
    averageConfidenceScore = confDim ? parseFloat((confDim.sum / confDim.count).toFixed(2)) : 0;

    // Calculate overall average from all evaluations
    const totalOverall = evaluatedQuestions.reduce((sum, q) => sum + (q.evaluation?.overallScore ?? 0), 0);
    averageOverallScore = parseFloat((totalOverall / evaluatedQuestions.length).toFixed(2));
  } else {
    // Old format: Calculate averages from fixed scores
    const totalScores = evaluatedQuestions.reduce(
      (acc, q) => {
        const evaluation = q.evaluation!;
        return {
          technical: acc.technical + (evaluation.technicalScore ?? 0),
          communication: acc.communication + (evaluation.communicationScore ?? 0),
          leadership: acc.leadership + (evaluation.leadershipScore ?? 0),
          problemSolving: acc.problemSolving + (evaluation.problemSolvingScore ?? 0),
          confidence: acc.confidence + (evaluation.confidenceScore ?? 0),
          overall: acc.overall + (evaluation.overallScore ?? 0),
        };
      },
      { technical: 0, communication: 0, leadership: 0, problemSolving: 0, confidence: 0, overall: 0 }
    );

    const count = evaluatedQuestions.length;
    averageTechnicalScore = parseFloat((totalScores.technical / count).toFixed(2));
    averageCommunicationScore = parseFloat((totalScores.communication / count).toFixed(2));
    averageLeadershipScore = parseFloat((totalScores.leadership / count).toFixed(2));
    averageProblemSolvingScore = parseFloat((totalScores.problemSolving / count).toFixed(2));
    averageConfidenceScore = parseFloat((totalScores.confidence / count).toFixed(2));
    averageOverallScore = parseFloat((totalScores.overall / count).toFixed(2));
  }

  // Use provided overallScore or calculated average
  const overallScore = reportData.overallScore ?? averageOverallScore;

  // Extract unique strengths and weaknesses from questions if not provided
  const allStrengths = evaluatedQuestions.flatMap(q => q.evaluation?.strengths || []);
  const allWeaknesses = evaluatedQuestions.flatMap(q => q.evaluation?.weaknesses || []);
  const uniqueStrengths = Array.from(new Set(allStrengths));
  const uniqueWeaknesses = Array.from(new Set(allWeaknesses));

  this.finalReport = {
    overallScore,
    averageTechnicalScore,
    averageCommunicationScore,
    averageLeadershipScore,
    averageProblemSolvingScore,
    averageConfidenceScore,
    averageOverallScore,
    summary: reportData.summary,
    recommendations: reportData.recommendations || [],
    strengthsOverview: reportData.strengthsOverview || uniqueStrengths.slice(0, 5),
    weaknessesOverview: reportData.weaknessesOverview || uniqueWeaknesses.slice(0, 5),
    nextSteps: reportData.nextSteps || reportData.recommendations.slice(0, 3),
    generatedAt: new Date(),
  };

  this.status = InterviewStatus.EVALUATED;
  return await this.save();
};

interviewSchema.methods.canTransitionTo = function (
  this: IInterview,
  newStatus: string,
  fromStatus?: string
): boolean {
  const validTransitions: { [key: string]: string[] } = {
    [InterviewStatus.CREATED]: [InterviewStatus.IN_PROGRESS],
    [InterviewStatus.IN_PROGRESS]: [InterviewStatus.PAUSED, InterviewStatus.COMPLETED],
    [InterviewStatus.PAUSED]: [InterviewStatus.IN_PROGRESS, InterviewStatus.COMPLETED],
    [InterviewStatus.COMPLETED]: [InterviewStatus.EVALUATED],
    [InterviewStatus.EVALUATED]: [],
  };

  // Bug fix: without an explicit fromStatus, this fell back to `this.status`,
  // which by call time (e.g. from the pre-save hook, after the in-memory
  // mutation already happened) is the NEW status, not the original one —
  // making every transition check compare a status against itself.
  return validTransitions[fromStatus ?? this.status]?.includes(newStatus) || false;
};

// ============================================================================
// Static Methods
// ============================================================================

interviewSchema.statics.findByTopic = function (
  this: IInterviewModel,
  topic: string
): Promise<IInterview[]> {
  return this.find({ topic: new RegExp(topic, 'i') }).sort({ createdAt: -1 });
};

interviewSchema.statics.findByDifficulty = function (
  this: IInterviewModel,
  difficulty: string
): Promise<IInterview[]> {
  return this.find({ difficulty }).sort({ createdAt: -1 });
};

interviewSchema.statics.findInProgress = function (
  this: IInterviewModel
): Promise<IInterview[]> {
  return this.find({ status: { $in: [InterviewStatus.IN_PROGRESS, InterviewStatus.PAUSED] } }).sort({
    updatedAt: -1,
  });
};

interviewSchema.statics.getStatistics = async function (
  this: IInterviewModel
): Promise<any> {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalInterviews: { $sum: 1 },
        completedInterviews: {
          $sum: { $cond: [{ $in: ['$status', [InterviewStatus.COMPLETED, InterviewStatus.EVALUATED]] }, 1, 0] },
        },
        averageScore: { $avg: '$finalReport.overallScore' },
      },
    },
    {
      $project: {
        _id: 0,
        totalInterviews: 1,
        completedInterviews: 1,
        averageScore: { $round: ['$averageScore', 2] },
      },
    },
  ]);

  const difficultyBreakdown = await this.aggregate([
    {
      $group: {
        _id: '$difficulty',
        count: { $sum: 1 },
        averageScore: { $avg: '$finalReport.overallScore' },
      },
    },
    {
      $project: {
        difficulty: '$_id',
        count: 1,
        averageScore: { $round: ['$averageScore', 2] },
        _id: 0,
      },
    },
  ]);

  return {
    overall: stats[0] || { totalInterviews: 0, completedInterviews: 0, averageScore: 0 },
    byDifficulty: difficultyBreakdown,
  };
};

// ============================================================================
// Middleware Hooks
// ============================================================================

// Pre-save validation
interviewSchema.pre('save', function (next) {
  // Validate status transition
  if (this.isModified('status') && !this.isNew) {
    const originalStatus = (this as any)._original?.status;
    if (originalStatus && !this.canTransitionTo(this.status, originalStatus)) {
      return next(new Error(`Cannot transition from ${originalStatus} to ${this.status}`));
    }
  }

  // Auto-complete if all questions are answered
  if (
    this.status === InterviewStatus.IN_PROGRESS &&
    this.questions.length === this.totalQuestions &&
    this.questions.every((q) => q.answerText)
  ) {
    this.status = InterviewStatus.COMPLETED;
  }

  next();
});

// Post-init to store original document
interviewSchema.post('init', function (doc) {
  (doc as any)._original = doc.toObject();
});

// Pre-update hook
interviewSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

// ============================================================================
// Model Export
// ============================================================================

export const Interview = mongoose.model<IInterview, IInterviewModel>(
  'Interview',
  interviewSchema
);

export default Interview;
