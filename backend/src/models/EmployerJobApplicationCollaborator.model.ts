import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobApplicationCollaborationRole } from '../constants/employerJobApplicationCollaboration';

/**
 * An application-local collaboration assignment (24B) — links an EXISTING
 * OrganizationMember to ONE application with a collaboration-scoped role.
 * This is purely collaboration METADATA: it never creates a user/member,
 * never changes OrganizationMember.role/status, and `collaborationRole` is
 * NEVER used as an RBAC permission — organization RBAC remains
 * authoritative. `membershipId` always refers to a membership already
 * verified (by EmployerJobApplicationCollaborationService) to be ACTIVE in
 * the SAME organization — this model itself does not re-derive that.
 */
export interface IEmployerJobApplicationCollaborator extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  membershipId: Types.ObjectId;
  collaborationRole: EmployerJobApplicationCollaborationRole;
  assignedByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerJobApplicationCollaboratorSchema = new Schema<IEmployerJobApplicationCollaborator>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    membershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    collaborationRole: {
      type: String,
      enum: { values: Object.values(EmployerJobApplicationCollaborationRole), message: '{VALUE} is not a valid collaboration role' },
      required: true,
    },
    assignedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'employer_job_application_collaborators',
  }
);

// At most one collaboration row per member per application — also the upsert target.
employerJobApplicationCollaboratorSchema.index({ organizationId: 1, applicationId: 1, membershipId: 1 }, { unique: true });
employerJobApplicationCollaboratorSchema.index({ organizationId: 1, applicationId: 1 });

export default mongoose.model<IEmployerJobApplicationCollaborator>(
  'EmployerJobApplicationCollaborator',
  employerJobApplicationCollaboratorSchema
);
