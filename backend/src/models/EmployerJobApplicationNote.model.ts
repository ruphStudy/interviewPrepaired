import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Internal employer collaboration note on a job application (24A) —
 * discussion/context only. Never affects scores, recommendations,
 * pipeline status, or any candidate-visible data; never exposed publicly
 * or on the candidate portal. Immutable after creation in 24A — no
 * edit/delete endpoint exists for this model at all.
 */
export interface IEmployerJobApplicationNote extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  body: string;
  // Explicit, UI-selected teammate mentions (24B) — never derived from
  // free-form @text parsing. Each id is a validated ACTIVE OrganizationMember
  // in this SAME organization at write time; in-app discoverability only —
  // no email/SMS/push notification is ever sent from this field.
  mentionMembershipIds: Types.ObjectId[];
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerJobApplicationNoteSchema = new Schema<IEmployerJobApplicationNote>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    body: { type: String, required: true, trim: true, maxlength: [3000, 'body cannot exceed 3000 characters'] },
    mentionMembershipIds: { type: [Schema.Types.ObjectId], ref: 'OrganizationMember', default: [] },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'employer_job_application_notes',
  }
);

employerJobApplicationNoteSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });
employerJobApplicationNoteSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });
// Mention inbox lookup (24B) — "notes where this membership is mentioned".
employerJobApplicationNoteSchema.index({ organizationId: 1, mentionMembershipIds: 1, createdAt: -1 });

export default mongoose.model<IEmployerJobApplicationNote>('EmployerJobApplicationNote', employerJobApplicationNoteSchema);
