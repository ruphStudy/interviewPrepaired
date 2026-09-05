import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerInterviewInvitationStatus } from '../constants/employerInterviewInvitation';

/**
 * A secure, hashed-token invitation for a shortlisted application's
 * interview (20C). The raw token is NEVER persisted — only its SHA-256
 * hash (`tokenHash`), mirroring the existing `OrganizationInvitation`
 * pattern. Belongs to an EXACT `blueprintId` — if a later screening
 * produces a new blueprint, a new invitation may be created for it, but
 * this row remains historical and is never reused across blueprint
 * versions. No public token-consumption endpoint exists yet (20D); this
 * sprint only creates/manages the invitation record itself.
 */
export interface IEmployerInterviewInvitation extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  status: EmployerInterviewInvitationStatus;
  tokenHash: string;
  expiresAt: Date;
  invitedEmail: string;
  invitedName?: string;
  message?: string;
  createdByMembershipId: Types.ObjectId;
  sentAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
  // Reserved (20E) — filled in only once a real Interview session exists
  // for this invitation, mirroring InstituteStudentInterviewAssignment's
  // own `interviewId` reverse-link. A best-effort convenience pointer
  // only; the Interview's own unique `employerInvitationId` index (not
  // this field) is the authoritative concurrency guard against duplicates.
  interviewId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerInterviewInvitationSchema = new Schema<IEmployerInterviewInvitation>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobApplication',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    blueprintId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerInterviewBlueprint',
      required: true,
    },
    rubricId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerInterviewCompetencyRubric',
      required: true,
    },
    status: {
      type: String,
      enum: { values: Object.values(EmployerInterviewInvitationStatus), message: '{VALUE} is not a valid invitation status' },
      required: true,
    },
    // Never the raw token — SHA-256 hex digest only, mirroring OrganizationInvitationService's own convention.
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    invitedEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: [254, 'invitedEmail cannot exceed 254 characters'],
    },
    invitedName: { type: String, trim: true, maxlength: [200, 'invitedName cannot exceed 200 characters'] },
    message: { type: String, trim: true, maxlength: [1000, 'message cannot exceed 1000 characters'] },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    sentAt: { type: Date },
    acceptedAt: { type: Date },
    revokedAt: { type: Date },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
  },
  {
    timestamps: true,
    collection: 'employer_interview_invitations',
  }
);

// One invitation per {applicationId, blueprintId} — a new blueprint (from a
// later screening) may get its own invitation, but an old one is never
// reused/regenerated across blueprint versions.
employerInterviewInvitationSchema.index({ organizationId: 1, applicationId: 1, blueprintId: 1 }, { unique: true });
// The actual concurrency/security guard for token lookup — also prevents any
// (astronomically unlikely) token collision from ever being silently reused.
employerInterviewInvitationSchema.index({ tokenHash: 1 }, { unique: true });
employerInterviewInvitationSchema.index({ organizationId: 1, jobId: 1, status: 1, createdAt: -1 });

export default mongoose.model<IEmployerInterviewInvitation>('EmployerInterviewInvitation', employerInterviewInvitationSchema);
