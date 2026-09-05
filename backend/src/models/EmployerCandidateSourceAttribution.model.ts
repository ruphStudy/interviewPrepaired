import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerCandidateSource } from '../constants/employerCandidate';
import {
  SOURCE_ATTRIBUTION_STRING_MAX_LENGTH,
  SOURCE_ATTRIBUTION_EXTERNAL_REFERENCE_MAX_LENGTH,
  SOURCE_ATTRIBUTION_URL_MAX_LENGTH,
  SOURCE_ATTRIBUTION_NOTES_MAX_LENGTH,
} from '../constants/employerCandidateSourceAttribution';

/**
 * One historical piece of provenance evidence for a candidate (18E) — e.g.
 * "referred by X", "sourced via agency Y", "imported from job portal Z".
 * Append-only: a candidate may accumulate many of these over time, and none
 * of them is ever edited or deleted (no update/delete endpoint exists for
 * this model). This is deliberately separate from
 * `EmployerCandidate.source`, which remains the candidate's single current
 * PRIMARY source — creating an attribution record never changes it, and
 * changing it never rewrites attribution history. Also separate from
 * `EmployerJobApplication.source`, which describes how a candidate entered
 * ONE specific job application, not the company's talent pool as a whole.
 */
export interface IEmployerCandidateSourceAttribution extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  source: EmployerCandidateSource;
  sourceName?: string;
  externalReferenceId?: string;
  referrerName?: string;
  referrerEmail?: string;
  agencyName?: string;
  jobPortalName?: string;
  campaignName?: string;
  sourceUrl?: string;
  notes?: string;
  recordedByMembershipId: Types.ObjectId;
  createdAt: Date;
}

const employerCandidateSourceAttributionSchema = new Schema<IEmployerCandidateSourceAttribution>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'EmployerCandidate',
      required: true,
    },
    source: {
      type: String,
      enum: { values: Object.values(EmployerCandidateSource), message: '{VALUE} is not a valid candidate source' },
      required: true,
    },
    sourceName: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_STRING_MAX_LENGTH, 'sourceName is too long'] },
    externalReferenceId: {
      type: String,
      trim: true,
      maxlength: [SOURCE_ATTRIBUTION_EXTERNAL_REFERENCE_MAX_LENGTH, 'externalReferenceId is too long'],
    },
    referrerName: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_STRING_MAX_LENGTH, 'referrerName is too long'] },
    referrerEmail: { type: String, trim: true, lowercase: true, maxlength: [254, 'referrerEmail is too long'] },
    agencyName: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_STRING_MAX_LENGTH, 'agencyName is too long'] },
    jobPortalName: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_STRING_MAX_LENGTH, 'jobPortalName is too long'] },
    campaignName: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_STRING_MAX_LENGTH, 'campaignName is too long'] },
    sourceUrl: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_URL_MAX_LENGTH, 'sourceUrl is too long'] },
    notes: { type: String, trim: true, maxlength: [SOURCE_ATTRIBUTION_NOTES_MAX_LENGTH, 'notes is too long'] },
    recordedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    // No updatedAt — attribution records are immutable/append-only; there is
    // no update or delete endpoint for this model at all.
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'employer_candidate_source_attributions',
  }
);

employerCandidateSourceAttributionSchema.index({ organizationId: 1, candidateId: 1, createdAt: -1 });
employerCandidateSourceAttributionSchema.index({ organizationId: 1, source: 1, createdAt: -1 });
// Non-unique and sparse — only indexes the (typically minority of) rows that
// actually carry an externalReferenceId, e.g. an ATS/job-portal record id.
employerCandidateSourceAttributionSchema.index({ organizationId: 1, externalReferenceId: 1 }, { sparse: true });

export default mongoose.model<IEmployerCandidateSourceAttribution>(
  'EmployerCandidateSourceAttribution',
  employerCandidateSourceAttributionSchema
);
