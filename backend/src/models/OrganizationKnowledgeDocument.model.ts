import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE document's metadata + extracted text within an organization Knowledge
 * Base (29A/29B) — `rawText` is confidential internal organization
 * knowledge; it must NEVER be exposed through any candidate/public API,
 * never logged, and never returned from the ordinary list endpoint (only
 * from an explicit, authenticated, employer-only detail/content read).
 * `storedFileName` is server-internal only (relative path under the local
 * knowledge-document storage root) — never returned by any API response.
 * NO embeddings/vector data live on this model; that is 29C.
 */
export type OrganizationKnowledgeDocumentSourceType = 'file' | 'text';
export type OrganizationKnowledgeDocumentStatus = 'draft' | 'processing' | 'ready' | 'failed' | 'archived';

export interface IOrganizationKnowledgeDocument extends Document {
  organizationId: Types.ObjectId;
  knowledgeBaseId: Types.ObjectId;
  title: string;
  description?: string;
  sourceType: OrganizationKnowledgeDocumentSourceType;
  originalFileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  /** Relative path under the knowledge-document storage root — server-internal only, never returned by the API. Present only for `sourceType: 'file'`. */
  storedFileName?: string;
  status: OrganizationKnowledgeDocumentStatus;
  parsingVersion?: string;
  characterCount?: number;
  wordCount?: number;
  rawText?: string;
  /** Short, safe, user-facing message only — never a raw provider/library error dump. */
  parseError?: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationKnowledgeDocumentSchema = new Schema<IOrganizationKnowledgeDocument>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    knowledgeBaseId: { type: Schema.Types.ObjectId, ref: 'OrganizationKnowledgeBase', required: true },
    title: { type: String, required: true, trim: true, maxlength: [200, 'title cannot exceed 200 characters'] },
    description: { type: String, trim: true, maxlength: [1000, 'description cannot exceed 1000 characters'] },
    sourceType: {
      type: String,
      enum: { values: ['file', 'text'], message: '{VALUE} is not a valid source type' },
      required: true,
    },
    originalFileName: { type: String, trim: true, maxlength: [255, 'originalFileName cannot exceed 255 characters'] },
    mimeType: { type: String, trim: true },
    fileSizeBytes: { type: Number, min: 0 },
    storedFileName: { type: String },
    status: {
      type: String,
      enum: { values: ['draft', 'processing', 'ready', 'failed', 'archived'], message: '{VALUE} is not a valid document status' },
      required: true,
    },
    parsingVersion: { type: String },
    characterCount: { type: Number, min: 0 },
    wordCount: { type: Number, min: 0 },
    rawText: { type: String },
    parseError: { type: String, trim: true, maxlength: [500, 'parseError cannot exceed 500 characters'] },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'organization_knowledge_documents',
  }
);

organizationKnowledgeDocumentSchema.index({ organizationId: 1, knowledgeBaseId: 1, status: 1 });
organizationKnowledgeDocumentSchema.index({ organizationId: 1, knowledgeBaseId: 1, createdAt: -1 });

export default mongoose.model<IOrganizationKnowledgeDocument>('OrganizationKnowledgeDocument', organizationKnowledgeDocumentSchema);
