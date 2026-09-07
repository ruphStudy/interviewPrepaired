import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationKnowledgeBase, { IOrganizationKnowledgeBase } from '../models/OrganizationKnowledgeBase.model';
import OrganizationKnowledgeDocument, { IOrganizationKnowledgeDocument } from '../models/OrganizationKnowledgeDocument.model';
import OrganizationKnowledgeChunk, { OrganizationKnowledgeChunkIndexStatus } from '../models/OrganizationKnowledgeChunk.model';
import { chunkKnowledgeText, estimateTokenCount } from '../utils/organizationKnowledgeChunking';
import { getAIService } from '../ai';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CHUNK_VERSION = 'knowledge-chunk-v1';
const EMBEDDING_BATCH_SIZE = 20;

/**
 * Deterministic (NO AI) chunking + embedding-based indexing for READY
 * organization knowledge documents (29C). Chunking itself is pure text
 * splitting — only the embedding step calls AI, one operation
 * (`organization-knowledge-embedding`) per bounded batch of chunk texts.
 * A rebuild deletes/replaces ONLY this exact document's chunks — never
 * touches another document/organization.
 */
export class OrganizationKnowledgeIndexService {
  /** POST .../documents/:documentId/index — requires QUESTION_SETS_MANAGE. */
  async indexDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveActiveKnowledgeBase(organization, knowledgeBaseId);
    const doc = await this.findDocumentOrThrow(organization, knowledgeBase, documentId);

    return this.indexOneDocument(organization, knowledgeBase, doc);
  }

  /** POST .../knowledge-bases/:knowledgeBaseId/index — requires QUESTION_SETS_MANAGE. Indexes every eligible READY document in this KB. */
  async indexKnowledgeBase(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveActiveKnowledgeBase(organization, knowledgeBaseId);

    const readyDocs = await OrganizationKnowledgeDocument.find({
      organizationId: organization._id,
      knowledgeBaseId: knowledgeBase._id,
      status: 'ready',
    });

    const results: Record<string, unknown>[] = [];
    for (const doc of readyDocs) {
      try {
        results.push(await this.indexOneDocument(organization, knowledgeBase, doc));
      } catch (error) {
        results.push({ documentId: doc._id.toString(), error: this.safeErrorMessage(error) });
      }
    }

    return { documentCount: readyDocs.length, results };
  }

  private async indexOneDocument(
    organization: IOrganization,
    knowledgeBase: IOrganizationKnowledgeBase,
    doc: IOrganizationKnowledgeDocument
  ): Promise<Record<string, unknown>> {
    if (doc.status === 'archived') {
      throw new ApiError(400, 'This document is archived and read-only');
    }
    if (doc.status !== 'ready') {
      throw new ApiError(409, 'Document must be parsed successfully before indexing.');
    }
    if (!doc.rawText || !doc.rawText.trim()) {
      throw new ApiError(409, 'Document has no extracted text to index.');
    }

    doc.indexStatus = 'processing';
    await doc.save();

    // Rebuild — delete/replace ONLY this exact document's chunks.
    await OrganizationKnowledgeChunk.deleteMany({ organizationId: organization._id, documentId: doc._id });

    const drafts = chunkKnowledgeText(doc.rawText);
    if (drafts.length === 0) {
      doc.indexStatus = 'failed';
      doc.chunkCount = 0;
      doc.indexedChunkCount = 0;
      doc.indexedAt = new Date();
      await doc.save();
      throw new ApiError(422, 'No chunks could be produced from this document.');
    }

    const chunkDocs = await OrganizationKnowledgeChunk.insertMany(
      drafts.map((d, index) => ({
        organizationId: organization._id,
        knowledgeBaseId: knowledgeBase._id,
        documentId: doc._id,
        chunkVersion: CHUNK_VERSION,
        chunkIndex: index,
        headingPath: d.headingPath,
        text: d.text,
        characterStart: d.characterStart,
        characterEnd: d.characterEnd,
        tokenEstimate: estimateTokenCount(d.text),
        wordCount: d.wordCount,
        indexStatus: 'pending' as OrganizationKnowledgeChunkIndexStatus,
      }))
    );

    let indexedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < chunkDocs.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunkDocs.slice(i, i + EMBEDDING_BATCH_SIZE);
      try {
        const result = await getAIService().generateEmbeddings(
          { inputs: batch.map((c) => c.text) },
          { organizationId: organization._id.toString(), operation: 'organization-knowledge-embedding' }
        );
        const embeddings = result.data.embeddings;
        const model = result.metadata.model;
        const dimensions = result.data.dimensions;

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          if (!embedding || embedding.length === 0) {
            chunk.indexStatus = 'failed';
            chunk.errorMessage = 'No embedding was returned for this chunk.';
            failedCount++;
          } else {
            chunk.embedding = embedding;
            chunk.embeddingModel = model;
            chunk.embeddingDimensions = dimensions;
            chunk.indexStatus = 'ready';
            chunk.indexedAt = new Date();
            chunk.errorMessage = undefined;
            indexedCount++;
          }
          await chunk.save();
        }
      } catch (error) {
        const message = this.safeErrorMessage(error);
        for (const chunk of batch) {
          chunk.indexStatus = 'failed';
          chunk.errorMessage = message;
          await chunk.save();
          failedCount++;
        }
      }
    }

    const totalChunks = chunkDocs.length;
    const finalIndexStatus = indexedCount === 0 ? 'failed' : failedCount > 0 ? 'partial' : 'ready';

    doc.indexingVersion = CHUNK_VERSION;
    doc.indexStatus = finalIndexStatus;
    doc.chunkCount = totalChunks;
    doc.indexedChunkCount = indexedCount;
    doc.indexedAt = new Date();
    await doc.save();

    if (indexedCount === 0) {
      throw new ApiError(502, 'Embedding generation failed for every chunk of this document.');
    }

    return {
      documentId: doc._id.toString(),
      indexStatus: finalIndexStatus,
      totalChunks,
      indexed: indexedCount,
      failed: failedCount,
    };
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message.slice(0, 500);
    return 'Embedding generation failed.';
  }

  private async resolveActiveKnowledgeBase(organization: IOrganization, knowledgeBaseId: string): Promise<IOrganizationKnowledgeBase> {
    const knowledgeBase = await OrganizationKnowledgeBase.findOne({ _id: knowledgeBaseId, organizationId: organization._id });
    if (!knowledgeBase) {
      throw new ApiError(404, 'Knowledge base not found');
    }
    if (knowledgeBase.status === 'archived') {
      throw new ApiError(400, 'This knowledge base is archived and read-only');
    }
    return knowledgeBase;
  }

  private async findDocumentOrThrow(
    organization: IOrganization,
    knowledgeBase: IOrganizationKnowledgeBase,
    documentId: string
  ): Promise<IOrganizationKnowledgeDocument> {
    const doc = await OrganizationKnowledgeDocument.findOne({
      _id: documentId,
      organizationId: organization._id,
      knowledgeBaseId: knowledgeBase._id,
    });
    if (!doc) {
      throw new ApiError(404, 'Document not found');
    }
    return doc;
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

export const organizationKnowledgeIndexService = new OrganizationKnowledgeIndexService();
export default organizationKnowledgeIndexService;
