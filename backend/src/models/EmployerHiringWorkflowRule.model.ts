import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A deterministic, employer-authored INTERNAL workflow automation rule
 * (31C) — fixed, closed vocabularies only for trigger/condition-field/
 * operator/action-type; NEVER a generic dynamic object-path evaluator or
 * arbitrary JavaScript expression. Never automates a hiring
 * recommendation, hire/reject decision, or candidate comparison.
 * `move_pipeline_stage` actions are restricted to NON-TERMINAL operational
 * stages only (enforced by the engine, not here) — hired/rejected/
 * withdrawn/archived can never be a workflow-driven transition target.
 */
export type EmployerHiringWorkflowTrigger =
  | 'assessment_completed'
  | 'interview_finalized'
  | 'scenario_completed'
  | 'coding_completed'
  | 'report_ready';

export type EmployerHiringWorkflowConditionField =
  | 'assessment_status'
  | 'report_available'
  | 'coding_report_available'
  | 'scenario_report_available'
  | 'integrity_review_state';

export type EmployerHiringWorkflowConditionOperator = 'equals' | 'not_equals';

export type EmployerHiringWorkflowActionType = 'add_internal_note' | 'notify_hiring_team' | 'move_pipeline_stage';

export type EmployerHiringWorkflowRuleStatus = 'active' | 'archived';

export interface IEmployerHiringWorkflowCondition {
  field: EmployerHiringWorkflowConditionField;
  operator: EmployerHiringWorkflowConditionOperator;
  value: string;
}

export interface IEmployerHiringWorkflowActionConfig {
  noteText?: string;
  pipelineStatus?: string;
}

export interface IEmployerHiringWorkflowAction {
  type: EmployerHiringWorkflowActionType;
  config: IEmployerHiringWorkflowActionConfig;
}

export interface IEmployerHiringWorkflowRule extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  name: string;
  description?: string;
  enabled: boolean;
  status: EmployerHiringWorkflowRuleStatus;
  trigger: EmployerHiringWorkflowTrigger;
  conditions: IEmployerHiringWorkflowCondition[];
  actions: IEmployerHiringWorkflowAction[];
  workflowVersion: string;
  createdByMembershipId: Types.ObjectId;
  updatedByMembershipId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const conditionSchema = new Schema<IEmployerHiringWorkflowCondition>(
  {
    field: {
      type: String,
      enum: ['assessment_status', 'report_available', 'coding_report_available', 'scenario_report_available', 'integrity_review_state'],
      required: true,
    },
    operator: { type: String, enum: ['equals', 'not_equals'], required: true },
    value: { type: String, required: true, trim: true, maxlength: [100, 'value cannot exceed 100 characters'] },
  },
  { _id: false }
);

const actionConfigSchema = new Schema<IEmployerHiringWorkflowActionConfig>(
  {
    noteText: { type: String, trim: true, maxlength: [1000, 'noteText cannot exceed 1000 characters'] },
    pipelineStatus: { type: String, trim: true, maxlength: [50, 'pipelineStatus cannot exceed 50 characters'] },
  },
  { _id: false }
);

const actionSchema = new Schema<IEmployerHiringWorkflowAction>(
  {
    type: { type: String, enum: ['add_internal_note', 'notify_hiring_team', 'move_pipeline_stage'], required: true },
    config: { type: actionConfigSchema, required: true, default: () => ({}) },
  },
  { _id: false }
);

const employerHiringWorkflowRuleSchema = new Schema<IEmployerHiringWorkflowRule>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    name: { type: String, required: true, trim: true, maxlength: [200, 'name cannot exceed 200 characters'] },
    description: { type: String, trim: true, maxlength: [1000, 'description cannot exceed 1000 characters'] },
    enabled: { type: Boolean, required: true, default: true },
    status: { type: String, enum: ['active', 'archived'], required: true, default: 'active' },
    trigger: {
      type: String,
      enum: ['assessment_completed', 'interview_finalized', 'scenario_completed', 'coding_completed', 'report_ready'],
      required: true,
    },
    conditions: { type: [conditionSchema], default: [] },
    actions: { type: [actionSchema], required: true, validate: { validator: (v: unknown[]) => Array.isArray(v) && v.length > 0, message: 'At least one action is required' } },
    workflowVersion: { type: String, required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    updatedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_workflow_rules',
  }
);

employerHiringWorkflowRuleSchema.index({ organizationId: 1, jobId: 1, trigger: 1, status: 1, enabled: 1 });

export default mongoose.model<IEmployerHiringWorkflowRule>('EmployerHiringWorkflowRule', employerHiringWorkflowRuleSchema);
