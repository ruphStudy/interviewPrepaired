import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) integrity SIGNAL summary derived purely from 31A
 * raw proctoring events (31B) — never a cheating score/probability, never
 * a deception detector, never a pass/fail. `reviewState` only ever flags
 * that a human should look at context; it never accuses or decides.
 */
export type EmployerAssessmentIntegritySignalType =
  | 'repeated_tab_switching'
  | 'repeated_window_blur'
  | 'repeated_fullscreen_exit'
  | 'repeated_copy_paste'
  | 'navigation_activity';
export type EmployerAssessmentIntegritySignalLevel = 'low' | 'medium' | 'high';
export type EmployerAssessmentIntegrityReviewState = 'no_signals' | 'review_suggested';

export interface IEmployerAssessmentIntegrityEventCounts {
  visibilityHidden: number;
  windowBlur: number;
  fullscreenExit: number;
  copy: number;
  paste: number;
  navigationAttempt: number;
}

export interface IEmployerAssessmentIntegritySignal {
  signalType: EmployerAssessmentIntegritySignalType;
  level: EmployerAssessmentIntegritySignalLevel;
  eventCount: number;
  description: string;
}

export interface IEmployerAssessmentIntegrityTimeline {
  firstEventAt?: Date;
  lastEventAt?: Date;
  totalRecordedEvents: number;
}

export interface IEmployerAssessmentIntegritySummary extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  eventCounts: IEmployerAssessmentIntegrityEventCounts;
  signals: IEmployerAssessmentIntegritySignal[];
  timeline: IEmployerAssessmentIntegrityTimeline;
  reviewState: EmployerAssessmentIntegrityReviewState;
  createdAt: Date;
  updatedAt: Date;
}

const eventCountsSchema = new Schema<IEmployerAssessmentIntegrityEventCounts>(
  {
    visibilityHidden: { type: Number, required: true, min: 0, default: 0 },
    windowBlur: { type: Number, required: true, min: 0, default: 0 },
    fullscreenExit: { type: Number, required: true, min: 0, default: 0 },
    copy: { type: Number, required: true, min: 0, default: 0 },
    paste: { type: Number, required: true, min: 0, default: 0 },
    navigationAttempt: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const signalSchema = new Schema<IEmployerAssessmentIntegritySignal>(
  {
    signalType: {
      type: String,
      enum: [
        'repeated_tab_switching',
        'repeated_window_blur',
        'repeated_fullscreen_exit',
        'repeated_copy_paste',
        'navigation_activity',
      ],
      required: true,
    },
    level: { type: String, enum: ['low', 'medium', 'high'], required: true },
    eventCount: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true, maxlength: [300, 'description cannot exceed 300 characters'] },
  },
  { _id: false }
);

const timelineSchema = new Schema<IEmployerAssessmentIntegrityTimeline>(
  {
    firstEventAt: { type: Date },
    lastEventAt: { type: Date },
    totalRecordedEvents: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const employerAssessmentIntegritySummarySchema = new Schema<IEmployerAssessmentIntegritySummary>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    eventCounts: { type: eventCountsSchema, required: true },
    signals: { type: [signalSchema], default: [] },
    timeline: { type: timelineSchema, required: true },
    reviewState: { type: String, enum: ['no_signals', 'review_suggested'], required: true },
  },
  {
    timestamps: true,
    collection: 'employer_assessment_integrity_summaries',
  }
);

employerAssessmentIntegritySummarySchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerAssessmentIntegritySummary>(
  'EmployerAssessmentIntegritySummary',
  employerAssessmentIntegritySummarySchema
);
