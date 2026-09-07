import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE candidate coding-assessment session for ONE exact hiring interview
 * (30B) — attaches a fixed, employer-selected list of READY
 * `EmployerCodingQuestion` ids. Stores session/navigation state only; NO
 * code execution/evaluation lives here (30C/30D). `questionIds` become
 * immutable once the candidate has started (status moves past
 * `not_started`).
 */
export type EmployerCodingAssessmentSessionStatus = 'not_started' | 'in_progress' | 'submitted' | 'completed';

export interface IEmployerCodingAssessmentSession extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  sessionVersion: string;
  status: EmployerCodingAssessmentSessionStatus;
  questionIds: Types.ObjectId[];
  currentQuestionIndex: number;
  startedAt?: Date;
  submittedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const employerCodingAssessmentSessionSchema = new Schema<IEmployerCodingAssessmentSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    sessionVersion: { type: String, required: true },
    status: {
      type: String,
      enum: { values: ['not_started', 'in_progress', 'submitted', 'completed'], message: '{VALUE} is not a valid status' },
      required: true,
      default: 'not_started',
    },
    questionIds: { type: [Schema.Types.ObjectId], ref: 'EmployerCodingQuestion', required: true, default: [] },
    currentQuestionIndex: { type: Number, required: true, min: 0, default: 0 },
    startedAt: { type: Date },
    submittedAt: { type: Date },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'employer_coding_assessment_sessions',
  }
);

// Exactly one coding session per hiring interview, ever.
employerCodingAssessmentSessionSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerCodingAssessmentSession>('EmployerCodingAssessmentSession', employerCodingAssessmentSessionSchema);
