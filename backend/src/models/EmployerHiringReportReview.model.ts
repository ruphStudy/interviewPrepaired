import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A recruiter's own review acknowledgement of one immutable 22C hiring
 * report (22D) — informational only. Deliberately has NO hire/reject
 * verdict field; `reviewNotes` is free-text but the schema itself never
 * models a decision. Pins the exact `reportId`/`interviewId` it was
 * created against — a later session's new report never silently inherits
 * old reviews. One row per {organizationId, reportId, reviewerMembershipId}
 * — a reviewer may only ever upsert their OWN review.
 */
export type EmployerHiringReportReviewStatus = 'pending' | 'reviewed';

export interface IEmployerHiringReportReview extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  reportId: Types.ObjectId;
  reviewerMembershipId: Types.ObjectId;
  status: EmployerHiringReportReviewStatus;
  reviewNotes?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const employerHiringReportReviewSchema = new Schema<IEmployerHiringReportReview>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    reportId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentReport', required: true },
    reviewerMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
    status: {
      type: String,
      enum: { values: ['pending', 'reviewed'], message: '{VALUE} is not a valid review status' },
      required: true,
      default: 'pending',
    },
    reviewNotes: { type: String, trim: true, maxlength: [2000, 'reviewNotes cannot exceed 2000 characters'] },
    reviewedAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_report_reviews',
  }
);

// One review per reviewer per report, ever — also the upsert target.
employerHiringReportReviewSchema.index({ organizationId: 1, reportId: 1, reviewerMembershipId: 1 }, { unique: true });
employerHiringReportReviewSchema.index({ organizationId: 1, reportId: 1, updatedAt: -1 });

export default mongoose.model<IEmployerHiringReportReview>('EmployerHiringReportReview', employerHiringReportReviewSchema);
