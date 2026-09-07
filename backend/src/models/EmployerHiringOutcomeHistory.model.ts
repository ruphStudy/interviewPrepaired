import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Append-only audit trail for `EmployerHiringOutcome` changes (32C) —
 * bounded, small before/after snapshots only (never a full document copy).
 * Write-once; no update/delete endpoint exists for this model.
 */
export interface IEmployerHiringOutcomeHistory extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  changedByMembershipId?: Types.ObjectId;
  source: 'manual' | 'pipeline';
  /** Bounded JSON summary of the fields that changed only — never a full raw document snapshot. */
  previous: Record<string, unknown>;
  next: Record<string, unknown>;
  changedAt: Date;
}

const employerHiringOutcomeHistorySchema = new Schema<IEmployerHiringOutcomeHistory>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    changedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
    source: { type: String, enum: ['manual', 'pipeline'], required: true },
    previous: { type: Schema.Types.Mixed, required: true },
    next: { type: Schema.Types.Mixed, required: true },
    changedAt: { type: Date, required: true },
  },
  {
    timestamps: false,
    collection: 'employer_hiring_outcome_history',
  }
);

employerHiringOutcomeHistorySchema.index({ organizationId: 1, applicationId: 1, changedAt: -1 });

export default mongoose.model<IEmployerHiringOutcomeHistory>('EmployerHiringOutcomeHistory', employerHiringOutcomeHistorySchema);
