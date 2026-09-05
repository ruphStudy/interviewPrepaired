import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateShortlistDecisionValue } from '../constants/employerCandidateShortlist';

/**
 * An immutable audit record of ONE explicit recruiter decision to
 * shortlist a candidate for a job (19E). Records WHICH screening/score
 * supported the decision — never a copy of the full screening/gap/resume/
 * JD content itself. The actual application lifecycle transition
 * (screening -> shortlisted) is performed by the EXISTING 18D
 * `EmployerJobApplicationService.updateApplicationStatus` — this row is
 * purely a historical record alongside that transition, never a second
 * independent status. No update/delete endpoint exists for this model at
 * all; once shortlisted, this record remains historical even if the JD or
 * resume later changes and produces a newer screening/score.
 */
export interface IEmployerCandidateShortlistDecision extends Document {
  organizationId: Types.ObjectId;
  jobId: Types.ObjectId;
  applicationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  screeningId: Types.ObjectId;
  screeningScoreId: Types.ObjectId;
  explainableScore: number;
  decision: EmployerCandidateShortlistDecisionValue;
  decidedByMembershipId: Types.ObjectId;
  decidedAt: Date;
  createdAt: Date;
}

const employerCandidateShortlistDecisionSchema = new Schema<IEmployerCandidateShortlistDecision>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJob',
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerJobApplication',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    screeningId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreening',
      required: true,
    },
    screeningScoreId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidateScreeningScore',
      required: true,
    },
    explainableScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    decision: {
      type: String,
      enum: { values: Object.values(EmployerCandidateShortlistDecisionValue), message: '{VALUE} is not a valid shortlist decision' },
      required: true,
    },
    decidedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    decidedAt: {
      type: Date,
      required: true,
    },
  },
  {
    // No updatedAt — this record is immutable/append-only; there is no
    // update or delete endpoint for this model at all.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_shortlist_decisions',
  }
);

// Exactly one shortlist decision per {applicationId, screeningId} — this
// same unique index doubles as the concurrency claim AND as the mechanism
// that prevents a duplicate decision from ever being recorded for the same
// screening. A NEW screening (from a later JD snapshot or resume analysis)
// is a different combination and may get its own decision row; a
// historical decision is never overwritten.
employerCandidateShortlistDecisionSchema.index({ organizationId: 1, applicationId: 1, screeningId: 1 }, { unique: true });
employerCandidateShortlistDecisionSchema.index({ organizationId: 1, jobId: 1, createdAt: -1 });

export default mongoose.model<IEmployerCandidateShortlistDecision>(
  'EmployerCandidateShortlistDecision',
  employerCandidateShortlistDecisionSchema
);
