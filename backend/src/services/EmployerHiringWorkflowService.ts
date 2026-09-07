import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication, { IEmployerJobApplication } from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import Interview from '../models/interview.model';
import EmployerHiringAssessmentReport from '../models/EmployerHiringAssessmentReport.model';
import EmployerCodingAssessmentReport from '../models/EmployerCodingAssessmentReport.model';
import EmployerInterviewScenarioReport from '../models/EmployerInterviewScenarioReport.model';
import EmployerJobApplicationNote from '../models/EmployerJobApplicationNote.model';
import EmployerJobApplicationCollaborator from '../models/EmployerJobApplicationCollaborator.model';
import EmployerHiringWorkflowRule, {
  IEmployerHiringWorkflowRule,
  IEmployerHiringWorkflowAction,
  IEmployerHiringWorkflowCondition,
  EmployerHiringWorkflowTrigger,
} from '../models/EmployerHiringWorkflowRule.model';
import EmployerHiringWorkflowExecution, {
  IEmployerHiringWorkflowExecution,
  IEmployerHiringWorkflowExecutionAction,
} from '../models/EmployerHiringWorkflowExecution.model';
import { ALLOWED_WORKFLOW_PIPELINE_STATUSES } from '../constants/employerHiringWorkflow';
import { employerJobApplicationService } from './EmployerJobApplicationService';
import { employerCollaborationNotificationService } from './EmployerCollaborationNotificationService';
import { employerAssessmentIntegrityService } from './EmployerAssessmentIntegrityService';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export interface EvaluateTriggerParams {
  organizationId: string;
  applicationId: string;
  interviewId?: string;
  trigger: EmployerHiringWorkflowTrigger;
}

/**
 * Deterministic (NO AI) INTERNAL workflow automation engine (31C) —
 * evaluates enabled rules for one job+trigger against server-resolved,
 * trusted artifact state ONLY. Never automates a hire/reject decision,
 * never compares candidates. Idempotent: the SAME rule can never re-fire
 * for the SAME (rule, application, interview, trigger) milestone — the
 * execution row's unique `executionKey` is the concurrency claim.
 */
export class EmployerHiringWorkflowService {
  /**
   * Trusted, no-RBAC entry point for milestone integration points — those
   * callers MUST wrap this in a try/catch so a workflow failure never
   * breaks the primary operation. The manual re-evaluation controller
   * checks RBAC itself before calling this.
   */
  async evaluateTrigger(params: EvaluateTriggerParams): Promise<Record<string, unknown>> {
    const organization = await Organization.findById(params.organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    const application = await EmployerJobApplication.findOne({ _id: params.applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const rules = await EmployerHiringWorkflowRule.find({
      organizationId: organization._id,
      jobId: application.jobId,
      trigger: params.trigger,
      status: 'active',
      enabled: true,
    });
    if (rules.length === 0) {
      return { evaluated: 0, results: [] };
    }

    const conditionValues = await this.resolveConditionValues(organization._id, params.interviewId);

    const results: Record<string, unknown>[] = [];
    for (const rule of rules) {
      results.push(await this.evaluateRule(organization, application, rule, params.trigger, params.interviewId, conditionValues));
    }
    return { evaluated: rules.length, results };
  }

  /** GET .../applications/:applicationId/workflows/executions — requires ORGANIZATION_VIEW. */
  async listExecutions(organizationId: string, actingRole: OrganizationMemberRole, applicationId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const executions = await EmployerHiringWorkflowExecution.find({ organizationId: organization._id, applicationId: application._id }).sort({
      createdAt: -1,
    });
    const ruleIds = [...new Set(executions.map((e) => e.ruleId.toString()))];
    const rules = ruleIds.length > 0 ? await EmployerHiringWorkflowRule.find({ _id: { $in: ruleIds } }).select('_id name') : [];
    const ruleNameById = new Map(rules.map((r) => [r._id.toString(), r.name]));

    return {
      executions: executions.map((e) => ({
        id: e._id.toString(),
        ruleId: e.ruleId.toString(),
        ruleName: ruleNameById.get(e.ruleId.toString()) ?? 'Unknown rule',
        trigger: e.trigger,
        status: e.status,
        matched: e.matched,
        actions: e.actions,
        executedAt: e.executedAt,
      })),
    };
  }

  private async resolveConditionValues(organizationId: Types.ObjectId, interviewId?: string): Promise<Record<string, string | undefined>> {
    if (!interviewId) {
      return {};
    }
    const [interview, hasReport, hasCodingReport, hasScenarioReport, integrityReviewState] = await Promise.all([
      Interview.findOne({ _id: interviewId, organizationId }).select('status'),
      EmployerHiringAssessmentReport.exists({ organizationId, interviewId }),
      EmployerCodingAssessmentReport.exists({ organizationId, interviewId }),
      EmployerInterviewScenarioReport.exists({ organizationId, interviewId }),
      employerAssessmentIntegrityService.getReviewStateForInterview(organizationId.toString(), interviewId),
    ]);

    return {
      assessment_status: interview?.status,
      report_available: hasReport ? 'true' : 'false',
      coding_report_available: hasCodingReport ? 'true' : 'false',
      scenario_report_available: hasScenarioReport ? 'true' : 'false',
      integrity_review_state: integrityReviewState,
    };
  }

  private evaluateConditions(conditions: IEmployerHiringWorkflowCondition[], values: Record<string, string | undefined>): boolean {
    for (const condition of conditions) {
      const resolved = values[condition.field];
      const isMatch = condition.operator === 'equals' ? resolved === condition.value : resolved !== condition.value;
      if (!isMatch) return false;
    }
    return true;
  }

  /** Stable per (rule, application, interview, trigger) — a milestone is defined by this exact tuple, so it can only ever execute once. */
  private buildExecutionKey(ruleId: Types.ObjectId, applicationId: Types.ObjectId, interviewId: string | undefined, trigger: string): string {
    return [ruleId.toString(), applicationId.toString(), interviewId ?? 'none', trigger].join(':');
  }

  private async evaluateRule(
    organization: IOrganization,
    application: IEmployerJobApplication,
    rule: IEmployerHiringWorkflowRule,
    trigger: EmployerHiringWorkflowTrigger,
    interviewId: string | undefined,
    conditionValues: Record<string, string | undefined>
  ): Promise<Record<string, unknown>> {
    const executionKey = this.buildExecutionKey(rule._id, application._id, interviewId, trigger);

    let claimed: IEmployerHiringWorkflowExecution;
    try {
      claimed = await EmployerHiringWorkflowExecution.create({
        organizationId: organization._id,
        applicationId: application._id,
        jobId: application.jobId,
        interviewId: interviewId ? new Types.ObjectId(interviewId) : undefined,
        ruleId: rule._id,
        trigger,
        status: 'processing',
        matched: false,
        executionKey,
        executedAt: new Date(),
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
      const existing = await EmployerHiringWorkflowExecution.findOne({ organizationId: organization._id, executionKey });
      if (!existing) {
        throw new ApiError(409, 'Workflow execution is already being prepared — please try again shortly');
      }
      return this.toExecutionSummary(existing);
    }

    const matched = this.evaluateConditions(rule.conditions, conditionValues);
    if (!matched) {
      claimed.status = 'skipped';
      claimed.matched = false;
      await claimed.save();
      return this.toExecutionSummary(claimed);
    }

    claimed.matched = true;
    const actionResults: IEmployerHiringWorkflowExecutionAction[] = [];
    for (const action of rule.actions) {
      actionResults.push(await this.executeAction(organization, application, rule, claimed, action));
    }
    claimed.actions = actionResults;
    claimed.status = actionResults.some((a) => a.status === 'failed') ? 'failed' : 'completed';
    await claimed.save();
    return this.toExecutionSummary(claimed);
  }

  private async executeAction(
    organization: IOrganization,
    application: IEmployerJobApplication,
    rule: IEmployerHiringWorkflowRule,
    execution: IEmployerHiringWorkflowExecution,
    action: IEmployerHiringWorkflowAction
  ): Promise<IEmployerHiringWorkflowExecutionAction> {
    try {
      if (action.type === 'add_internal_note') {
        return await this.executeAddInternalNote(organization, application, rule, action);
      }
      if (action.type === 'notify_hiring_team') {
        return await this.executeNotifyHiringTeam(organization, application, rule, execution);
      }
      if (action.type === 'move_pipeline_stage') {
        return await this.executeMovePipelineStage(organization, application, action);
      }
      return { type: action.type, status: 'skipped', message: 'Unknown action type.' };
    } catch (error) {
      console.error('[EmployerHiringWorkflowService] Action execution failed', error);
      return { type: action.type, status: 'failed', message: 'Action failed unexpectedly.' };
    }
  }

  /** Reuses the existing 24A note MODEL directly (no acting organization member/role exists for an automated system action) — clearly source-marked, never mentions AI. */
  private async executeAddInternalNote(
    organization: IOrganization,
    application: IEmployerJobApplication,
    rule: IEmployerHiringWorkflowRule,
    action: IEmployerHiringWorkflowAction
  ): Promise<IEmployerHiringWorkflowExecutionAction> {
    const noteText = action.config.noteText?.trim();
    if (!noteText) {
      return { type: 'add_internal_note', status: 'skipped', message: 'No note text configured.' };
    }
    await EmployerJobApplicationNote.create({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      body: `[Automated workflow: ${rule.name}] ${noteText}`.slice(0, 3000),
      mentionMembershipIds: [],
      createdByMembershipId: rule.createdByMembershipId,
    });
    return { type: 'add_internal_note', status: 'completed' };
  }

  /** Recipients are the application's own assigned collaborators (24B) — reuses the existing Sprint 24 in-app notification center, no new delivery channel. */
  private async executeNotifyHiringTeam(
    organization: IOrganization,
    application: IEmployerJobApplication,
    rule: IEmployerHiringWorkflowRule,
    execution: IEmployerHiringWorkflowExecution
  ): Promise<IEmployerHiringWorkflowExecutionAction> {
    const collaborators = await EmployerJobApplicationCollaborator.find({
      organizationId: organization._id,
      applicationId: application._id,
    }).select('membershipId');
    if (collaborators.length === 0) {
      return { type: 'notify_hiring_team', status: 'skipped', message: 'No hiring team collaborators are assigned to this application.' };
    }

    await employerCollaborationNotificationService.createWorkflowAutomationNotifications({
      organizationId: organization._id,
      applicationId: application._id,
      jobId: application.jobId,
      candidateId: application.candidateId,
      executionId: execution._id,
      recipientMembershipIds: collaborators.map((c) => c.membershipId),
      actorMembershipId: rule.createdByMembershipId,
    });
    return { type: 'notify_hiring_team', status: 'completed' };
  }

  /** Reuses the existing trusted-system transition entry point — the SAME transition-legality/mutability validation as every other pipeline move, never bypassed. An illegal/no-longer-valid transition is skipped safely, never forced. */
  private async executeMovePipelineStage(
    organization: IOrganization,
    application: IEmployerJobApplication,
    action: IEmployerHiringWorkflowAction
  ): Promise<IEmployerHiringWorkflowExecutionAction> {
    const target = action.config.pipelineStatus;
    if (!target || !ALLOWED_WORKFLOW_PIPELINE_STATUSES.includes(target as EmployerJobApplicationStatus)) {
      return { type: 'move_pipeline_stage', status: 'skipped', message: 'No valid non-terminal pipeline stage configured.' };
    }
    try {
      await employerJobApplicationService.syncApplicationStatusFromHiringWorkflow(
        organization._id.toString(),
        application._id.toString(),
        target as EmployerJobApplicationStatus
      );
      return { type: 'move_pipeline_stage', status: 'completed' };
    } catch (error) {
      const message = error instanceof ApiError ? error.message.slice(0, 500) : 'This pipeline transition is no longer valid.';
      return { type: 'move_pipeline_stage', status: 'skipped', message };
    }
  }

  private toExecutionSummary(execution: IEmployerHiringWorkflowExecution): Record<string, unknown> {
    return {
      ruleId: execution.ruleId.toString(),
      status: execution.status,
      matched: execution.matched,
      actions: execution.actions,
    };
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }
}

export const employerHiringWorkflowService = new EmployerHiringWorkflowService();
export default employerHiringWorkflowService;
