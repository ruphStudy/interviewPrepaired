import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE candidate code attempt for ONE question within an
 * `EmployerCodingAssessmentSession` (30B) — `sourceCode` is stored as
 * OPAQUE, UNTRUSTED TEXT ONLY: never eval'd/executed/transpiled/required/
 * spawned in this sprint. 30C owns execution and any result fields. A
 * `draft` row is mutable (upserted in place on every save); a `submitted`
 * row is immutable and a NEW row is created for the next attempt
 * (`attemptNumber` increments).
 */
export type EmployerCodingSubmissionStatus = 'draft' | 'submitted' | 'execution_pending' | 'executed' | 'execution_failed';

export interface IEmployerCodingSubmission extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  codingSessionId: Types.ObjectId;
  codingQuestionId: Types.ObjectId;
  language: string;
  sourceCode: string;
  submissionVersion: string;
  status: EmployerCodingSubmissionStatus;
  attemptNumber: number;
  savedAt?: Date;
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const employerCodingSubmissionSchema = new Schema<IEmployerCodingSubmission>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    codingSessionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingAssessmentSession', required: true },
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion', required: true },
    language: { type: String, required: true, trim: true, maxlength: [30, 'language cannot exceed 30 characters'] },
    sourceCode: { type: String, required: true, maxlength: [50_000, 'sourceCode cannot exceed 50000 characters'] },
    submissionVersion: { type: String, required: true },
    status: {
      type: String,
      enum: {
        values: ['draft', 'submitted', 'execution_pending', 'executed', 'execution_failed'],
        message: '{VALUE} is not a valid status',
      },
      required: true,
      default: 'draft',
    },
    attemptNumber: { type: Number, required: true, min: 0, default: 0 },
    savedAt: { type: Date },
    submittedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'employer_coding_submissions',
  }
);

// Exactly one DRAFT row per {session, question} (attemptNumber 0, reused/upserted in place).
employerCodingSubmissionSchema.index(
  { organizationId: 1, codingSessionId: 1, codingQuestionId: 1, attemptNumber: 1 },
  { unique: true }
);
employerCodingSubmissionSchema.index({ organizationId: 1, codingSessionId: 1, codingQuestionId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IEmployerCodingSubmission>('EmployerCodingSubmission', employerCodingSubmissionSchema);
