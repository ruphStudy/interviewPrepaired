import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) aggregate report over ONE completed 28D scenario
 * session's completed 28C response evaluations (28E) — built ONLY from the
 * 28A scenario definition, 28B question plan, 28D session responses/
 * timestamps, and completed 28C evaluations. Never a hiring
 * recommendation, candidate ranking, personality assessment, or numeric
 * competency/performance score — evidence aggregation and coverage only.
 * Mutable, upserted in place on every rebuild (same convention as 27A/27C/
 * 28A) — no historical duplicate rows.
 */
export type EmployerScenarioEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';
export type EmployerScenarioAssessmentLevel = 'strong' | 'sufficient' | 'limited' | 'insufficient';

export interface IScenarioReportSnapshot {
  title: string;
  category: string;
  difficulty: string;
  targetCompetencies: string[];
}

export interface IScenarioReportExecution {
  totalSteps: number;
  answeredSteps: number;
  evaluatedSteps: number;
  durationSeconds?: number;
  completed: boolean;
}

export interface IScenarioReportEvidenceStateCounts {
  strong: number;
  sufficient: number;
  partial: number;
  insufficient: number;
  notObserved: number;
}

export interface IScenarioReportCompetencyEvidence {
  competencyName: string;
  evaluatedStepCount: number;
  states: IScenarioReportEvidenceStateCounts;
  overallEvidenceState: EmployerScenarioEvidenceState;
  evidence: string[];
  missingEvidence: string[];
}

export interface IScenarioReportAssessmentLevelCounts {
  strong: number;
  sufficient: number;
  limited: number;
  insufficient: number;
}

export interface IScenarioReportResponseSignals {
  relevance: IScenarioReportAssessmentLevelCounts;
  reasoningQuality: IScenarioReportAssessmentLevelCounts;
  decisionClarity: IScenarioReportAssessmentLevelCounts;
  constraintAwareness: IScenarioReportAssessmentLevelCounts;
}

export interface IScenarioReportFollowUp {
  usefulCount: number;
  notUsefulCount: number;
  reasons: string[];
}

export interface IScenarioReportCoverage {
  targetCompetencyCount: number;
  observedCompetencyCount: number;
  missingCompetencyCount: number;
  coveragePercent: number;
}

export interface IScenarioReportSummary {
  strengths: string[];
  evidenceGaps: string[];
}

export interface IEmployerInterviewScenarioReport extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  scenarioId: Types.ObjectId;
  sessionId: Types.ObjectId;
  questionSetId: Types.ObjectId;
  reportVersion: string;
  generatedAt: Date;
  scenarioSnapshot: IScenarioReportSnapshot;
  execution: IScenarioReportExecution;
  competencyEvidence: IScenarioReportCompetencyEvidence[];
  responseSignals: IScenarioReportResponseSignals;
  followUp: IScenarioReportFollowUp;
  coverage: IScenarioReportCoverage;
  summary: IScenarioReportSummary;
  createdAt: Date;
  updatedAt: Date;
}

const scenarioSnapshotSchema = new Schema<IScenarioReportSnapshot>(
  {
    title: { type: String, required: true },
    category: { type: String, required: true },
    difficulty: { type: String, required: true },
    targetCompetencies: { type: [String], default: [] },
  },
  { _id: false }
);

const executionSchema = new Schema<IScenarioReportExecution>(
  {
    totalSteps: { type: Number, required: true, min: 0 },
    answeredSteps: { type: Number, required: true, min: 0 },
    evaluatedSteps: { type: Number, required: true, min: 0 },
    durationSeconds: { type: Number, min: 0 },
    completed: { type: Boolean, required: true },
  },
  { _id: false }
);

const evidenceStateCountsSchema = new Schema<IScenarioReportEvidenceStateCounts>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    sufficient: { type: Number, required: true, min: 0, default: 0 },
    partial: { type: Number, required: true, min: 0, default: 0 },
    insufficient: { type: Number, required: true, min: 0, default: 0 },
    notObserved: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const competencyEvidenceSchema = new Schema<IScenarioReportCompetencyEvidence>(
  {
    competencyName: { type: String, required: true },
    evaluatedStepCount: { type: Number, required: true, min: 0 },
    states: { type: evidenceStateCountsSchema, required: true },
    overallEvidenceState: {
      type: String,
      enum: {
        values: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'],
        message: '{VALUE} is not a valid evidence state',
      },
      required: true,
    },
    evidence: { type: [String], default: [] },
    missingEvidence: { type: [String], default: [] },
  },
  { _id: false }
);

const assessmentLevelCountsSchema = new Schema<IScenarioReportAssessmentLevelCounts>(
  {
    strong: { type: Number, required: true, min: 0, default: 0 },
    sufficient: { type: Number, required: true, min: 0, default: 0 },
    limited: { type: Number, required: true, min: 0, default: 0 },
    insufficient: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const responseSignalsSchema = new Schema<IScenarioReportResponseSignals>(
  {
    relevance: { type: assessmentLevelCountsSchema, required: true },
    reasoningQuality: { type: assessmentLevelCountsSchema, required: true },
    decisionClarity: { type: assessmentLevelCountsSchema, required: true },
    constraintAwareness: { type: assessmentLevelCountsSchema, required: true },
  },
  { _id: false }
);

const followUpSchema = new Schema<IScenarioReportFollowUp>(
  {
    usefulCount: { type: Number, required: true, min: 0 },
    notUsefulCount: { type: Number, required: true, min: 0 },
    reasons: { type: [String], default: [] },
  },
  { _id: false }
);

const coverageSchema = new Schema<IScenarioReportCoverage>(
  {
    targetCompetencyCount: { type: Number, required: true, min: 0 },
    observedCompetencyCount: { type: Number, required: true, min: 0 },
    missingCompetencyCount: { type: Number, required: true, min: 0 },
    coveragePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const summarySchema = new Schema<IScenarioReportSummary>(
  {
    strengths: { type: [String], default: [] },
    evidenceGaps: { type: [String], default: [] },
  },
  { _id: false }
);

const employerInterviewScenarioReportSchema = new Schema<IEmployerInterviewScenarioReport>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    scenarioId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenario', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenarioSession', required: true },
    questionSetId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewScenarioQuestionSet', required: true },
    reportVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    scenarioSnapshot: { type: scenarioSnapshotSchema, required: true },
    execution: { type: executionSchema, required: true },
    competencyEvidence: { type: [competencyEvidenceSchema], default: [] },
    responseSignals: { type: responseSignalsSchema, required: true },
    followUp: { type: followUpSchema, required: true },
    coverage: { type: coverageSchema, required: true },
    summary: { type: summarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_scenario_reports',
  }
);

// Exactly one report per {organization, interview, scenario}, ever —
// replaced/reconciled in place on every rebuild.
employerInterviewScenarioReportSchema.index({ organizationId: 1, interviewId: 1, scenarioId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewScenarioReport>('EmployerInterviewScenarioReport', employerInterviewScenarioReportSchema);
