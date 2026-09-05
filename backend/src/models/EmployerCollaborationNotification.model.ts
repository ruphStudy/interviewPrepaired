import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * In-app-only employer collaboration notification (24C) — no email/SMS/
 * WhatsApp/push, no notification-delivery infrastructure. `recipientMembershipId`
 * is always a trusted organization membership, never a client-supplied
 * userId. Deduped via the unique {organizationId, recipientMembershipId,
 * type, sourceId} index — a concurrent/duplicate create throws E11000,
 * which the writing service catches and ignores (the notification already
 * exists). Never blocks/undoes the source note or collaborator assignment
 * write if a notification write fails.
 */
export type EmployerCollaborationNotificationType = 'note_mention' | 'collaborator_assigned';

export interface IEmployerCollaborationNotification extends Document {
  organizationId: Types.ObjectId;
  recipientMembershipId: Types.ObjectId;
  type: EmployerCollaborationNotificationType;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  /** Note id for `note_mention`; collaborator assignment row id for `collaborator_assigned`. */
  sourceId: Types.ObjectId;
  actorMembershipId: Types.ObjectId;
  readAt?: Date;
  createdAt: Date;
}

const employerCollaborationNotificationSchema = new Schema<IEmployerCollaborationNotification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    recipientMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    type: {
      type: String,
      enum: { values: ['note_mention', 'collaborator_assigned'], message: '{VALUE} is not a valid notification type' },
      required: true,
    },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    actorMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    readAt: { type: Date },
  },
  {
    // No updatedAt — a notification's only mutable field is `readAt`, set
    // via a targeted $set, never a general update path.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_collaboration_notifications',
  }
);

employerCollaborationNotificationSchema.index({ organizationId: 1, recipientMembershipId: 1, createdAt: -1 });
employerCollaborationNotificationSchema.index({ organizationId: 1, recipientMembershipId: 1, readAt: 1, createdAt: -1 });
// Dedupe guard — also doubles as the concurrency claim for notification creation.
employerCollaborationNotificationSchema.index(
  { organizationId: 1, recipientMembershipId: 1, type: 1, sourceId: 1 },
  { unique: true }
);

export default mongoose.model<IEmployerCollaborationNotification>(
  'EmployerCollaborationNotification',
  employerCollaborationNotificationSchema
);
