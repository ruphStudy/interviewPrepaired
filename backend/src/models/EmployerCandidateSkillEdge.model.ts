import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A candidate-application skill EVIDENCE edge (25A) — represents structured
 * evidence PRESENCE only, never a proficiency certification. Sourced
 * EXCLUSIVELY from existing structured artifacts (18C resume analysis, 19A
 * screening, 21E assessment result, 22A evidence matrix) — never raw
 * resume/JD text, never recruiter notes/decisions/communications. Rebuilt
 * deterministically by `EmployerSkillGraphService`, scoped strictly to one
 * application — a rebuild never touches another application/job/candidate.
 */
export type EmployerCandidateSkillEvidenceSourceType = 'resume' | 'screening' | 'assessment' | 'evidence';

export interface ICandidateSkillEvidenceSource {
  type: EmployerCandidateSkillEvidenceSourceType;
  sourceArtifactId: Types.ObjectId;
  evidenceLevel?: string;
  score?: number;
}

export interface IEmployerCandidateSkillEdge extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  skillNodeId: Types.ObjectId;
  sources: ICandidateSkillEvidenceSource[];
  createdAt: Date;
  updatedAt: Date;
}

const candidateSkillEvidenceSourceSchema = new Schema<ICandidateSkillEvidenceSource>(
  {
    type: {
      type: String,
      enum: { values: ['resume', 'screening', 'assessment', 'evidence'], message: '{VALUE} is not a valid evidence source type' },
      required: true,
    },
    sourceArtifactId: { type: Schema.Types.ObjectId, required: true },
    evidenceLevel: { type: String },
    score: { type: Number },
  },
  { _id: false }
);

const employerCandidateSkillEdgeSchema = new Schema<IEmployerCandidateSkillEdge>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    skillNodeId: { type: Schema.Types.ObjectId, ref: 'EmployerSkillNode', required: true },
    sources: { type: [candidateSkillEvidenceSourceSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'employer_candidate_skill_edges',
  }
);

// One edge per skill per application, ever — merges all evidence for the
// same normalized skill into this one edge's `sources` array. Also the
// upsert target for deterministic rebuild.
employerCandidateSkillEdgeSchema.index({ organizationId: 1, applicationId: 1, skillNodeId: 1 }, { unique: true });
employerCandidateSkillEdgeSchema.index({ organizationId: 1, applicationId: 1 });

export default mongoose.model<IEmployerCandidateSkillEdge>('EmployerCandidateSkillEdge', employerCandidateSkillEdgeSchema);
