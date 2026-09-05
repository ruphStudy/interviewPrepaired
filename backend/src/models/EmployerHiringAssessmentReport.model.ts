import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * One immutable, employer-only narrative report (22C) explaining a hiring
 * Interview's evidence — built from its exact 21E assessment result, 22A
 * evidence matrix, and (when required) 22B follow-up plan. Never a
 * candidate-facing document, never a hire/reject recommendation. Critical
 * numeric fields (overallScore/averageRubricScore/competencyCoveragePercent)
 * and every competency name/score/status are pinned from server data, not
 * AI output — AI only supplies narrative text around those trusted facts.
 * Uniqueness is keyed on {organizationId, interviewId, assessmentResultId}
 * — a later session/result always gets its own separate report row. No
 * update/delete endpoint exists for this model at all.
 */
export type HiringReportStatus = 'processing' | 'completed' | 'failed';

export interface IReportCompetencySummary {
  competencyName: string;
  importance: string;
  score: number;
  evidenceStatus: string;
  summary: string;
}

export interface IHiringAssessmentReport {
  executiveSummary: string;
  overallScore: number;
  averageRubricScore: number;
  competencyCoveragePercent: number;
  competencySummary: IReportCompetencySummary[];
  demonstratedStrengths: string[];
  evidenceGaps: string[];
  followUpPriorities: string[];
  interviewerNotes: string[];
  generationVersion: string;
}

export interface IEmployerHiringAssessmentReport extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  candidateId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  assessmentResultId: Types.ObjectId;
  evidenceMatrixId: Types.ObjectId;
  followUpPlanId?: Types.ObjectId;
  status: HiringReportStatus;
  report?: IHiringAssessmentReport;
  /** Short, safe, user-facing message only — never a raw provider error dump. */
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

const competencySummarySchema = new Schema<IReportCompetencySummary>(
  {
    competencyName: { type: String, required: true },
    importance: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    evidenceStatus: { type: String, required: true },
    summary: { type: String, default: '' },
  },
  { _id: false }
);

const reportSchema = new Schema<IHiringAssessmentReport>(
  {
    executiveSummary: { type: String, required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    averageRubricScore: { type: Number, required: true, min: 1, max: 5 },
    competencyCoveragePercent: { type: Number, required: true, min: 0, max: 100 },
    competencySummary: { type: [competencySummarySchema], default: [] },
    demonstratedStrengths: { type: [String], default: [] },
    evidenceGaps: { type: [String], default: [] },
    followUpPriorities: { type: [String], default: [] },
    interviewerNotes: { type: [String], default: [] },
    generationVersion: { type: String, required: true },
  },
  { _id: false }
);

const employerHiringAssessmentReportSchema = new Schema<IEmployerHiringAssessmentReport>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    assessmentResultId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringAssessmentResult', required: true },
    evidenceMatrixId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringEvidenceMatrix', required: true },
    followUpPlanId: { type: Schema.Types.ObjectId, ref: 'EmployerHiringFollowUpPlan' },
    status: {
      type: String,
      enum: { values: ['processing', 'completed', 'failed'], message: '{VALUE} is not a valid report status' },
      required: true,
    },
    report: { type: reportSchema },
    errorMessage: { type: String, trim: true, maxlength: [500, 'errorMessage cannot exceed 500 characters'] },
  },
  {
    timestamps: true,
    collection: 'employer_hiring_assessment_reports',
  }
);

// Exactly one report per {interview, assessment result} combination, ever.
// This unique index doubles as the concurrency claim: the first create()
// for a given combination wins; every concurrent duplicate throws E11000,
// which EmployerHiringAssessmentReportService uses to detect an
// in-flight/existing report rather than starting a second AI call.
employerHiringAssessmentReportSchema.index({ organizationId: 1, interviewId: 1, assessmentResultId: 1 }, { unique: true });
employerHiringAssessmentReportSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerHiringAssessmentReport>(
  'EmployerHiringAssessmentReport',
  employerHiringAssessmentReportSchema
);
