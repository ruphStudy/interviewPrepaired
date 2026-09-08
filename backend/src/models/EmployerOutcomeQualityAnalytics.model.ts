import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) organization-level, POST-HOC analytics over hiring
 * outcomes (32C) and assessment evidence coverage (32A/32B and the
 * completed hiring assessment artifacts they aggregate). Historical/
 * aggregate data-quality reporting only — never a candidate ranking, never
 * a hiring prediction, never a claim that any assessment type causes an
 * outcome.
 */
export interface IOutcomeQualityHiringOutcomes {
  totalRecorded: number;
  hired: number;
  rejected: number;
  withdrawn: number;
  noDecision: number;
}

export interface IOutcomeQualityEmploymentOutcomes {
  joined: number;
  didNotJoin: number;
  employed: number;
  left: number;
  unknown: number;
}

export interface IOutcomeQualityRetention {
  retained: number;
  exited: number;
  unknown: number;
}

export interface IOutcomeQualityPerformance {
  belowExpectations: number;
  meetsExpectations: number;
  exceedsExpectations: number;
  notRecorded: number;
}

export interface IOutcomeQualityAssessmentCoverage {
  applicationsWithInterviewReport: number;
  applicationsWithScenarioReport: number;
  applicationsWithCodingReport: number;
  applicationsWithKnowledgeEvaluation: number;
  applicationsWithAnyAssessmentEvidence: number;
}

export type OutcomeQualityHiringOutcomeValue = 'hired' | 'rejected' | 'withdrawn' | 'no_decision';

export interface IOutcomeEvidenceMatrixEntry {
  hiringOutcome: OutcomeQualityHiringOutcomeValue;
  applicationCount: number;
  withStandardInterview: number;
  withScenario: number;
  withCoding: number;
  withKnowledgeGrounding: number;
}

export interface IOutcomeQualityEvidenceQuality {
  totalCandidates: number;
  candidatesWithUnifiedProfile: number;
  candidatesWithCrossAssessmentIntelligence: number;
  multiSourceCandidates: number;
  singleSourceCandidates: number;
  noAssessmentEvidenceCandidates: number;
}

export interface IOutcomeQualityReviewWindows {
  thirtyDay: number;
  ninetyDay: number;
  sixMonth: number;
  twelveMonth: number;
  notAvailable: number;
}

export interface IOutcomeQualityDataQuality {
  outcomeCoveragePercent: number;
  employmentOutcomeCoveragePercent: number;
  assessmentEvidenceCoveragePercent: number;
}

export interface IEmployerOutcomeQualityAnalytics extends Document {
  organizationId: Types.ObjectId;
  analyticsVersion: string;
  generatedAt: Date;
  hiringOutcomes: IOutcomeQualityHiringOutcomes;
  employmentOutcomes: IOutcomeQualityEmploymentOutcomes;
  retention: IOutcomeQualityRetention;
  performance: IOutcomeQualityPerformance;
  assessmentCoverage: IOutcomeQualityAssessmentCoverage;
  outcomeEvidenceMatrix: IOutcomeEvidenceMatrixEntry[];
  evidenceQuality: IOutcomeQualityEvidenceQuality;
  reviewWindows: IOutcomeQualityReviewWindows;
  dataQuality: IOutcomeQualityDataQuality;
  createdAt: Date;
  updatedAt: Date;
}

const hiringOutcomesSchema = new Schema<IOutcomeQualityHiringOutcomes>(
  {
    totalRecorded: { type: Number, required: true, min: 0, default: 0 },
    hired: { type: Number, required: true, min: 0, default: 0 },
    rejected: { type: Number, required: true, min: 0, default: 0 },
    withdrawn: { type: Number, required: true, min: 0, default: 0 },
    noDecision: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const employmentOutcomesSchema = new Schema<IOutcomeQualityEmploymentOutcomes>(
  {
    joined: { type: Number, required: true, min: 0, default: 0 },
    didNotJoin: { type: Number, required: true, min: 0, default: 0 },
    employed: { type: Number, required: true, min: 0, default: 0 },
    left: { type: Number, required: true, min: 0, default: 0 },
    unknown: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const retentionSchema = new Schema<IOutcomeQualityRetention>(
  {
    retained: { type: Number, required: true, min: 0, default: 0 },
    exited: { type: Number, required: true, min: 0, default: 0 },
    unknown: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const performanceSchema = new Schema<IOutcomeQualityPerformance>(
  {
    belowExpectations: { type: Number, required: true, min: 0, default: 0 },
    meetsExpectations: { type: Number, required: true, min: 0, default: 0 },
    exceedsExpectations: { type: Number, required: true, min: 0, default: 0 },
    notRecorded: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const assessmentCoverageSchema = new Schema<IOutcomeQualityAssessmentCoverage>(
  {
    applicationsWithInterviewReport: { type: Number, required: true, min: 0, default: 0 },
    applicationsWithScenarioReport: { type: Number, required: true, min: 0, default: 0 },
    applicationsWithCodingReport: { type: Number, required: true, min: 0, default: 0 },
    applicationsWithKnowledgeEvaluation: { type: Number, required: true, min: 0, default: 0 },
    applicationsWithAnyAssessmentEvidence: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const outcomeEvidenceMatrixEntrySchema = new Schema<IOutcomeEvidenceMatrixEntry>(
  {
    hiringOutcome: { type: String, enum: ['hired', 'rejected', 'withdrawn', 'no_decision'], required: true },
    applicationCount: { type: Number, required: true, min: 0 },
    withStandardInterview: { type: Number, required: true, min: 0 },
    withScenario: { type: Number, required: true, min: 0 },
    withCoding: { type: Number, required: true, min: 0 },
    withKnowledgeGrounding: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const evidenceQualitySchema = new Schema<IOutcomeQualityEvidenceQuality>(
  {
    totalCandidates: { type: Number, required: true, min: 0, default: 0 },
    candidatesWithUnifiedProfile: { type: Number, required: true, min: 0, default: 0 },
    candidatesWithCrossAssessmentIntelligence: { type: Number, required: true, min: 0, default: 0 },
    multiSourceCandidates: { type: Number, required: true, min: 0, default: 0 },
    singleSourceCandidates: { type: Number, required: true, min: 0, default: 0 },
    noAssessmentEvidenceCandidates: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const reviewWindowsSchema = new Schema<IOutcomeQualityReviewWindows>(
  {
    thirtyDay: { type: Number, required: true, min: 0, default: 0 },
    ninetyDay: { type: Number, required: true, min: 0, default: 0 },
    sixMonth: { type: Number, required: true, min: 0, default: 0 },
    twelveMonth: { type: Number, required: true, min: 0, default: 0 },
    notAvailable: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const dataQualitySchema = new Schema<IOutcomeQualityDataQuality>(
  {
    outcomeCoveragePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    employmentOutcomeCoveragePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
    assessmentEvidenceCoveragePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const employerOutcomeQualityAnalyticsSchema = new Schema<IEmployerOutcomeQualityAnalytics>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    analyticsVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    hiringOutcomes: { type: hiringOutcomesSchema, required: true },
    employmentOutcomes: { type: employmentOutcomesSchema, required: true },
    retention: { type: retentionSchema, required: true },
    performance: { type: performanceSchema, required: true },
    assessmentCoverage: { type: assessmentCoverageSchema, required: true },
    outcomeEvidenceMatrix: { type: [outcomeEvidenceMatrixEntrySchema], default: [] },
    evidenceQuality: { type: evidenceQualitySchema, required: true },
    reviewWindows: { type: reviewWindowsSchema, required: true },
    dataQuality: { type: dataQualitySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_outcome_quality_analytics',
  }
);

employerOutcomeQualityAnalyticsSchema.index({ organizationId: 1 }, { unique: true });

export default mongoose.model<IEmployerOutcomeQualityAnalytics>('EmployerOutcomeQualityAnalytics', employerOutcomeQualityAnalyticsSchema);
