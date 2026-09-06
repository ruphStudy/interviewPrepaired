import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE routing decision for whether a hiring-assessment SOURCE question
 * needs a targeted dynamic follow-up question (27B) — built from the
 * source question/answer/completed 21D evaluation, the relevant 20B rubric
 * competency expectations, and the existing 27A graph's competency/
 * question relationships. Never coaching: no hints, no suggested answer, no
 * feedback/praise, no candidate evaluation language in the generated
 * question. At most ONE generated follow-up per source question, and a
 * dynamic follow-up is never itself a source for another follow-up.
 */
export type EmployerInterviewFollowUpDecision = 'follow_up' | 'continue';
export type EmployerInterviewFollowUpReasonType =
  | 'insufficient_evidence'
  | 'partial_answer'
  | 'competency_gap'
  | 'clarification_needed';
export type EmployerInterviewFollowUpRouteStatus = 'processing' | 'completed' | 'failed';

/** Same shape/convention as every other single-AI-call artifact in this codebase. */
export interface IEmployerInterviewFollowUpRouteAIUsage {
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  pricingStatus: 'calculated' | 'unknown';
}

export interface IEmployerInterviewFollowUpRoute extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  graphId: Types.ObjectId;
  sourceQuestionIndex: number;
  sourceCompetencyNames: string[];
  decision?: EmployerInterviewFollowUpDecision;
  reasonType?: EmployerInterviewFollowUpReasonType;
  targetCompetencyName?: string;
  generatedQuestionIndex?: number;
  generatedQuestionText?: string;
  status: EmployerInterviewFollowUpRouteStatus;
  aiUsage?: IEmployerInterviewFollowUpRouteAIUsage;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiUsageSchema = new Schema<IEmployerInterviewFollowUpRouteAIUsage>(
  {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    inputTokens: { type: Number, required: true },
    cachedInputTokens: { type: Number, required: true },
    outputTokens: { type: Number, required: true },
    totalTokens: { type: Number, required: true },
    inputCostUsd: { type: Number, required: true },
    cachedInputCostUsd: { type: Number, required: true },
    outputCostUsd: { type: Number, required: true },
    totalCostUsd: { type: Number, required: true },
    pricingStatus: { type: String, enum: ['calculated', 'unknown'], required: true },
  },
  { _id: false }
);

const employerInterviewFollowUpRouteSchema = new Schema<IEmployerInterviewFollowUpRoute>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    graphId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewGraph', required: true },
    sourceQuestionIndex: { type: Number, required: true, min: 0 },
    sourceCompetencyNames: { type: [String], default: [] },
    decision: { type: String, enum: { values: ['follow_up', 'continue'], message: '{VALUE} is not a valid decision' } },
    reasonType: {
      type: String,
      enum: {
        values: ['insufficient_evidence', 'partial_answer', 'competency_gap', 'clarification_needed'],
        message: '{VALUE} is not a valid reason type',
      },
    },
    targetCompetencyName: { type: String },
    generatedQuestionIndex: { type: Number, min: 0 },
    generatedQuestionText: { type: String, trim: true, maxlength: [1000, 'generatedQuestionText cannot exceed 1000 characters'] },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid status' },
      required: true,
    },
    aiUsage: { type: aiUsageSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_interview_followup_routes',
  }
);

// Exactly one routing decision per source question per interview, ever —
// doubles as the concurrency claim (first create() wins; E11000 signals an
// in-flight/existing route) and enforces "max ONE generated follow-up per
// source question."
employerInterviewFollowUpRouteSchema.index({ organizationId: 1, interviewId: 1, sourceQuestionIndex: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewFollowUpRoute>('EmployerInterviewFollowUpRoute', employerInterviewFollowUpRouteSchema);
