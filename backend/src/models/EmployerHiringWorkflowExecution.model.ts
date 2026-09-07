import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerHiringWorkflowTrigger, EmployerHiringWorkflowActionType } from './EmployerHiringWorkflowRule.model';

/**
 * ONE deterministic evaluation of ONE rule against ONE milestone trigger
 * (31C) — `executionKey` doubles as the idempotency/concurrency claim so
 * the SAME rule can never double-fire for the SAME milestone (never
 * duplicate notes/notifications/pipeline moves). NO AI.
 */
export type EmployerHiringWorkflowExecutionStatus = 'processing' | 'completed' | 'skipped' | 'failed';
export type EmployerHiringWorkflowActionStatus = 'completed' | 'skipped' | 'failed';

export interface IEmployerHiringWorkflowExecutionAction {
  type: EmployerHiringWorkflowActionType;
  status: EmployerHiringWorkflowActionStatus;
  message?: string;
}

export interface IEmployerHiringWorkflowExecution extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId?: Types.ObjectId;
  ruleId: Types.ObjectId;
  trigger: EmployerHiringWorkflowTrigger;
  status: EmployerHiringWorkflowExecutionStatus;
  matched: boolean;
  actions: IEmployerHiringWorkflowExecutionAction[];
  executionKey: string;
  executedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const executionActionSchema = new Schema<IEmployerHiringWorkflowExecutionAction>(
  {
    type: { type: String, enum: ['add_internal_note', 'notify_hiring_team', 'move_pipeline_stage'], required: true },
    status: { type: String, enum: ['completed', 'skipped', 'failed'], required: true },
    message: { type: String, trim: true, maxlength: [500, 'message cannot exceed 500 characters'] },
  },
  { _id: false }
);

const employerHiringWorkflowExecutionSchema = new Schema<IEmployerHiringWorkflowExecution>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
    ruleId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringWorkflowRule', required: true },
    trigger: {
      type: String,
      enum: ['assessment_completed', 'interview_finalized', 'scenario_completed', 'coding_completed', 'report_ready'],
      required: true,
    },
    status: { type: String, enum: ['processing', 'completed', 'skipped', 'failed'], required: true, default: 'processing' },
    matched: { type: Boolean, required: true, default: false },
    actions: { type: [executionActionSchema], default: [] },
    executionKey: { type: String, required: true },
    executedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_workflow_executions',
  }
);

// Exactly one execution per {rule, milestone} ever — doubles as the
// concurrency claim (first create() wins; E11000 signals an already-run
// or in-flight execution for this exact milestone).
employerHiringWorkflowExecutionSchema.index({ organizationId: 1, executionKey: 1 }, { unique: true });
employerHiringWorkflowExecutionSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringWorkflowExecution>('EmployerHiringWorkflowExecution', employerHiringWorkflowExecutionSchema);
