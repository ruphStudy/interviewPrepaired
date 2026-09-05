import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * An auditable LOG of candidate communication that happened outside or
 * around the platform (24D) — recording a row here NEVER sends an actual
 * message (no email/SMS/WhatsApp/call is ever triggered). Append-only, no
 * update/delete endpoint. Never affects pipeline status, never creates a
 * 23E decision row, never notifies the candidate, never used as
 * assessment evidence.
 */
export type EmployerCandidateCommunicationDirection = 'outbound' | 'inbound';
export type EmployerCandidateCommunicationChannel = 'email' | 'phone' | 'sms' | 'whatsapp' | 'video_call' | 'in_person' | 'other';
export type EmployerCandidateCommunicationType =
  | 'outreach'
  | 'interview_scheduling'
  | 'interview_update'
  | 'follow_up'
  | 'offer_discussion'
  | 'rejection_notice'
  | 'candidate_question'
  | 'general'
  | 'other';

export const EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS: EmployerCandidateCommunicationDirection[] = ['outbound', 'inbound'];

export const EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS: EmployerCandidateCommunicationChannel[] = [
  'email',
  'phone',
  'sms',
  'whatsapp',
  'video_call',
  'in_person',
  'other',
];

export const EMPLOYER_CANDIDATE_COMMUNICATION_TYPES: EmployerCandidateCommunicationType[] = [
  'outreach',
  'interview_scheduling',
  'interview_update',
  'follow_up',
  'offer_discussion',
  'rejection_notice',
  'candidate_question',
  'general',
  'other',
];

export interface IEmployerCandidateCommunication extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  direction: EmployerCandidateCommunicationDirection;
  channel: EmployerCandidateCommunicationChannel;
  communicationType: EmployerCandidateCommunicationType;
  subject?: string;
  summary: string;
  occurredAt: Date;
  recordedByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const employerCandidateCommunicationSchema = new Schema<IEmployerCandidateCommunication>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    direction: {
      type: String,
      enum: { values: EMPLOYER_CANDIDATE_COMMUNICATION_DIRECTIONS, message: '{VALUE} is not a valid direction' },
      required: true,
    },
    channel: {
      type: String,
      enum: { values: EMPLOYER_CANDIDATE_COMMUNICATION_CHANNELS, message: '{VALUE} is not a valid channel' },
      required: true,
    },
    communicationType: {
      type: String,
      enum: { values: EMPLOYER_CANDIDATE_COMMUNICATION_TYPES, message: '{VALUE} is not a valid communicationType' },
      required: true,
    },
    subject: { type: String, trim: true, maxlength: [300, 'subject cannot exceed 300 characters'] },
    summary: { type: String, required: true, trim: true, maxlength: [3000, 'summary cannot exceed 3000 characters'] },
    occurredAt: { type: Date, required: true },
    recordedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    // No updatedAt — append-only; rows are never modified after creation.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_communications',
  }
);

employerCandidateCommunicationSchema.index({ organizationId: 1, applicationId: 1, occurredAt: -1 });
employerCandidateCommunicationSchema.index({ organizationId: 1, jobId: 1, occurredAt: -1 });

export default mongoose.model<IEmployerCandidateCommunication>(
  'EmployerCandidateCommunication',
  employerCandidateCommunicationSchema
);
