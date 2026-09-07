import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob, { IEmployerJob } from '../models/EmployerJob.model';
import EmployerHiringWorkflowRule, {
  IEmployerHiringWorkflowRule,
  IEmployerHiringWorkflowCondition,
  IEmployerHiringWorkflowAction,
  EmployerHiringWorkflowTrigger,
} from '../models/EmployerHiringWorkflowRule.model';
import { ALLOWED_WORKFLOW_PIPELINE_STATUSES } from '../constants/employerHiringWorkflow';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const WORKFLOW_VERSION = 'hiring-workflow-v1';
const MAX_CONDITIONS = 10;
const MAX_ACTIONS = 5;
const TRIGGERS: EmployerHiringWorkflowTrigger[] = [
  'assessment_completed',
  'interview_finalized',
  'scenario_completed',
  'coding_completed',
  'report_ready',
];
const CONDITION_FIELDS = ['assessment_status', 'report_available', 'coding_report_available', 'scenario_report_available', 'integrity_review_state'];
const CONDITION_OPERATORS = ['equals', 'not_equals'];
const ACTION_TYPES = ['add_internal_note', 'notify_hiring_team', 'move_pipeline_stage'];

export interface WorkflowRuleInput {
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: EmployerHiringWorkflowTrigger;
  conditions?: IEmployerHiringWorkflowCondition[];
  actions: IEmployerHiringWorkflowAction[];
}

/**
 * Employer-authored INTERNAL workflow rule CRUD (31C) — fixed, closed
 * trigger/condition-field/operator/action-type vocabularies only, enforced
 * server-side; no generic dynamic evaluator, no arbitrary script. A
 * `move_pipeline_stage` action may only target a non-terminal operational
 * stage — never hired/rejected/withdrawn/archived.
 */
export class EmployerHiringWorkflowRuleService {
  /** POST .../jobs/:jobId/workflow-rules — requires INTERVIEWS_MANAGE. */
  async createRule(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    jobId: string,
    input: WorkflowRuleInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJob(organization, jobId);

    const normalized = this.validateInput(input);

    const doc = await EmployerHiringWorkflowRule.create({
      organizationId: organization._id,
      jobId: job._id,
      status: 'active',
      workflowVersion: WORKFLOW_VERSION,
      createdByMembershipId: membershipId,
      ...normalized,
    });

    return this.toDetail(doc);
  }

  /** GET .../jobs/:jobId/workflow-rules — requires ORGANIZATION_VIEW. */
  async listRules(organizationId: string, actingRole: OrganizationMemberRole, jobId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJob(organization, jobId);

    const rules = await EmployerHiringWorkflowRule.find({ organizationId: organization._id, jobId: job._id }).sort({ createdAt: -1 });
    return { rules: rules.map((r) => this.toDetail(r)) };
  }

  /** PATCH .../jobs/:jobId/workflow-rules/:ruleId — requires INTERVIEWS_MANAGE. Only while `active`. */
  async updateRule(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    jobId: string,
    ruleId: string,
    input: Partial<WorkflowRuleInput>
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJob(organization, jobId);

    const rule = await this.findRule(organization, job, ruleId);
    if (rule.status !== 'active') {
      throw new ApiError(409, 'This workflow rule is archived and read-only.');
    }

    const merged: WorkflowRuleInput = {
      name: input.name ?? rule.name,
      description: input.description ?? rule.description,
      enabled: input.enabled ?? rule.enabled,
      trigger: input.trigger ?? rule.trigger,
      conditions: input.conditions ?? rule.conditions,
      actions: input.actions ?? rule.actions,
    };
    const normalized = this.validateInput(merged);

    rule.set({ ...normalized, updatedByMembershipId: membershipId });
    await rule.save();
    return this.toDetail(rule);
  }

  /** POST .../jobs/:jobId/workflow-rules/:ruleId/archive — requires INTERVIEWS_MANAGE. Read-only afterward. */
  async archiveRule(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    ruleId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJob(organization, jobId);

    const rule = await this.findRule(organization, job, ruleId);
    if (rule.status === 'archived') {
      return this.toDetail(rule);
    }
    rule.status = 'archived';
    rule.enabled = false;
    await rule.save();
    return this.toDetail(rule);
  }

  private validateInput(input: WorkflowRuleInput): Partial<IEmployerHiringWorkflowRule> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }
    if (!TRIGGERS.includes(input.trigger)) {
      throw new ApiError(400, 'Invalid trigger');
    }

    const conditions = (input.conditions ?? []).slice(0, MAX_CONDITIONS).map((c) => {
      if (!CONDITION_FIELDS.includes(c.field)) {
        throw new ApiError(400, `Invalid condition field: ${c.field}`);
      }
      if (!CONDITION_OPERATORS.includes(c.operator)) {
        throw new ApiError(400, `Invalid condition operator: ${c.operator}`);
      }
      const value = typeof c.value === 'string' ? c.value.trim().slice(0, 100) : '';
      if (!value) {
        throw new ApiError(400, 'Condition value is required');
      }
      return { field: c.field, operator: c.operator, value };
    });

    const actions = (input.actions ?? []).slice(0, MAX_ACTIONS).map((a) => {
      if (!ACTION_TYPES.includes(a.type)) {
        throw new ApiError(400, `Invalid action type: ${a.type}`);
      }
      if (a.type === 'add_internal_note') {
        const noteText = a.config?.noteText?.trim();
        if (!noteText) {
          throw new ApiError(400, 'noteText is required for an add_internal_note action');
        }
        return { type: a.type, config: { noteText: noteText.slice(0, 1000) } };
      }
      if (a.type === 'move_pipeline_stage') {
        const pipelineStatus = a.config?.pipelineStatus;
        if (!pipelineStatus || !ALLOWED_WORKFLOW_PIPELINE_STATUSES.includes(pipelineStatus as any)) {
          throw new ApiError(
            400,
            `pipelineStatus must be one of: ${ALLOWED_WORKFLOW_PIPELINE_STATUSES.join(', ')} (terminal decision states are never allowed)`
          );
        }
        return { type: a.type, config: { pipelineStatus } };
      }
      return { type: a.type, config: {} };
    });
    if (actions.length === 0) {
      throw new ApiError(400, 'At least one action is required');
    }

    return {
      name,
      description: input.description?.trim().slice(0, 1000) || undefined,
      enabled: input.enabled !== false,
      trigger: input.trigger,
      conditions,
      actions,
    };
  }

  private async findRule(organization: IOrganization, job: IEmployerJob, ruleId: string): Promise<IEmployerHiringWorkflowRule> {
    const rule = await EmployerHiringWorkflowRule.findOne({ _id: ruleId, organizationId: organization._id, jobId: job._id });
    if (!rule) {
      throw new ApiError(404, 'Workflow rule not found');
    }
    return rule;
  }

  private async getJob(organization: IOrganization, jobId: string): Promise<IEmployerJob> {
    const job = await EmployerJob.findOne({ _id: jobId, organizationId: organization._id });
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return job;
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toDetail(doc: IEmployerHiringWorkflowRule): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId.toString(),
      name: doc.name,
      description: doc.description,
      enabled: doc.enabled,
      status: doc.status,
      trigger: doc.trigger,
      conditions: doc.conditions,
      actions: doc.actions,
      workflowVersion: doc.workflowVersion,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerHiringWorkflowRuleService = new EmployerHiringWorkflowRuleService();
export default employerHiringWorkflowRuleService;
