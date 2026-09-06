import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationKnowledgeBase, { IOrganizationKnowledgeBase } from '../models/OrganizationKnowledgeBase.model';
import OrganizationKnowledgeDocument from '../models/OrganizationKnowledgeDocument.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const KNOWLEDGE_VERSION = 'organization-kb-v1';
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

export interface KnowledgeBaseInput {
  name: string;
  description?: string;
}

/**
 * Organization-scoped internal Knowledge Base metadata/foundation (29A) —
 * NO embeddings, NO vector search, NO RAG injection, NO AI. An
 * organization may hold multiple knowledge bases. Never hard deleted;
 * `archived` is a terminal, read-only state.
 */
export class OrganizationKnowledgeBaseService {
  /** POST .../knowledge-bases — requires QUESTION_SETS_MANAGE. Client supplies only name/description. */
  async createKnowledgeBase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    input: KnowledgeBaseInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const { name, description } = this.validateInput(input);

    const doc = await OrganizationKnowledgeBase.create({
      organizationId: organization._id,
      name,
      description,
      status: 'active',
      knowledgeVersion: KNOWLEDGE_VERSION,
      createdByMembershipId: membershipId,
    });

    return this.toDetail(doc, 0);
  }

  /** GET .../knowledge-bases — requires QUESTION_SETS_VIEW. Newest first; includes a cheap per-KB document count via one batched aggregation. */
  async listKnowledgeBases(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const knowledgeBases = await OrganizationKnowledgeBase.find({ organizationId: organization._id }).sort({ createdAt: -1 }).lean();
    if (knowledgeBases.length === 0) {
      return { knowledgeBases: [] };
    }

    const counts = await OrganizationKnowledgeDocument.aggregate([
      { $match: { organizationId: organization._id, knowledgeBaseId: { $in: knowledgeBases.map((kb) => kb._id) } } },
      { $group: { _id: '$knowledgeBaseId', count: { $sum: 1 } } },
    ]);
    const countByKbId = new Map(counts.map((c) => [c._id.toString(), c.count as number]));

    return {
      knowledgeBases: knowledgeBases.map((kb) =>
        this.toDetail(kb as unknown as IOrganizationKnowledgeBase, countByKbId.get(kb._id.toString()) ?? 0)
      ),
    };
  }

  /** GET .../knowledge-bases/:knowledgeBaseId — requires QUESTION_SETS_VIEW. */
  async getKnowledgeBase(organizationId: string, actingRole: OrganizationMemberRole, knowledgeBaseId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const knowledgeBase = await this.findKnowledgeBaseOrThrow(organization, knowledgeBaseId);
    const documentCount = await OrganizationKnowledgeDocument.countDocuments({ organizationId: organization._id, knowledgeBaseId: knowledgeBase._id });
    return this.toDetail(knowledgeBase, documentCount);
  }

  /** PATCH .../knowledge-bases/:knowledgeBaseId — requires QUESTION_SETS_MANAGE. Archived knowledge bases are read-only — content edits are rejected. */
  async updateKnowledgeBase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    updates: Partial<KnowledgeBaseInput>
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const knowledgeBase = await this.findKnowledgeBaseOrThrow(organization, knowledgeBaseId);
    if (knowledgeBase.status === 'archived') {
      throw new ApiError(400, 'This knowledge base is archived and read-only');
    }

    const validated = this.validateInput({
      name: updates.name ?? knowledgeBase.name,
      description: updates.description ?? knowledgeBase.description,
    });
    knowledgeBase.name = validated.name;
    knowledgeBase.description = validated.description;
    await knowledgeBase.save();

    const documentCount = await OrganizationKnowledgeDocument.countDocuments({ organizationId: organization._id, knowledgeBaseId: knowledgeBase._id });
    return this.toDetail(knowledgeBase, documentCount);
  }

  /** POST .../knowledge-bases/:knowledgeBaseId/archive — requires QUESTION_SETS_MANAGE. active -> archived; idempotent if already archived. No hard delete. */
  async archiveKnowledgeBase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const knowledgeBase = await this.findKnowledgeBaseOrThrow(organization, knowledgeBaseId);
    if (knowledgeBase.status !== 'archived') {
      knowledgeBase.status = 'archived';
      await knowledgeBase.save();
    }

    const documentCount = await OrganizationKnowledgeDocument.countDocuments({ organizationId: organization._id, knowledgeBaseId: knowledgeBase._id });
    return this.toDetail(knowledgeBase, documentCount);
  }

  private async findKnowledgeBaseOrThrow(organization: IOrganization, knowledgeBaseId: string): Promise<IOrganizationKnowledgeBase> {
    const knowledgeBase = await OrganizationKnowledgeBase.findOne({ _id: knowledgeBaseId, organizationId: organization._id });
    if (!knowledgeBase) {
      throw new ApiError(404, 'Knowledge base not found');
    }
    return knowledgeBase;
  }

  private validateInput(input: Partial<KnowledgeBaseInput>): { name: string; description?: string } {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) {
      throw new ApiError(400, 'name is required');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new ApiError(400, `name cannot exceed ${MAX_NAME_LENGTH} characters`);
    }
    const description = typeof input.description === 'string' ? input.description.trim() : undefined;
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ApiError(400, `description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`);
    }
    return { name, description: description || undefined };
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

  private toDetail(doc: IOrganizationKnowledgeBase, documentCount: number): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      status: doc.status,
      knowledgeVersion: doc.knowledgeVersion,
      documentCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const organizationKnowledgeBaseService = new OrganizationKnowledgeBaseService();
export default organizationKnowledgeBaseService;
