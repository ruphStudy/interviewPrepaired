import mongoose, { Schema, Document, Types } from 'mongoose';
import { CODING_SUPPORTED_LANGUAGES, EmployerCodingQuestionDifficulty, EmployerCodingQuestionStatus } from '../constants/employerCodingQuestion';

/**
 * A structured employer coding problem (30A) — defines the problem only, no
 * execution. `jobId` is always required (job-level reusable question);
 * `applicationId`/`interviewId` are present only when the question was
 * authored for/linked to one exact hiring interview. Hidden test cases
 * live on the separate `EmployerCodingTestCase` model, never here.
 */
export interface IEmployerCodingExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface IEmployerCodingFunctionParameter {
  name: string;
  type?: string;
}

export interface IEmployerCodingFunctionSignature {
  name: string;
  parameters: IEmployerCodingFunctionParameter[];
  returnType?: string;
}

export interface IEmployerCodingStarterCode {
  javascript?: string;
  typescript?: string;
  python?: string;
}

export interface IEmployerCodingQuestion extends Document {
  organizationId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId?: Types.ObjectId;
  questionVersion: string;
  title: string;
  description: string;
  difficulty: EmployerCodingQuestionDifficulty;
  supportedLanguages: string[];
  competencyNames: string[];
  skills: string[];
  constraints: string[];
  examples: IEmployerCodingExample[];
  starterCode?: IEmployerCodingStarterCode;
  functionSignature?: IEmployerCodingFunctionSignature;
  timeLimitMs: number;
  memoryLimitMb: number;
  status: EmployerCodingQuestionStatus;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const exampleSchema = new Schema<IEmployerCodingExample>(
  {
    input: { type: String, required: true, trim: true, maxlength: [2000, 'input cannot exceed 2000 characters'] },
    output: { type: String, required: true, trim: true, maxlength: [2000, 'output cannot exceed 2000 characters'] },
    explanation: { type: String, trim: true, maxlength: [2000, 'explanation cannot exceed 2000 characters'] },
  },
  { _id: false }
);

const functionParameterSchema = new Schema<IEmployerCodingFunctionParameter>(
  {
    name: { type: String, required: true, trim: true, maxlength: [100, 'parameter name cannot exceed 100 characters'] },
    type: { type: String, trim: true, maxlength: [100, 'parameter type cannot exceed 100 characters'] },
  },
  { _id: false }
);

const functionSignatureSchema = new Schema<IEmployerCodingFunctionSignature>(
  {
    name: { type: String, required: true, trim: true, maxlength: [100, 'function name cannot exceed 100 characters'] },
    parameters: { type: [functionParameterSchema], default: [] },
    returnType: { type: String, trim: true, maxlength: [100, 'returnType cannot exceed 100 characters'] },
  },
  { _id: false }
);

const starterCodeSchema = new Schema<IEmployerCodingStarterCode>(
  {
    javascript: { type: String, maxlength: [10_000, 'starter code cannot exceed 10000 characters'] },
    typescript: { type: String, maxlength: [10_000, 'starter code cannot exceed 10000 characters'] },
    python: { type: String, maxlength: [10_000, 'starter code cannot exceed 10000 characters'] },
  },
  { _id: false }
);

const employerCodingQuestionSchema = new Schema<IEmployerCodingQuestion>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication' },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
    questionVersion: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: [200, 'title cannot exceed 200 characters'] },
    description: { type: String, required: true, trim: true, maxlength: [8000, 'description cannot exceed 8000 characters'] },
    difficulty: {
      type: String,
      enum: { values: ['easy', 'medium', 'hard'], message: '{VALUE} is not a valid difficulty' },
      required: true,
    },
    supportedLanguages: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) => Array.isArray(value) && value.length > 0 && value.every((v) => (CODING_SUPPORTED_LANGUAGES as readonly string[]).includes(v)),
        message: 'supportedLanguages must be a non-empty list of supported languages',
      },
    },
    competencyNames: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    constraints: { type: [String], default: [] },
    examples: { type: [exampleSchema], default: [] },
    starterCode: { type: starterCodeSchema },
    functionSignature: { type: functionSignatureSchema },
    timeLimitMs: { type: Number, required: true, min: 500, max: 10_000 },
    memoryLimitMb: { type: Number, required: true, min: 16, max: 1024 },
    status: {
      type: String,
      enum: { values: ['draft', 'ready', 'archived'], message: '{VALUE} is not a valid status' },
      required: true,
      default: 'draft',
    },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'employer_coding_questions',
  }
);

employerCodingQuestionSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });
employerCodingQuestionSchema.index({ organizationId: 1, interviewId: 1 });
employerCodingQuestionSchema.index({ organizationId: 1, status: 1 });

export default mongoose.model<IEmployerCodingQuestion>('EmployerCodingQuestion', employerCodingQuestionSchema);
