import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationKnowledgeBase from '../models/OrganizationKnowledgeBase.model';
import OrganizationKnowledgeChunk from '../models/OrganizationKnowledgeChunk.model';
import OrganizationKnowledgeDocument from '../models/OrganizationKnowledgeDocument.model';
import { getAIService } from '../ai';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 10;
/** Bounded candidate set loaded into memory for in-process cosine similarity — never an unbounded org-wide chunk load. */
const MAX_CANDIDATE_CHUNKS = 500;

export interface RetrievalOptions {
  knowledgeBaseIds?: string[];
  query: string;
  limit?: number;
}

export interface RetrievalResultItem {
  knowledgeBaseId: string;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface RetrievalResult {
  query: string;
  results: RetrievalResultItem[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Org-scoped, always-active-KB/ready-document/ready-chunk retrieval over
 * `OrganizationKnowledgeChunk` embeddings (29C). Never a public/candidate
 * endpoint — every caller (the employer testing endpoint in 29C, and the
 * 29D RAG context builder) must resolve to an authenticated org member.
 * Cosine similarity is computed in-process over a BOUNDED candidate set —
 * no external vector DB, no unbounded in-memory load.
 */
export class OrganizationKnowledgeRetrievalService {
  async retrieve(organizationId: string, actingRole: OrganizationMemberRole, options: RetrievalOptions): Promise<RetrievalResult> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    return this.performRetrieval(organizationId, options);
  }

  /**
   * Internal, no-RBAC-check variant for trusted server-side callers only
   * (29D's RAG context builder) — the calling AI-generation operation has
   * already had its own permission check enforced at its controller layer;
   * this is not an HTTP-reachable path. Same org/active-KB/ready-document/
   * ready-chunk data-boundary scoping as `retrieve`.
   */
  async retrieveForInternalUse(organizationId: string, options: RetrievalOptions): Promise<RetrievalResult> {
    return this.performRetrieval(organizationId, options);
  }

  private async performRetrieval(organizationId: string, options: RetrievalOptions): Promise<RetrievalResult> {
    const organization = await this.getOrganizationById(organizationId);

    const query = options.query?.trim();
    if (!query) {
      throw new ApiError(400, 'A search query is required');
    }

    const limit = Math.min(Math.max(options.limit ?? DEFAULT_TOP_K, 1), MAX_TOP_K);

    const knowledgeBaseFilter: Record<string, unknown> = { organizationId: organization._id, status: 'active' };
    if (options.knowledgeBaseIds && options.knowledgeBaseIds.length > 0) {
      const validIds = options.knowledgeBaseIds.filter((id) => Types.ObjectId.isValid(id));
      knowledgeBaseFilter._id = { $in: validIds };
    }
    const activeKnowledgeBases = await OrganizationKnowledgeBase.find(knowledgeBaseFilter).select('_id');
    if (activeKnowledgeBases.length === 0) {
      return { query, results: [] };
    }
    const activeKnowledgeBaseIds = activeKnowledgeBases.map((kb) => kb._id);

    const readyDocuments = await OrganizationKnowledgeDocument.find({
      organizationId: organization._id,
      knowledgeBaseId: { $in: activeKnowledgeBaseIds },
      status: 'ready',
    }).select('_id title knowledgeBaseId');
    if (readyDocuments.length === 0) {
      return { query, results: [] };
    }
    const documentById = new Map(readyDocuments.map((d) => [d._id.toString(), d]));

    const candidateChunks = await OrganizationKnowledgeChunk.find({
      organizationId: organization._id,
      documentId: { $in: readyDocuments.map((d) => d._id) },
      indexStatus: 'ready',
    })
      .sort({ updatedAt: -1 })
      .limit(MAX_CANDIDATE_CHUNKS);
    if (candidateChunks.length === 0) {
      return { query, results: [] };
    }

    // Query must be embedded with the SAME model/dimension family as the indexed chunks — never compare incompatible-dimension vectors.
    const dimensionGroups = new Map<number, typeof candidateChunks>();
    for (const chunk of candidateChunks) {
      const dims = chunk.embeddingDimensions ?? chunk.embedding?.length ?? 0;
      if (!dims || !chunk.embedding) continue;
      const group = dimensionGroups.get(dims) ?? [];
      group.push(chunk);
      dimensionGroups.set(dims, group);
    }
    if (dimensionGroups.size === 0) {
      return { query, results: [] };
    }
    // Use the largest dimension-compatible group so the search covers as much of the index as possible.
    const [targetDimensions, comparableChunks] = [...dimensionGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];

    const embeddingResult = await getAIService().generateEmbeddings(
      { inputs: [query] },
      { organizationId: organization._id.toString(), operation: 'organization-knowledge-retrieval-query' }
    );
    const queryEmbedding = embeddingResult.data.embeddings[0];
    if (!queryEmbedding || queryEmbedding.length !== targetDimensions) {
      throw new ApiError(502, 'Could not generate a compatible search embedding for this query.');
    }

    const scored = comparableChunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const results: RetrievalResultItem[] = scored
      .map(({ chunk, score }) => {
        const doc = documentById.get(chunk.documentId.toString());
        if (!doc) return null;
        return {
          knowledgeBaseId: chunk.knowledgeBaseId.toString(),
          documentId: chunk.documentId.toString(),
          documentTitle: doc.title,
          chunkId: chunk._id.toString(),
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          score,
        };
      })
      .filter((item): item is RetrievalResultItem => item !== null);

    return { query, results };
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
}

export const organizationKnowledgeRetrievalService = new OrganizationKnowledgeRetrievalService();
export default organizationKnowledgeRetrievalService;
