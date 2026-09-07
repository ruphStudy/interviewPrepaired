import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Per-interview, OPT-IN proctoring configuration (31A) — records
 * observable browser/session EVENTS only. Explicitly NEVER: webcam/screen/
 * audio capture, biometric/face/gaze analysis, keystroke profiling,
 * clipboard content capture, browser history, IP reputation, or device
 * fingerprinting. Disabled by default.
 */
export type EmployerAssessmentProctoringEnforcement = 'informational' | 'warn_candidate';

export interface IEmployerAssessmentProctoringCapture {
  tabVisibility: boolean;
  windowBlur: boolean;
  fullscreenExit: boolean;
  copyPaste: boolean;
  navigationAttempt: boolean;
}

export interface IEmployerAssessmentProctoringConfig extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  enabled: boolean;
  capture: IEmployerAssessmentProctoringCapture;
  enforcement: EmployerAssessmentProctoringEnforcement;
  configVersion: string;
  createdByMembershipId: Types.ObjectId;
  updatedByMembershipId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const captureSchema = new Schema<IEmployerAssessmentProctoringCapture>(
  {
    tabVisibility: { type: Boolean, required: true, default: true },
    windowBlur: { type: Boolean, required: true, default: true },
    fullscreenExit: { type: Boolean, required: true, default: true },
    copyPaste: { type: Boolean, required: true, default: true },
    navigationAttempt: { type: Boolean, required: true, default: true },
  },
  { _id: false }
);

const employerAssessmentProctoringConfigSchema = new Schema<IEmployerAssessmentProctoringConfig>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    enabled: { type: Boolean, required: true, default: false },
    capture: { type: captureSchema, required: true, default: () => ({}) },
    enforcement: {
      type: String,
      enum: { values: ['informational', 'warn_candidate'], message: '{VALUE} is not a valid enforcement mode' },
      required: true,
      default: 'informational',
    },
    configVersion: { type: String, required: true },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    updatedByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember' },
  },
  {
    timestamps: true,
    collection: 'employer_assessment_proctoring_configs',
  }
);

employerAssessmentProctoringConfigSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerAssessmentProctoringConfig>(
  'EmployerAssessmentProctoringConfig',
  employerAssessmentProctoringConfigSchema
);
