import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Employer-only FOLLOW-UP QUESTION SUGGESTIONS for competencies the
 * immutable 22A evidence matrix marked `requiresFollowUp` (22B). These are
 * suggestions only — never appended to the candidate's completed
 * `Interview.questions`, never reopening the completed assessment, never
 * evaluated. Uniqueness is keyed on {organizationId, interviewId,
 * evidenceMatrixId} — a later evidence matrix (from a new hiring session)
 * always gets its own separate plan; an existing plan is never
 * recalculated/relinked.
 */
export type FollowUpPlanStatus = 'processing' | 'completed' | 'failed';

export interface IFollowUpQuestion {
  question: string;
  objective: string;
  evidenceToValidate: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface IFollowUpCompetency {
  competencyName: string;
  importance: string;
  currentScore: number;
  evidenceStatus: string;
  reasons: string[];
  questions: IFollowUpQuestion[];
}

export interface IFollowUpPlan {
  competencies: IFollowUpCompetency[];
  totalQuestions: number;
  generationVersion: string;
}

export interface IEmployerHiringFollowUpPlan extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  assessmentResultId: Types.ObjectId;
  evidenceMatrixId: Types.ObjectId;
  status: FollowUpPlanStatus;
  plan?: IFollowUpPlan;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const followUpQuestionSchema = new Schema<IFollowUpQuestion>(
  {
    question: { type: String, required: true },
    objective: { type: String, required: true },
    evidenceToValidate: { type: [String], default: [] },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  },
  { _id: false }
);

const followUpCompetencySchema = new Schema<IFollowUpCompetency>(
  {
    competencyName: { type: String, required: true },
    importance: { type: String, required: true },
    currentScore: { type: Number, required: true, min: 1, max: 5 },
    evidenceStatus: { type: String, required: true },
    reasons: { type: [String], default: [] },
    questions: { type: [followUpQuestionSchema], default: [] },
  },
  { _id: false }
);

const followUpPlanSchema = new Schema<IFollowUpPlan>(
  {
    competencies: { type: [followUpCompetencySchema], default: [] },
    totalQuestions: { type: Number, required: true, min: 0 },
    generationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerHiringFollowUpPlanSchema = new Schema<IEmployerHiringFollowUpPlan>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    assessmentResultId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentResult', required: true },
    evidenceMatrixId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringEvidenceMatrix', required: true },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid follow-up plan status' },
      required: true,
    },
    plan: { type: followUpPlanSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_followup_plans',
  }
);

// Exactly one plan per {interview, evidence matrix} combination, ever. This
// unique index doubles as the concurrency claim: the first create() for a
// given combination wins; every concurrent duplicate throws E11000, which
// EmployerHiringFollowUpPlanService uses to detect an in-flight/existing
// plan rather than starting a second AI call.
employerHiringFollowUpPlanSchema.index({ organizationId: 1, interviewId: 1, evidenceMatrixId: 1 }, { unique: true });
employerHiringFollowUpPlanSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringFollowUpPlan>(
  'EmployerHiringFollowUpPlan',
  employerHiringFollowUpPlanSchema
);
