import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';

/**
 * Append-only employer audit trail for one job application (23C) — no
 * update/delete endpoint exists for this model at all. `assessment_finalized`
 * is listed as a recognized type for response-shape parity but is NEVER
 * persisted here: it is always derived live from the immutable 22E
 * finalization by `EmployerJobApplicationTimelineService`, never written as
 * a duplicate row. `status_changed` rows are written only AFTER the status
 * transition itself has successfully persisted through
 * `EmployerJobApplicationService`'s single lifecycle helper — never before,
 * never as a separate mutation path.
 */
export type EmployerJobApplicationActivityType = 'application_created' | 'status_changed' | 'assessment_finalized';
export type EmployerJobApplicationActivityActorType = 'member' | 'system';

export interface IEmployerJobApplicationActivity extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  type: EmployerJobApplicationActivityType;
  fromStatus?: EmployerJobApplicationStatus;
  toStatus?: EmployerJobApplicationStatus;
  actorType: EmployerJobApplicationActivityActorType;
  actorMembershipId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
}

const employerJobApplicationActivitySchema = new Schema<IEmployerJobApplicationActivity>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    type: {
      type: String,
      enum: { values: ['application_created', 'status_changed', 'assessment_finalized'], message: '{VALUE} is not a valid activity type' },
      required: true,
    },
    fromStatus: { type: String, enum: Object.values(EmployerJobApplicationStatus) },
    toStatus: { type: String, enum: Object.values(EmployerJobApplicationStatus) },
    actorType: {
      type: String,
      enum: { values: ['member', 'system'], message: '{VALUE} is not a valid actor type' },
      required: true,
    },
    actorMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, required: true },
  },
  {
    // No updatedAt — append-only; rows are never modified after creation.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_job_application_activities',
  }
);

employerJobApplicationActivitySchema.index({ organizationId: 1, applicationId: 1, occurredAt: 1 });
employerJobApplicationActivitySchema.index({ organizationId: 1, jobId: 1, occurredAt: 1 });

export default mongoose.model<IEmployerJobApplicationActivity>(
  'EmployerJobApplicationActivity',
  employerJobApplicationActivitySchema
);
