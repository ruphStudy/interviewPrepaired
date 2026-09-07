import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * INTERNAL integration event metadata (31D) — a durable record that a
 * hiring milestone occurred, used to fan out `EmployerIntegrationDelivery`
 * rows to eligible connections. Deliberately bounded: never stores
 * candidate answers, source code, resumes, KB content, or any other
 * confidential payload — only IDs/type/timestamps a downstream adapter
 * needs to look up bounded, safe details itself at delivery time.
 */
export type EmployerIntegrationEventType =
  | 'application_created'
  | 'application_status_changed'
  | 'interview_invited'
  | 'interview_started'
  | 'interview_completed'
  | 'interview_finalized'
  | 'report_ready'
  | 'scenario_completed'
  | 'coding_completed'
  | 'workflow_action_completed';

export interface IEmployerIntegrationEvent extends Document {
  organizationId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  jobId?: Types.ObjectId;
  interviewId?: Types.ObjectId;
  eventType: EmployerIntegrationEventType;
  eventVersion: string;
  payloadVersion: string;
  occurredAt: Date;
  sourceArtifactType?: string;
  sourceArtifactId?: string;
  /** Bounded, non-confidential extra context (e.g. `{status: 'shortlisted'}`) — never answers/source code/resume/KB text. A plain object may be passed in when creating a document; Mongoose always materializes this as a real `Map` on read. */
  data?: Map<string, string>;
  createdAt: Date;
}

const employerIntegrationEventSchema = new Schema<IEmployerIntegrationEvent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication' },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob' },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
    eventType: {
      type: String,
      enum: [
        'application_created',
        'application_status_changed',
        'interview_invited',
        'interview_started',
        'interview_completed',
        'interview_finalized',
        'report_ready',
        'scenario_completed',
        'coding_completed',
        'workflow_action_completed',
      ],
      required: true,
    },
    eventVersion: { type: String, required: true },
    payloadVersion: { type: String, required: true },
    occurredAt: { type: Date, required: true },
    sourceArtifactType: { type: String, trim: true, maxlength: [100, 'sourceArtifactType cannot exceed 100 characters'] },
    sourceArtifactId: { type: String, trim: true, maxlength: [100, 'sourceArtifactId cannot exceed 100 characters'] },
    data: { type: Map, of: String },
  },
  {
    // No updatedAt — write-once.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_integration_events',
  }
);

employerIntegrationEventSchema.index({ organizationId: 1, createdAt: -1 });
employerIntegrationEventSchema.index({ organizationId: 1, applicationId: 1 });
// Best-effort de-duplication guard for a single milestone source artifact re-emitting the same event type.
employerIntegrationEventSchema.index({ organizationId: 1, eventType: 1, sourceArtifactType: 1, sourceArtifactId: 1 });

export default mongoose.model<IEmployerIntegrationEvent>('EmployerIntegrationEvent', employerIntegrationEventSchema);
