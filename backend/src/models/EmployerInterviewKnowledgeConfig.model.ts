import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE interview's opt-in configuration for using organization knowledge
 * (29C retrieval) as OPTIONAL grounding context (29D) — `enabled` defaults
 * false, and no retrieval/embedding call is EVER made for a disabled or
 * missing config. `applicationId`/`jobId` are resolved server-side from the
 * interview at write time — never trusted from the client.
 */
export interface IEmployerInterviewKnowledgeConfig extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  enabled: boolean;
  knowledgeBaseIds: Types.ObjectId[];
  maxRetrievedChunks: number;
  configVersion: string;
  createdByMembershipId: Types.ObjectId;
  updatedByMembershipId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerInterviewKnowledgeConfigSchema = new Schema<IEmployerInterviewKnowledgeConfig>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    enabled: { type: Boolean, required: true, default: false },
    knowledgeBaseIds: { type: [Schema.Types.ObjectId], ref: 'OrganizationKnowledgeBase', default: [] },
    maxRetrievedChunks: { type: Number, required: true, default: 5, min: 1, max: 10 },
    configVersion: { type: String, required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    updatedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
  },
  {
    timestamps: true,
    collection: 'employer_interview_knowledge_configs',
  }
);

employerInterviewKnowledgeConfigSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewKnowledgeConfig>(
  'EmployerInterviewKnowledgeConfig',
  employerInterviewKnowledgeConfigSchema
);
