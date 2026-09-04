import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobHiringTeamRole } from '../constants/employerJobHiringTeam';

/**
 * A job-local hiring-team assignment (16D) — links an EXISTING
 * OrganizationMember to ONE job with a job-scoped role. This is purely an
 * assignment/metadata record: it never creates a user or member, and never
 * changes OrganizationMember.role/status. `membershipId` always refers to a
 * membership already verified (by EmployerJobHiringTeamService) to be
 * ACTIVE in the SAME organization as `organizationId` — this model itself
 * does not re-derive that; the service is the sole write path.
 */
export interface IEmployerJobHiringTeamMember extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  membershipId: Types.ObjectId;
  role: EmployerJobHiringTeamRole;
  addedByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerJobHiringTeamMemberSchema = new Schema<IEmployerJobHiringTeamMember>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    membershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    role: {
      type: String,
      enum: { values: Object.values(EmployerJobHiringTeamRole), message: '{VALUE} is not a valid hiring team role' },
      required: true,
    },
    addedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'employer_job_hiring_team_members',
  }
);

employerJobHiringTeamMemberSchema.index({ organizationId: 1, jobId: 1 });
employerJobHiringTeamMemberSchema.index({ organizationId: 1, membershipId: 1 });
// At most one hiring-team row per member per job.
employerJobHiringTeamMemberSchema.index({ organizationId: 1, jobId: 1, membershipId: 1 }, { unique: true });

export default mongoose.model<IEmployerJobHiringTeamMember>('EmployerJobHiringTeamMember', employerJobHiringTeamMemberSchema);
