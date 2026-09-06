import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * The candidate's actual multi-step execution of ONE READY 28A scenario
 * using its 28B question plan (28D) — a controlled scenario session,
 * isolated from the regular `Interview.questions` array entirely (never
 * inserted into it, never affects B2C/institute practice). Also the
 * SHARED response source-of-truth 28C reads from (a scenario response must
 * exist here, non-empty, before it can be evaluated). Exactly one session
 * per scenario, ever — started idempotently, never restarted once
 * completed.
 */
export type EmployerInterviewScenarioSessionStatus = 'not_started' | 'in_progress' | 'completed';

export interface IScenarioSessionResponse {
  questionSequence: number;
  questionTextSnapshot: string;
  scenarioUpdateSnapshot?: string;
  answerText: string;
  startedAt?: Date;
  answeredAt?: Date;
  durationSeconds?: number;
}

export interface IEmployerInterviewScenarioSession extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  questionSetId: Types.ObjectId;
  sessionVersion: string;
  status: EmployerInterviewScenarioSessionStatus;
  currentSequence: number;
  responses: IScenarioSessionResponse[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const scenarioSessionResponseSchema = new Schema<IScenarioSessionResponse>(
  {
    questionSequence: { type: Number, required: true, min: 1 },
    questionTextSnapshot: { type: String, required: true, trim: true, maxlength: [1000, 'questionTextSnapshot cannot exceed 1000 characters'] },
    scenarioUpdateSnapshot: { type: String, trim: true, maxlength: [500, 'scenarioUpdateSnapshot cannot exceed 500 characters'] },
    answerText: { type: String, required: true, trim: true, maxlength: [5000, 'answerText cannot exceed 5000 characters'] },
    startedAt: { type: Date },
    answeredAt: { type: Date },
    durationSeconds: { type: Number, min: 0, max: 3600 },
  },
  { _id: false }
);

const employerInterviewScenarioSessionSchema = new Schema<IEmployerInterviewScenarioSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenario', required: true },
    questionSetId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenarioQuestionSet', required: true },
    sessionVersion: { type: String, required: true },
    status: {
      type: String,
      enum: { values: ['not_started', 'in_progress', 'completed'], message: '{VALUE} is not a valid session status' },
      required: true,
      default: 'not_started',
    },
    currentSequence: { type: Number, required: true, min: 0, default: 0 },
    responses: { type: [scenarioSessionResponseSchema], default: [] },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'employer_interview_scenario_sessions',
  }
);

// Exactly one session per scenario, ever.
employerInterviewScenarioSessionSchema.index({ organizationId: 1, interviewId: 1, scenarioId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewScenarioSession>('EmployerInterviewScenarioSession', employerInterviewScenarioSessionSchema);
