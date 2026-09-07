import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Structured, employer-entered hiring/employment OUTCOME record for ONE
 * application (32C) — POST-HOC observation only. This model TRACKS
 * outcomes; it never predicts, scores, or influences the current
 * assessment/pipeline. `hiringOutcome` may be best-effort synced from the
 * application's own terminal pipeline status, but the pipeline itself
 * always remains the source of truth for the actual hiring decision —
 * this record never drives a status change the other direction.
 */
export type EmployerHiringOutcomeDecision = 'hired' | 'rejected' | 'withdrawn' | 'no_decision';
export type EmployerHiringEmploymentStatus = 'unknown' | 'joined' | 'did_not_join' | 'employed' | 'left';
export type EmployerHiringOutcomeReviewWindow = 'not_available' | 'thirty_day' | 'ninety_day' | 'six_month' | 'twelve_month';
export type EmployerHiringOutcomePerformanceBand = 'below_expectations' | 'meets_expectations' | 'exceeds_expectations';
export type EmployerHiringOutcomeRetentionStatus = 'unknown' | 'retained' | 'exited';
export type EmployerHiringOutcomeSource = 'manual' | 'pipeline';

export interface IEmployerHiringEmploymentOutcome {
  status: EmployerHiringEmploymentStatus;
  joinedAt?: Date;
  leftAt?: Date;
  reviewWindow: EmployerHiringOutcomeReviewWindow;
  performanceBand?: EmployerHiringOutcomePerformanceBand;
  retentionStatus?: EmployerHiringOutcomeRetentionStatus;
  recordedAt?: Date;
}

export interface IEmployerHiringOutcome extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  outcomeVersion: string;
  hiringOutcome: EmployerHiringOutcomeDecision;
  decisionAt?: Date;
  employmentOutcome?: IEmployerHiringEmploymentOutcome;
  source: EmployerHiringOutcomeSource;
  /** Bounded, employment-related context only — never health/protected-trait/family/political/religious content. */
  notes?: string;
  createdByMembershipId?: Types.ObjectId;
  updatedByMembershipId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employmentOutcomeSchema = new Schema<IEmployerHiringEmploymentOutcome>(
  {
    status: { type: String, enum: ['unknown', 'joined', 'did_not_join', 'employed', 'left'], required: true, default: 'unknown' },
    joinedAt: { type: Date },
    leftAt: { type: Date },
    reviewWindow: {
      type: String,
      enum: ['not_available', 'thirty_day', 'ninety_day', 'six_month', 'twelve_month'],
      required: true,
      default: 'not_available',
    },
    performanceBand: { type: String, enum: ['below_expectations', 'meets_expectations', 'exceeds_expectations'] },
    retentionStatus: { type: String, enum: ['unknown', 'retained', 'exited'] },
    recordedAt: { type: Date },
  },
  { _id: false }
);

const employerHiringOutcomeSchema = new Schema<IEmployerHiringOutcome>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    outcomeVersion: { type: String, required: true },
    hiringOutcome: { type: String, enum: ['hired', 'rejected', 'withdrawn', 'no_decision'], required: true, default: 'no_decision' },
    decisionAt: { type: Date },
    employmentOutcome: { type: employmentOutcomeSchema },
    source: { type: String, enum: ['manual', 'pipeline'], required: true, default: 'pipeline' },
    notes: { type: String, trim: true, maxlength: [2000, 'notes cannot exceed 2000 characters'] },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
    updatedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_outcomes',
  }
);

employerHiringOutcomeSchema.index({ organizationId: 1, applicationId: 1 }, { unique: true });
employerHiringOutcomeSchema.index({ organizationId: 1, candidateId: 1 });

export default mongoose.model<IEmployerHiringOutcome>('EmployerHiringOutcome', employerHiringOutcomeSchema);
