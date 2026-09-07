import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE deterministic execution run of a submitted candidate attempt against
 * its exact question's active test cases (30C). NO AI. `results[]` for
 * `type: 'hidden'` rows must never be exposed through any candidate/public
 * API beyond their bare `status` — the candidate-safe projection lives in
 * the callers of this model, never here. `status: 'executor_unavailable'`
 * is a first-class, honest outcome — this codebase has no secure isolated
 * code-execution runtime configured, and this service NEVER fabricates a
 * sandboxed result to hide that fact.
 */
export type EmployerCodingExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'executor_unavailable';
export type EmployerCodingTestResultStatus = 'passed' | 'failed' | 'runtime_error' | 'timeout';

export interface IEmployerCodingExecutionResult {
  testCaseId: Types.ObjectId;
  type: 'sample' | 'hidden';
  status: EmployerCodingTestResultStatus;
  durationMs?: number;
  memoryMb?: number;
  actualOutput?: string;
  errorMessage?: string;
}

export interface IEmployerCodingExecutionSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  hiddenTests: number;
  hiddenPassed: number;
  sampleTests: number;
  samplePassed: number;
  passPercent: number;
}

export interface IEmployerCodingExecutionEnvironment {
  provider: string;
  runtime?: string;
  version?: string;
}

export interface IEmployerCodingExecution extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  codingSessionId: Types.ObjectId;
  codingQuestionId: Types.ObjectId;
  submissionId: Types.ObjectId;
  executionVersion: string;
  status: EmployerCodingExecutionStatus;
  language: string;
  results: IEmployerCodingExecutionResult[];
  summary?: IEmployerCodingExecutionSummary;
  executionEnvironment?: IEmployerCodingExecutionEnvironment;
  /** Bounded rerun counter — not part of the original spec field list, but required to enforce "rate limit logically: max reasonable runs/attempts" without unbounded reclaim loops. */
  attemptCount: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const resultSchema = new Schema<IEmployerCodingExecutionResult>(
  {
    testCaseId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingTestCase', required: true },
    type: { type: String, enum: { values: ['sample', 'hidden'], message: '{VALUE} is not a valid test case type' }, required: true },
    status: {
      type: String,
      enum: { values: ['passed', 'failed', 'runtime_error', 'timeout'], message: '{VALUE} is not a valid result status' },
      required: true,
    },
    durationMs: { type: Number, min: 0 },
    memoryMb: { type: Number, min: 0 },
    actualOutput: { type: String, maxlength: [4000, 'actualOutput cannot exceed 4000 characters'] },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  { _id: false }
);

const summarySchema = new Schema<IEmployerCodingExecutionSummary>(
  {
    totalTests: { type: Number, required: true, min: 0 },
    passedTests: { type: Number, required: true, min: 0 },
    failedTests: { type: Number, required: true, min: 0 },
    hiddenTests: { type: Number, required: true, min: 0 },
    hiddenPassed: { type: Number, required: true, min: 0 },
    sampleTests: { type: Number, required: true, min: 0 },
    samplePassed: { type: Number, required: true, min: 0 },
    passPercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const environmentSchema = new Schema<IEmployerCodingExecutionEnvironment>(
  {
    provider: { type: String, required: true },
    runtime: { type: String },
    version: { type: String },
  },
  { _id: false }
);

const employerCodingExecutionSchema = new Schema<IEmployerCodingExecution>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    codingSessionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingAssessmentSession', required: true },
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion', required: true },
    submissionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingSubmission', required: true },
    executionVersion: { type: String, required: true },
    status: {
      type: String,
      enum: {
        values: ['pending', 'running', 'completed', 'failed', 'timeout', 'executor_unavailable'],
        message: '{VALUE} is not a valid status',
      },
      required: true,
      default: 'pending',
    },
    language: { type: String, required: true, trim: true, maxlength: [30, 'language cannot exceed 30 characters'] },
    results: { type: [resultSchema], default: [] },
    summary: { type: summarySchema },
    executionEnvironment: { type: environmentSchema },
    attemptCount: { type: Number, required: true, min: 0, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_coding_executions',
  }
);

// Exactly one execution row per submission, ever — doubles as the
// concurrency claim (first create() wins; E11000 signals an in-flight/
// existing execution).
employerCodingExecutionSchema.index({ organizationId: 1, submissionId: 1 }, { unique: true });

export default mongoose.model<IEmployerCodingExecution>('EmployerCodingExecution', employerCodingExecutionSchema);
