import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A local calendar record for ONE hiring interview (31E) — always useful
 * on its own even before/without a real provider OAuth integration. Never
 * stores candidate answers/evaluation/hidden assessment data; `title` is a
 * safe, server-generated string only. `status` distinguishes a purely
 * local schedule (`scheduled`) from an actual external-provider sync
 * outcome — the UI must never claim provider sync succeeded unless it
 * genuinely did.
 */
export type EmployerInterviewCalendarEventStatus = 'scheduled' | 'cancelled' | 'sync_pending' | 'synced' | 'sync_failed';

export interface IEmployerInterviewCalendarEvent extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  connectionId?: Types.ObjectId;
  provider: string;
  externalEventId?: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  title: string;
  status: EmployerInterviewCalendarEventStatus;
  calendarVersion: string;
  lastSyncedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const employerInterviewCalendarEventSchema = new Schema<IEmployerInterviewCalendarEvent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    connectionId: { type: Schema.Types.ObjectId, ref: 'EmployerIntegrationConnection' },
    provider: { type: String, required: true, default: 'local' },
    externalEventId: { type: String, trim: true, maxlength: [200, 'externalEventId cannot exceed 200 characters'] },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    timezone: { type: String, required: true, trim: true, maxlength: [100, 'timezone cannot exceed 100 characters'] },
    title: { type: String, required: true, trim: true, maxlength: [300, 'title cannot exceed 300 characters'] },
    status: {
      type: String,
      enum: ['scheduled', 'cancelled', 'sync_pending', 'synced', 'sync_failed'],
      required: true,
      default: 'scheduled',
    },
    calendarVersion: { type: String, required: true },
    lastSyncedAt: { type: Date },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_interview_calendar_events',
  }
);

employerInterviewCalendarEventSchema.index({ organizationId: 1, interviewId: 1, connectionId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewCalendarEvent>('EmployerInterviewCalendarEvent', employerInterviewCalendarEventSchema);
