import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE deterministic (NO AI) adaptive next-question SELECTION decision for a
 * hiring-assessment interview (27D) — chooses among EXISTING unanswered
 * questions (normal materialized questions or valid 27B dynamic follow-
 * ups) using the current 27A graph, 27C competency coverage, and observed
 * 21D evaluation scores. NEVER generates a new question (that is 27B's
 * job), never creates a candidate score, never infers ability/personality.
 * APPEND-ONLY history: each distinct routing step gets its own row (never
 * overwritten) — `stepKey` is a deterministic snapshot of interview
 * progress at decision time, so a genuinely duplicate/retried request at
 * the SAME interview state is idempotent, while real progress always
 * produces a new row.
 */
export type EmployerInterviewAdaptiveDecision = 'select_question' | 'complete' | 'wait_for_evaluation';
export type EmployerInterviewAdaptiveReasonType =
  | 'uncovered_competency'
  | 'partial_coverage'
  | 'difficulty_progression'
  | 'difficulty_recovery'
  | 'remaining_question'
  | 'follow_up_priority';

export interface IAdaptiveConsideredQuestion {
  questionIndex: number;
  competencyNames: string[];
  difficulty?: string;
  eligible: boolean;
  priority: number;
  reasons: string[];
}

export interface IEmployerInterviewAdaptiveRoute extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  graphId: Types.ObjectId;
  routeVersion: string;
  generatedAt: Date;
  stepKey: string;
  sourceQuestionIndex?: number;
  selectedQuestionIndex?: number;
  selectedCompetencyNames: string[];
  selectedDifficulty?: string;
  decision: EmployerInterviewAdaptiveDecision;
  reasonType?: EmployerInterviewAdaptiveReasonType;
  consideredQuestions: IAdaptiveConsideredQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

const consideredQuestionSchema = new Schema<IAdaptiveConsideredQuestion>(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    competencyNames: { type: [String], default: [] },
    difficulty: { type: String },
    eligible: { type: Boolean, required: true },
    priority: { type: Number, required: true },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const employerInterviewAdaptiveRouteSchema = new Schema<IEmployerInterviewAdaptiveRoute>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    graphId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewGraph', required: true },
    routeVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    stepKey: { type: String, required: true },
    sourceQuestionIndex: { type: Number, min: 0 },
    selectedQuestionIndex: { type: Number, min: 0 },
    selectedCompetencyNames: { type: [String], default: [] },
    selectedDifficulty: { type: String },
    decision: {
      type: String,
      enum: { values: ['select_question', 'complete', 'wait_for_evaluation'], message: '{VALUE} is not a valid decision' },
      required: true,
    },
    reasonType: {
      type: String,
      enum: {
        values: [
          'uncovered_competency',
          'partial_coverage',
          'difficulty_progression',
          'difficulty_recovery',
          'remaining_question',
          'follow_up_priority',
        ],
        message: '{VALUE} is not a valid reason type',
      },
    },
    consideredQuestions: { type: [consideredQuestionSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'employer_interview_adaptive_routes',
  }
);

// Append-only history — exactly one row per DISTINCT routing step (never
// overwritten). `stepKey` doubles as an idempotency guard so a duplicate
// request at the exact same interview state returns the existing decision
// instead of creating a second, meaningless row.
employerInterviewAdaptiveRouteSchema.index({ organizationId: 1, interviewId: 1, stepKey: 1 }, { unique: true });
employerInterviewAdaptiveRouteSchema.index({ organizationId: 1, interviewId: 1, createdAt: 1 });

export default mongoose.model<IEmployerInterviewAdaptiveRoute>('EmployerInterviewAdaptiveRoute', employerInterviewAdaptiveRouteSchema);
