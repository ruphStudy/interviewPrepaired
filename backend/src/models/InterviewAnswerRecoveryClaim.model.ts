import { Schema, model, Types } from 'mongoose';

export interface IInterviewAnswerRecoveryClaim {
  interviewId: Types.ObjectId;
  questionIndex: number;
  status: 'processing' | 'completed' | 'failed';
  claimedAt: Date;
  completedAt?: Date;
  failureMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const interviewAnswerRecoveryClaimSchema = new Schema<IInterviewAnswerRecoveryClaim>(
  {
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    questionIndex: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['processing', 'completed', 'failed'], required: true, default: 'processing' },
    claimedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date },
    failureMessage: { type: String, maxlength: 500 },
  },
  { timestamps: true, collection: 'interview_answer_recovery_claims' }
);

// Recovery can be retried safely, but two app instances must never evaluate
// the same already-persisted answer at the same time.
interviewAnswerRecoveryClaimSchema.index({ interviewId: 1, questionIndex: 1 }, { unique: true });
interviewAnswerRecoveryClaimSchema.index({ status: 1, updatedAt: 1 });

export const InterviewAnswerRecoveryClaim = model<IInterviewAnswerRecoveryClaim>(
  'InterviewAnswerRecoveryClaim',
  interviewAnswerRecoveryClaimSchema
);

export default InterviewAnswerRecoveryClaim;
