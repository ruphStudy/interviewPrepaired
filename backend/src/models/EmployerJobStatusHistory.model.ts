import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobStatus } from '../constants/employerJob';

/**
 * Append-only audit trail for EmployerJob status transitions (16C). This is
 * history ONLY — the current job status lives exclusively on EmployerJob
 * itself; nothing ever reads this collection to determine a job's live
 * status. One row is created per successful transition, by
 * EmployerJobService.updateJobStatus() alone — never written to from
 * anywhere else, and never updated/deleted after creation.
 */
export interface IEmployerJobStatusHistory extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  fromStatus: EmployerJobStatus;
  toStatus: EmployerJobStatus;
  changedByMembershipId: Types.ObjectId;
  changedAt: Date;
  note?: string;
}

const employerJobStatusHistorySchema = new Schema<IEmployerJobStatusHistory>(
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
    fromStatus: {
      type: String,
      enum: { values: Object.values(EmployerJobStatus), message: '{VALUE} is not a valid job status' },
      required: true,
    },
    toStatus: {
      type: String,
      enum: { values: Object.values(EmployerJobStatus), message: '{VALUE} is not a valid job status' },
      required: true,
    },
    changedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    note: { type: String, trim: true, maxlength: [500, 'note cannot exceed 500 characters'] },
  },
  {
    // No `timestamps: true` — `changedAt` IS this record's own timestamp;
    // an append-only audit row is never updated after creation.
    collection: 'employer_job_status_history',
  }
);

employerJobStatusHistorySchema.index({ organizationId: 1, jobId: 1, changedAt: -1 });
employerJobStatusHistorySchema.index({ organizationId: 1, changedAt: -1 });

export default mongoose.model<IEmployerJobStatusHistory>('EmployerJobStatusHistory', employerJobStatusHistorySchema);
