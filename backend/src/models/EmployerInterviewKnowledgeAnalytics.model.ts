import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) analytics summarizing 29E knowledge-grounded
 * evaluation coverage/alignment for ONE interview — built purely from the
 * 29D config, current `Interview.questions`, and completed 29E evaluations.
 * Never a hiring outcome/recommendation, never a candidate comparison,
 * never a numeric knowledge score. "Knowledge Alignment", not "Truth Score".
 */
export interface IEmployerInterviewKnowledgeAnalyticsConfiguration {
  enabled: boolean;
  selectedKnowledgeBaseCount: number;
}

export interface IEmployerInterviewKnowledgeAnalyticsRetrieval {
  evaluatedQuestionCount: number;
  groundedQuestionCount: number;
  noKnowledgeQuestionCount: number;
  uniqueKnowledgeBaseCount: number;
  uniqueDocumentCount: number;
  uniqueChunkCount: number;
}

export interface IEmployerInterviewKnowledgeAnalyticsAlignment {
  alignedCount: number;
  partiallyAlignedCount: number;
  conflictingCount: number;
  insufficientEvidenceCount: number;
  notApplicableCount: number;
}

export interface IEmployerInterviewKnowledgeAnalyticsClaims {
  totalClaimCount: number;
  supportedCount: number;
  partiallySupportedCount: number;
  conflictingCount: number;
  notSupportedCount: number;
  unverifiableCount: number;
}

export interface IEmployerInterviewKnowledgeAnalyticsSignals {
  demonstratesKnowledgeCount: number;
  usesRelevantTerminologyCount: number;
  respectsKnownConstraintsCount: number;
}

export interface IEmployerInterviewKnowledgeAnalyticsCoverage {
  answeredQuestionCount: number;
  knowledgeEvaluatedQuestionCount: number;
  coveragePercent: number;
}

export interface IEmployerInterviewKnowledgeAnalytics extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  analyticsVersion: string;
  generatedAt: Date;
  configuration: IEmployerInterviewKnowledgeAnalyticsConfiguration;
  retrieval: IEmployerInterviewKnowledgeAnalyticsRetrieval;
  alignment: IEmployerInterviewKnowledgeAnalyticsAlignment;
  claims: IEmployerInterviewKnowledgeAnalyticsClaims;
  knowledgeSignals: IEmployerInterviewKnowledgeAnalyticsSignals;
  coverage: IEmployerInterviewKnowledgeAnalyticsCoverage;
  createdAt: Date;
  updatedAt: Date;
}

const configurationSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsConfiguration>(
  {
    enabled: { type: Boolean, required: true, default: false },
    selectedKnowledgeBaseCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const retrievalSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsRetrieval>(
  {
    evaluatedQuestionCount: { type: Number, required: true, min: 0, default: 0 },
    groundedQuestionCount: { type: Number, required: true, min: 0, default: 0 },
    noKnowledgeQuestionCount: { type: Number, required: true, min: 0, default: 0 },
    uniqueKnowledgeBaseCount: { type: Number, required: true, min: 0, default: 0 },
    uniqueDocumentCount: { type: Number, required: true, min: 0, default: 0 },
    uniqueChunkCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const alignmentSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsAlignment>(
  {
    alignedCount: { type: Number, required: true, min: 0, default: 0 },
    partiallyAlignedCount: { type: Number, required: true, min: 0, default: 0 },
    conflictingCount: { type: Number, required: true, min: 0, default: 0 },
    insufficientEvidenceCount: { type: Number, required: true, min: 0, default: 0 },
    notApplicableCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const claimsSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsClaims>(
  {
    totalClaimCount: { type: Number, required: true, min: 0, default: 0 },
    supportedCount: { type: Number, required: true, min: 0, default: 0 },
    partiallySupportedCount: { type: Number, required: true, min: 0, default: 0 },
    conflictingCount: { type: Number, required: true, min: 0, default: 0 },
    notSupportedCount: { type: Number, required: true, min: 0, default: 0 },
    unverifiableCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const signalsSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsSignals>(
  {
    demonstratesKnowledgeCount: { type: Number, required: true, min: 0, default: 0 },
    usesRelevantTerminologyCount: { type: Number, required: true, min: 0, default: 0 },
    respectsKnownConstraintsCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const coverageSchema = new Schema<IEmployerInterviewKnowledgeAnalyticsCoverage>(
  {
    answeredQuestionCount: { type: Number, required: true, min: 0, default: 0 },
    knowledgeEvaluatedQuestionCount: { type: Number, required: true, min: 0, default: 0 },
    coveragePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
  },
  { _id: false }
);

const employerInterviewKnowledgeAnalyticsSchema = new Schema<IEmployerInterviewKnowledgeAnalytics>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    analyticsVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    configuration: { type: configurationSchema, required: true },
    retrieval: { type: retrievalSchema, required: true },
    alignment: { type: alignmentSchema, required: true },
    claims: { type: claimsSchema, required: true },
    knowledgeSignals: { type: signalsSchema, required: true },
    coverage: { type: coverageSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_knowledge_analytics',
  }
);

employerInterviewKnowledgeAnalyticsSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewKnowledgeAnalytics>(
  'EmployerInterviewKnowledgeAnalytics',
  employerInterviewKnowledgeAnalyticsSchema
);
