import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewBlueprint from '../models/EmployerInterviewBlueprint.model';
import { EmployerInterviewBlueprintStatus } from '../constants/employerInterviewBlueprint';
import EmployerInterviewCompetencyRubric from '../models/EmployerInterviewCompetencyRubric.model';
import EmployerInterviewGraph, {
  IEmployerInterviewGraph,
  IInterviewGraphNode,
  IInterviewGraphEdge,
} from '../models/EmployerInterviewGraph.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const GRAPH_VERSION = 'interview-graph-v1';

/** Same deterministic normalization approach as EmployerSkillGraphService's `normalizeSkillKey()` — trim/lowercase/collapse separators — deliberately duplicated here rather than imported, since this is a distinct id-shaping concern (node ids), not skill-name matching. */
function normalizeCompetencyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function competencyNodeId(name: string): string {
  return `competency:${normalizeCompetencyKey(name).replace(/\s+/g, '-')}`;
}

function questionNodeId(index: number): string {
  return `question:${index}`;
}

function edgeId(type: string, fromNodeId: string, toNodeId: string): string {
  return `edge:${type}:${fromNodeId}->${toNodeId}`;
}

/**
 * Deterministic (NO AI) interview GRAPH FOUNDATION (27A) — competency and
 * question nodes plus coverage edges, built purely from existing 20A
 * blueprint / 20B rubric / 21A materialized questions. Stored structure
 * only: never mutates the running interview, never adapts difficulty,
 * never generates dynamic follow-up questions. Dynamic routing is 27B+.
 */
export class EmployerInterviewGraphService {
  /** POST .../graph/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place rebuild; no client artifact IDs accepted. */
  async buildInterviewGraph(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const interview = await this.loadInterview(organization, interviewId);

    if (!interview.employerBlueprintId) {
      throw new ApiError(409, 'Interview blueprint is not ready');
    }
    const blueprint = await EmployerInterviewBlueprint.findOne({ _id: interview.employerBlueprintId, organizationId: organization._id }).select(
      '_id status'
    );
    if (!blueprint || blueprint.status !== EmployerInterviewBlueprintStatus.COMPLETED) {
      throw new ApiError(409, 'Interview blueprint is not ready');
    }

    if (!interview.employerRubricId) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }
    const rubric = await EmployerInterviewCompetencyRubric.findOne({ _id: interview.employerRubricId, organizationId: organization._id });
    if (!rubric) {
      throw new ApiError(409, 'Interview evaluation rubric is not ready');
    }

    const { nodes, edges, summary } = this.buildGraph(interview, rubric.rubric.competencies);

    const generatedAt = new Date();
    const doc = await EmployerInterviewGraph.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          jobId: interview.employerJobId,
          blueprintId: blueprint._id,
          rubricId: rubric._id,
          graphVersion: GRAPH_VERSION,
          generatedAt,
          nodes,
          edges,
          summary,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../graph — requires ORGANIZATION_VIEW. Read-only; never builds. */
  async getInterviewGraph(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerInterviewGraph.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    if (interview.questionMaterializationStatus !== 'completed' || interview.questions.length === 0) {
      throw new ApiError(409, 'Interview questions have not been materialized yet.');
    }
    return interview;
  }

  /**
   * Pure deterministic derivation — NO AI. One competency node per EXACT
   * rubric competency, one question node per materialized question.
   * Coverage edges are created for every (question, competencyName) pair
   * where the competency name exactly matches a rubric competency — a
   * question referencing an unknown competency name simply gets no edge
   * for that name (never an error, never a fabricated node). No
   * `possible_followup` edges are created in 27A: none of blueprint/rubric/
   * materialized-question fields explicitly identify a follow-up TARGET
   * node — `followUpFocus` is freeform guidance text for 27B's dynamic
   * generation, not a resolvable graph edge. Inventing one here would
   * violate "do not invent follow-up edges."
   */
  private buildGraph(
    interview: IInterview,
    rubricCompetencies: Array<{ competencyName: string; importance: string; jdWeight: number }>
  ): { nodes: IInterviewGraphNode[]; edges: IInterviewGraphEdge[]; summary: { competencyNodeCount: number; questionNodeCount: number; edgeCount: number; coveredCompetencyCount: number } } {
    const competencyNodes: IInterviewGraphNode[] = [];
    const competencyNodeIdByName = new Map<string, string>();
    for (const c of rubricCompetencies) {
      const nodeId = competencyNodeId(c.competencyName);
      if (competencyNodeIdByName.has(c.competencyName)) continue; // duplicate rubric competency name — no duplicate node
      competencyNodeIdByName.set(c.competencyName, nodeId);
      competencyNodes.push({
        nodeId,
        type: 'competency',
        competencyName: c.competencyName,
        label: c.competencyName,
        metadata: { importance: c.importance, weight: c.jdWeight },
      });
    }

    const questionNodes: IInterviewGraphNode[] = interview.questions.map((q, index) => ({
      nodeId: questionNodeId(index),
      type: 'question',
      questionIndex: index,
      label: q.questionText,
      metadata: {
        difficulty: q.difficulty,
        questionType: q.questionType,
      },
    }));

    const edgesByKey = new Map<string, IInterviewGraphEdge>();
    const coveredCompetencyNames = new Set<string>();

    interview.questions.forEach((q, index) => {
      const qNodeId = questionNodeId(index);
      const competencyNames = q.competencyNames ?? [];
      for (const name of competencyNames) {
        const cNodeId = competencyNodeIdByName.get(name);
        if (!cNodeId) continue; // not an exact rubric competency — no edge fabricated

        coveredCompetencyNames.add(name);

        const forwardKey = `competency_to_question:${cNodeId}->${qNodeId}`;
        if (!edgesByKey.has(forwardKey)) {
          edgesByKey.set(forwardKey, {
            edgeId: edgeId('competency_to_question', cNodeId, qNodeId),
            fromNodeId: cNodeId,
            toNodeId: qNodeId,
            type: 'competency_to_question',
          });
        }

        const reverseKey = `question_to_competency:${qNodeId}->${cNodeId}`;
        if (!edgesByKey.has(reverseKey)) {
          edgesByKey.set(reverseKey, {
            edgeId: edgeId('question_to_competency', qNodeId, cNodeId),
            fromNodeId: qNodeId,
            toNodeId: cNodeId,
            type: 'question_to_competency',
          });
        }
      }
    });

    const nodes = [...competencyNodes, ...questionNodes];
    const edges = [...edgesByKey.values()];

    return {
      nodes,
      edges,
      summary: {
        competencyNodeCount: competencyNodes.length,
        questionNodeCount: questionNodes.length,
        edgeCount: edges.length,
        coveredCompetencyCount: coveredCompetencyNames.size,
      },
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

  private toDetail(doc: IEmployerInterviewGraph): Record<string, unknown> {
    const competencyNodeNames = doc.nodes.filter((n) => n.type === 'competency').map((n) => n.competencyName!);
    const coveredNames = new Set(
      doc.edges.filter((e) => e.type === 'competency_to_question').map((e) => doc.nodes.find((n) => n.nodeId === e.fromNodeId)?.competencyName)
    );
    const uncoveredCompetencies = competencyNodeNames.filter((name) => !coveredNames.has(name));

    return {
      built: true,
      graphVersion: doc.graphVersion,
      generatedAt: doc.generatedAt,
      summary: doc.summary,
      uncoveredCompetencies,
      nodes: doc.nodes,
      edges: doc.edges,
    };
  }
}

export const employerInterviewGraphService = new EmployerInterviewGraphService();
export default employerInterviewGraphService;
