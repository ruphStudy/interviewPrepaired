import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE observable browser/session event recorded during a proctored hiring
 * assessment (31A) — e.g. a tab-visibility change or a copy/paste ACTION
 * TYPE. NEVER clipboard content, camera/mic/screen data, or any biometric
 * signal. `receivedAt` is always the server clock; `occurredAt` is
 * candidate-reported and bounded against drift by the recording service.
 */
export type EmployerAssessmentProctoringEventType =
  | 'session_started'
  | 'session_resumed'
  | 'visibility_hidden'
  | 'visibility_visible'
  | 'window_blur'
  | 'window_focus'
  | 'fullscreen_exit'
  | 'fullscreen_enter'
  | 'copy'
  | 'paste'
  | 'navigation_attempt';

export type EmployerAssessmentProctoringArea = 'interview' | 'scenario' | 'coding';

export interface IEmployerAssessmentProctoringEventMetadata {
  questionIndex?: number;
  scenarioId?: Types.ObjectId;
  codingQuestionId?: Types.ObjectId;
}

export interface IEmployerAssessmentProctoringEvent extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  eventVersion: string;
  eventType: EmployerAssessmentProctoringEventType;
  assessmentArea: EmployerAssessmentProctoringArea;
  metadata?: IEmployerAssessmentProctoringEventMetadata;
  occurredAt: Date;
  receivedAt: Date;
}

const metadataSchema = new Schema<IEmployerAssessmentProctoringEventMetadata>(
  {
    questionIndex: { type: Number, min: 0 },
    scenarioId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenario' },
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion' },
  },
  { _id: false }
);

const employerAssessmentProctoringEventSchema = new Schema<IEmployerAssessmentProctoringEvent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    eventVersion: { type: String, required: true },
    eventType: {
      type: String,
      enum: {
        values: [
          'session_started',
          'session_resumed',
          'visibility_hidden',
          'visibility_visible',
          'window_blur',
          'window_focus',
          'fullscreen_exit',
          'fullscreen_enter',
          'copy',
          'paste',
          'navigation_attempt',
        ],
        message: '{VALUE} is not a valid event type',
      },
      required: true,
    },
    assessmentArea: {
      type: String,
      enum: { values: ['interview', 'scenario', 'coding'], message: '{VALUE} is not a valid assessment area' },
      required: true,
    },
    metadata: { type: metadataSchema },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
  },
  {
    // No updatedAt — an event row is write-once, never mutated.
    timestamps: { createdAt: false, updatedAt: false },
    collection: 'employer_assessment_proctoring_events',
  }
);

employerAssessmentProctoringEventSchema.index({ organizationId: 1, interviewId: 1, occurredAt: 1 });
employerAssessmentProctoringEventSchema.index({ organizationId: 1, applicationId: 1 });

export default mongoose.model<IEmployerAssessmentProctoringEvent>(
  'EmployerAssessmentProctoringEvent',
  employerAssessmentProctoringEventSchema
);
