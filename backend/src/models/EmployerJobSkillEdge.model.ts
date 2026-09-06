import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A job-level skill requirement edge (25A), sourced EXCLUSIVELY from the
 * exact finalized 17E JD intelligence snapshot named by `sourceSnapshotId`
 * — never raw JD text, never a manually-entered job field. Rebuilt
 * deterministically by `EmployerSkillGraphService`; a stale edge (from an
 * obsolete/superseded snapshot) is reconciled away on the next build, never
 * left dangling.
 */
export interface IEmployerJobSkillEdge extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  skillNodeId: Types.ObjectId;
  sourceSnapshotId: Types.ObjectId;
  importance?: string;
  weight?: number;
  createdAt: Date;
}

const employerJobSkillEdgeSchema = new Schema<IEmployerJobSkillEdge>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    skillNodeId: { type: Schema.Types.ObjectId, ref: 'EmployerSkillNode', required: true },
    sourceSnapshotId: { type: Schema.Types.ObjectId, ref: 'EmployerJobIntelligenceSnapshot', required: true },
    importance: { type: String },
    weight: { type: Number },
  },
  {
    // No updatedAt — an edge is deleted and recreated by reconciliation, never mutated in place except via upsert of the same key.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_job_skill_edges',
  }
);

employerJobSkillEdgeSchema.index(
  { organizationId: 1, jobId: 1, sourceSnapshotId: 1, skillNodeId: 1 },
  { unique: true }
);
employerJobSkillEdgeSchema.index({ organizationId: 1, jobId: 1 });

export default mongoose.model<IEmployerJobSkillEdge>('EmployerJobSkillEdge', employerJobSkillEdgeSchema);
