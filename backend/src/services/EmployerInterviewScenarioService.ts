import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewCompetencyRubric, { IEmployerInterviewCompetencyRubric } from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewScenario, {
  IEmployerInterviewScenario,
  EmployerInterviewScenarioCategory,
  EmployerInterviewScenarioDifficulty,
} from '../models/EmployerInterviewScenario.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const SCENARIO_VERSION = 'scenario-v1';
const ALLOWED_CATEGORIES: EmployerInterviewScenarioCategory[] = [
  'technical',
  'system_design',
  'debugging',
  'incident',
  'architecture',
  'leadership',
  'stakeholder',
  'prioritization',
  'communication',
  'domain',
  'other',
];
const ALLOWED_DIFFICULTIES: EmployerInterviewScenarioDifficulty[] = ['easy', 'medium', 'hard'];
const MAX_ARRAY_ITEMS = 20;
const MAX_ARRAY_ITEM_LENGTH = 300;
const MAX_TARGET_COMPETENCIES = 10;

export interface ScenarioContextInput {
  situation: string;
  candidateRole: string;
  constraints?: string[];
  availableInformation?: string[];
}

export interface CreateScenarioInput {
  title: string;
  description: string;
  category: string;
  context: ScenarioContextInput;
  targetCompetencies: string[];
  difficulty: string;
  objectives?: string[];
  successEvidence?: string[];
  failureSignals?: string[];
}

export interface UpdateScenarioInput extends Partial<CreateScenarioInput> {
  status?: string;
}

function dedupeCap(items: string[] | undefined, maxItems = MAX_ARRAY_ITEMS, maxLength = MAX_ARRAY_ITEM_LENGTH): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, maxLength);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= maxItems) break;
  }
  return result;
}

/**
 * Structured, JOB-RELEVANT workplace scenario DEFINITIONS for hiring-
 * assessment interviews (28A) — manual employer input only, NO AI in this
 * sprint. Definitions describe realistic situations, never personalized
 * candidate traps. An interview may hold multiple scenarios.
 */
export class EmployerInterviewScenarioService {
  /** POST .../scenarios — requires INTERVIEWS_MANAGE. Client supplies only content fields; organizationId/applicationId/jobId/blueprintId/rubricId are always resolved server-side from the exact interview. */
  async createScenario(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    membershipId: string,
    input: CreateScenarioInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { interview, rubric } = await this.resolveChain(organization, interviewId);
    const allowedCompetencyNames = new Set(rubric.rubric.competencies.map((c) => c.competencyName));
    const validated = this.validateInput(input, allowedCompetencyNames);

    const doc = await EmployerInterviewScenario.create({
      organizationId: organization._id,
      applicationId: interview.employerApplicationId,
      jobId: interview.employerJobId,
      interviewId: interview._id,
      blueprintId: interview.employerBlueprintId,
      rubricId: rubric._id,
      scenarioVersion: SCENARIO_VERSION,
      status: 'draft',
      createdByMembershipId: membershipId,
      ...validated,
    });

    return this.toDetail(doc);
  }

  /** PATCH .../scenarios/:scenarioId — requires INTERVIEWS_MANAGE. Content fields are editable only while `status === 'draft'`; `status` may transition draft -> ready here (ready/archived are otherwise immutable). */
  async updateScenario(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string,
    updates: UpdateScenarioInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const scenario = await this.findScenarioOrThrow(organization, interviewId, scenarioId);

    const hasContentFields =
      updates.title !== undefined ||
      updates.description !== undefined ||
      updates.category !== undefined ||
      updates.context !== undefined ||
      updates.targetCompetencies !== undefined ||
      updates.difficulty !== undefined ||
      updates.objectives !== undefined ||
      updates.successEvidence !== undefined ||
      updates.failureSignals !== undefined;

    if (hasContentFields) {
      if (scenario.status !== 'draft') {
        throw new ApiError(400, 'Scenario is not editable in its current status');
      }
      const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: scenario.rubricId, organizationId: organization._id });
      if (!rubric) {
        throw new ApiError(409, 'Interview evaluation rubric is not ready');
      }
      const allowedCompetencyNames = new Set(rubric.rubric.competencies.map((c) => c.competencyName));
      const merged: CreateScenarioInput = {
        title: updates.title ?? scenario.title,
        description: updates.description ?? scenario.description,
        category: updates.category ?? scenario.category,
        context: updates.context ?? scenario.context,
        targetCompetencies: updates.targetCompetencies ?? scenario.targetCompetencies,
        difficulty: updates.difficulty ?? scenario.difficulty,
        objectives: updates.objectives ?? scenario.objectives,
        successEvidence: updates.successEvidence ?? scenario.successEvidence,
        failureSignals: updates.failureSignals ?? scenario.failureSignals,
      };
      const validated = this.validateInput(merged, allowedCompetencyNames);
      Object.assign(scenario, validated);
    }

    if (updates.status !== undefined) {
      if (scenario.status !== 'draft' || updates.status !== 'ready') {
        throw new ApiError(400, 'Only a draft scenario may be transitioned to ready here');
      }
      scenario.status = 'ready';
    }

    await scenario.save();
    return this.toDetail(scenario);
  }

  /** POST .../scenarios/:scenarioId/archive — requires INTERVIEWS_MANAGE. draft/ready -> archived; archived -> ready is never allowed. Idempotent if already archived. */
  async archiveScenario(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const scenario = await this.findScenarioOrThrow(organization, interviewId, scenarioId);
    if (scenario.status !== 'archived') {
      scenario.status = 'archived';
      await scenario.save();
    }
    return this.toDetail(scenario);
  }

  /** GET .../scenarios — requires ORGANIZATION_VIEW. Newest first. */
  async listScenarios(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const scenarios = await EmployerInterviewScenario.find({ organizationId: organization._id, interviewId: interview._id })
      .sort({ createdAt: -1 })
      .lean();

    return { scenarios: scenarios.map((s) => this.toDetail(s as unknown as IEmployerInterviewScenario)) };
  }

  /** GET .../scenarios/:scenarioId — requires ORGANIZATION_VIEW. */
  async getScenario(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    scenarioId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const scenario = await this.findScenarioOrThrow(organization, interviewId, scenarioId);
    return this.toDetail(scenario);
  }

  private async findScenarioOrThrow(organization: IOrganization, interviewId: string, scenarioId: string): Promise<IEmployerInterviewScenario> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    const scenario = await EmployerInterviewScenario.findOne({ _id: scenarioId, organizationId: organization._id, interviewId: interview._id });
    if (!scenario) {
      throw new ApiError(404, 'Scenario not found');
    }
    return scenario;
  }

  private async resolveChain(
    organization: IOrganization,
    interviewId: string
  ): Promise<{ interview: IInterview; rubric: IEmployerInterviewCompetencyRubric }> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (!interview.employerBlueprintId) {
      throw new ApiError(409, 'Interview blueprint is not ready');
    }
    if (!interview.employerRubricId) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }
    const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }
    return { interview, rubric };
  }

  /** Strict validation of employer-supplied scenario content — no invented competency names, no empty required fields. */
  private validateInput(input: CreateScenarioInput, allowedCompetencyNames: Set<string>): Record<string, unknown> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) {
      throw new ApiError(400, 'title is required');
    }
    if (title.length > 200) {
      throw new ApiError(400, 'title cannot exceed 200 characters');
    }

    const description = typeof input.description === 'string' ? input.description.trim() : '';
    if (!description) {
      throw new ApiError(400, 'description is required');
    }
    if (description.length > 2000) {
      throw new ApiError(400, 'description cannot exceed 2000 characters');
    }

    if (!ALLOWED_CATEGORIES.includes(input.category as EmployerInterviewScenarioCategory)) {
      throw new ApiError(400, 'A valid category is required');
    }
    if (!ALLOWED_DIFFICULTIES.includes(input.difficulty as EmployerInterviewScenarioDifficulty)) {
      throw new ApiError(400, 'A valid difficulty is required');
    }

    const situation = typeof input.context?.situation === 'string' ? input.context.situation.trim() : '';
    if (!situation) {
      throw new ApiError(400, 'context.situation is required');
    }
    if (situation.length > 2000) {
      throw new ApiError(400, 'context.situation cannot exceed 2000 characters');
    }

    const candidateRole = typeof input.context?.candidateRole === 'string' ? input.context.candidateRole.trim() : '';
    if (!candidateRole) {
      throw new ApiError(400, 'context.candidateRole is required');
    }
    if (candidateRole.length > 300) {
      throw new ApiError(400, 'context.candidateRole cannot exceed 300 characters');
    }

    const targetCompetencies = dedupeCap(input.targetCompetencies, MAX_TARGET_COMPETENCIES, 200);
    if (targetCompetencies.length === 0) {
      throw new ApiError(400, 'At least one targetCompetency is required');
    }
    for (const name of targetCompetencies) {
      if (!allowedCompetencyNames.has(name)) {
        throw new ApiError(400, `Unknown competency: ${name}`);
      }
    }

    return {
      title,
      description,
      category: input.category,
      difficulty: input.difficulty,
      context: {
        situation,
        candidateRole,
        constraints: dedupeCap(input.context?.constraints),
        availableInformation: dedupeCap(input.context?.availableInformation),
      },
      targetCompetencies,
      objectives: dedupeCap(input.objectives),
      successEvidence: dedupeCap(input.successEvidence),
      failureSignals: dedupeCap(input.failureSignals),
    };
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

  private toDetail(doc: IEmployerInterviewScenario): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      interviewId: doc.interviewId.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      blueprintId: doc.blueprintId.toString(),
      rubricId: doc.rubricId.toString(),
      scenarioVersion: doc.scenarioVersion,
      status: doc.status,
      title: doc.title,
      description: doc.description,
      category: doc.category,
      context: doc.context,
      targetCompetencies: doc.targetCompetencies,
      difficulty: doc.difficulty,
      objectives: doc.objectives,
      successEvidence: doc.successEvidence,
      failureSignals: doc.failureSignals,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerInterviewScenarioService = new EmployerInterviewScenarioService();
export default employerInterviewScenarioService;
