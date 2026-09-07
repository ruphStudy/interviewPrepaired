import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerInterviewKnowledgeConfig, { IEmployerInterviewKnowledgeConfig } from '../models/EmployerInterviewKnowledgeConfig.model';
import OrganizationKnowledgeBase from '../models/OrganizationKnowledgeBase.model';
import OrganizationKnowledgeChunk from '../models/OrganizationKnowledgeChunk.model';
import OrganizationKnowledgeDocument from '../models/OrganizationKnowledgeDocument.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CONFIG_VERSION = 'interview-rag-config-v1';
const DEFAULT_MAX_RETRIEVED_CHUNKS = 5;
const MAX_RETRIEVED_CHUNKS_CEILING = 10;

export interface UpdateKnowledgeConfigInput {
  enabled: boolean;
  knowledgeBaseIds: string[];
  maxRetrievedChunks?: number;
}

/**
 * Per-interview opt-in RAG configuration (29D) — read is ORGANIZATION_VIEW,
 * write is INTERVIEWS_MANAGE. `applicationId`/`jobId` are always resolved
 * server-side from the interview, never accepted from the client.
 */
export class EmployerInterviewKnowledgeConfigService {
  async getConfig(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const config = await EmployerInterviewKnowledgeConfig.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!config) {
      return {
        interviewId: interview._id.toString(),
        enabled: false,
        knowledgeBaseIds: [],
        maxRetrievedChunks: DEFAULT_MAX_RETRIEVED_CHUNKS,
        knowledgeBases: [],
      };
    }

    return this.toDetail(config);
  }

  async updateConfig(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    interviewId: string,
    input: UpdateKnowledgeConfigInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const knowledgeBaseIds = Array.from(new Set(input.knowledgeBaseIds ?? []));
    if (knowledgeBaseIds.length > 0) {
      const activeCount = await OrganizationKnowledgeBase.countDocuments({
        _id: { $in: knowledgeBaseIds },
        organizationId: organization._id,
        status: 'active',
      });
      if (activeCount !== knowledgeBaseIds.length) {
        throw new ApiError(400, 'One or more selected knowledge bases are not available for this organization.');
      }
    }

    const maxRetrievedChunks = Math.min(
      Math.max(input.maxRetrievedChunks ?? DEFAULT_MAX_RETRIEVED_CHUNKS, 1),
      MAX_RETRIEVED_CHUNKS_CEILING
    );

    if (!interview.employerApplicationId || !interview.employerJobId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application/job.');
    }

    const config = await EmployerInterviewKnowledgeConfig.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          jobId: interview.employerJobId,
          enabled: input.enabled,
          knowledgeBaseIds,
          maxRetrievedChunks,
          configVersion: CONFIG_VERSION,
          updatedByMembershipId: membershipId,
        },
        $setOnInsert: {
          createdByMembershipId: membershipId,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(config!);
  }

  private async toDetail(config: IEmployerInterviewKnowledgeConfig): Promise<Record<string, unknown>> {
    const knowledgeBases = await OrganizationKnowledgeBase.find({ _id: { $in: config.knowledgeBaseIds } }).select('_id name status');

    const knowledgeBaseSummaries = await Promise.all(
      knowledgeBases.map(async (kb) => {
        const readyDocumentIds = await OrganizationKnowledgeDocument.find({ knowledgeBaseId: kb._id, status: 'ready' }).select('_id');
        const indexedChunkCount = await OrganizationKnowledgeChunk.countDocuments({
          documentId: { $in: readyDocumentIds.map((d) => d._id) },
          indexStatus: 'ready',
        });
        return {
          knowledgeBaseId: kb._id.toString(),
          name: kb.name,
          status: kb.status,
          documentCount: readyDocumentIds.length,
          indexedChunkCount,
          hasIndexedContent: indexedChunkCount > 0,
        };
      })
    );

    return {
      interviewId: config.interviewId.toString(),
      enabled: config.enabled,
      knowledgeBaseIds: config.knowledgeBaseIds.map((id) => id.toString()),
      maxRetrievedChunks: config.maxRetrievedChunks,
      knowledgeBases: knowledgeBaseSummaries,
      updatedAt: config.updatedAt,
    };
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    return interview;
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
}

export const employerInterviewKnowledgeConfigService = new EmployerInterviewKnowledgeConfigService();
export default employerInterviewKnowledgeConfigService;
