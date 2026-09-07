import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE deterministic, non-overlapping-content chunk of an organization
 * knowledge document's `rawText` (29C), plus its embedding once indexed.
 * Chunking is PURE text splitting — no AI, no summarization/rewriting,
 * original wording preserved exactly. Only embeddings are AI-generated
 * (a separate step, tracked by `indexStatus`, independent of the parent
 * document's own `status`). Never touched by any candidate/public API.
 */
export type OrganizationKnowledgeChunkIndexStatus = 'pending' | 'ready' | 'failed';

export interface IOrganizationKnowledgeChunk extends Document {
  organizationId: Types.ObjectId;
  knowledgeBaseId: Types.ObjectId;
  documentId: Types.ObjectId;
  chunkVersion: string;
  chunkIndex: number;
  headingPath?: string[];
  text: string;
  characterStart?: number;
  characterEnd?: number;
  tokenEstimate?: number;
  wordCount: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  indexStatus: OrganizationKnowledgeChunkIndexStatus;
  indexedAt?: Date;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationKnowledgeChunkSchema = new Schema<IOrganizationKnowledgeChunk>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    knowledgeBaseId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeBase', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeDocument', required: true },
    chunkVersion: { type: String, required: true },
    chunkIndex: { type: Number, required: true, min: 0 },
    headingPath: { type: [String], default: undefined },
    text: { type: String, required: true },
    characterStart: { type: Number, min: 0 },
    characterEnd: { type: Number, min: 0 },
    tokenEstimate: { type: Number, min: 0 },
    wordCount: { type: Number, required: true, min: 0 },
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String },
    embeddingDimensions: { type: Number, min: 0 },
    indexStatus: {
      type: String,
      enum: { values: ['pending', 'ready', 'failed'], message: '{VALUE} is not a valid index status' },
      required: true,
      default: 'pending',
    },
    indexedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'organization_knowledge_chunks',
  }
);

// Exactly one chunk per {document, chunkIndex}, ever — a rebuild deletes
// and recreates this exact document's chunk set (never touches another
// document/org).
organizationKnowledgeChunkSchema.index({ organizationId: 1, documentId: 1, chunkIndex: 1 }, { unique: true });
// Retrieval candidate-set query shape: active-org-scoped, filtered to
// ready/indexed chunks within (optionally) selected knowledge bases.
organizationKnowledgeChunkSchema.index({ organizationId: 1, knowledgeBaseId: 1, indexStatus: 1 });

export default mongoose.model<IOrganizationKnowledgeChunk>('OrganizationKnowledgeChunk', organizationKnowledgeChunkSchema);
