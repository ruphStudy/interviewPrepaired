import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * An organization-scoped internal Knowledge Base container (29A) —
 * metadata/foundation only. NO embeddings, NO vector search, NO RAG
 * injection, NO AI happens anywhere in this model's lifecycle; those are
 * later sprints (29C-29E). One organization may hold multiple knowledge
 * bases (e.g. "Engineering Standards", "Customer Support SOP"). Never hard
 * deleted — `archived` is the terminal, read-only state.
 */
export type OrganizationKnowledgeBaseStatus = 'active' | 'archived';

export interface IOrganizationKnowledgeBase extends Document {
  organizationId: Types.ObjectId;
  name: string;
  description?: string;
  status: OrganizationKnowledgeBaseStatus;
  knowledgeVersion: string;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationKnowledgeBaseSchema = new Schema<IOrganizationKnowledgeBase>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name: { type: String, required: true, trim: true, maxlength: [200, 'name cannot exceed 200 characters'] },
    description: { type: String, trim: true, maxlength: [1000, 'description cannot exceed 1000 characters'] },
    status: {
      type: String,
      enum: { values: ['active', 'archived'], message: '{VALUE} is not a valid knowledge base status' },
      required: true,
      default: 'active',
    },
    knowledgeVersion: { type: String, required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'organization_knowledge_bases',
  }
);

organizationKnowledgeBaseSchema.index({ organizationId: 1, status: 1 });
organizationKnowledgeBaseSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model<IOrganizationKnowledgeBase>('OrganizationKnowledgeBase', organizationKnowledgeBaseSchema);
