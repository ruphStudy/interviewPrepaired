import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) analytics explaining how the dynamic interview
 * graph was actually TRAVERSED (27E) — built purely from persisted 27A
 * graph / current `Interview.questions` / 27B routes / 27C coverage / 27D
 * adaptive route history. Never a candidate performance score, never a
 * hiring recommendation, never candidate ranking — routing/traversal
 * behavior only. Mutable, upserted in place on every rebuild (same
 * convention as 27A/27C) — no historical duplicate rows.
 */
export interface IGraphAnalyticsGraphSummary {
  competencyCount: number;
  plannedQuestionCount: number;
  dynamicFollowUpCount: number;
  totalCurrentQuestionCount: number;
}

export interface IGraphAnalyticsExecutionSummary {
  answeredQuestionCount: number;
  evaluatedQuestionCount: number;
  unansweredQuestionCount: number;
  adaptiveRouteCount: number;
  completedRouteCount: number;
}

export interface IGraphAnalyticsFollowUpSummary {
  analyzedSourceQuestionCount: number;
  followUpGeneratedCount: number;
  continueDecisionCount: number;
  followUpRatePercent: number;
}

export interface IGraphAnalyticsCoverageSummary {
  available: boolean;
  competencyCount?: number;
  coveredCount?: number;
  partialCount?: number;
  notStartedCount?: number;
  coveragePercent?: number;
}

export interface IGraphAnalyticsAdaptiveRoutingSummary {
  selectionCount: number;
  followUpPrioritySelections: number;
  uncoveredCompetencySelections: number;
  partialCoverageSelections: number;
  difficultyProgressionSelections: number;
  difficultyRecoverySelections: number;
  remainingQuestionSelections: number;
}

export interface IGraphAnalyticsDifficultyTransitions {
  easyToMedium: number;
  mediumToHard: number;
  hardToMedium: number;
  mediumToEasy: number;
  sameDifficulty: number;
  unknown: number;
}

export interface IGraphAnalyticsDifficultySummary {
  selectedEasyCount: number;
  selectedMediumCount: number;
  selectedHardCount: number;
  transitions: IGraphAnalyticsDifficultyTransitions;
}

export interface IEmployerInterviewGraphAnalytics extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  interviewId: Types.ObjectId;
  graphId: Types.ObjectId;
  calculationVersion: string;
  generatedAt: Date;
  graph: IGraphAnalyticsGraphSummary;
  execution: IGraphAnalyticsExecutionSummary;
  followUps: IGraphAnalyticsFollowUpSummary;
  coverage: IGraphAnalyticsCoverageSummary;
  adaptiveRouting: IGraphAnalyticsAdaptiveRoutingSummary;
  difficulty: IGraphAnalyticsDifficultySummary;
  createdAt: Date;
  updatedAt: Date;
}

const graphSummarySchema = new Schema<IGraphAnalyticsGraphSummary>(
  {
    competencyCount: { type: Number, required: true, min: 0 },
    plannedQuestionCount: { type: Number, required: true, min: 0 },
    dynamicFollowUpCount: { type: Number, required: true, min: 0 },
    totalCurrentQuestionCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const executionSummarySchema = new Schema<IGraphAnalyticsExecutionSummary>(
  {
    answeredQuestionCount: { type: Number, required: true, min: 0 },
    evaluatedQuestionCount: { type: Number, required: true, min: 0 },
    unansweredQuestionCount: { type: Number, required: true, min: 0 },
    adaptiveRouteCount: { type: Number, required: true, min: 0 },
    completedRouteCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const followUpSummarySchema = new Schema<IGraphAnalyticsFollowUpSummary>(
  {
    analyzedSourceQuestionCount: { type: Number, required: true, min: 0 },
    followUpGeneratedCount: { type: Number, required: true, min: 0 },
    continueDecisionCount: { type: Number, required: true, min: 0 },
    followUpRatePercent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

const coverageSummarySchema = new Schema<IGraphAnalyticsCoverageSummary>(
  {
    available: { type: Boolean, required: true },
    competencyCount: { type: Number, min: 0 },
    coveredCount: { type: Number, min: 0 },
    partialCount: { type: Number, min: 0 },
    notStartedCount: { type: Number, min: 0 },
    coveragePercent: { type: Number, min: 0, max: 100 },
  },
  { _id: false }
);

const adaptiveRoutingSummarySchema = new Schema<IGraphAnalyticsAdaptiveRoutingSummary>(
  {
    selectionCount: { type: Number, required: true, min: 0 },
    followUpPrioritySelections: { type: Number, required: true, min: 0 },
    uncoveredCompetencySelections: { type: Number, required: true, min: 0 },
    partialCoverageSelections: { type: Number, required: true, min: 0 },
    difficultyProgressionSelections: { type: Number, required: true, min: 0 },
    difficultyRecoverySelections: { type: Number, required: true, min: 0 },
    remainingQuestionSelections: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const difficultyTransitionsSchema = new Schema<IGraphAnalyticsDifficultyTransitions>(
  {
    easyToMedium: { type: Number, required: true, min: 0 },
    mediumToHard: { type: Number, required: true, min: 0 },
    hardToMedium: { type: Number, required: true, min: 0 },
    mediumToEasy: { type: Number, required: true, min: 0 },
    sameDifficulty: { type: Number, required: true, min: 0 },
    unknown: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const difficultySummarySchema = new Schema<IGraphAnalyticsDifficultySummary>(
  {
    selectedEasyCount: { type: Number, required: true, min: 0 },
    selectedMediumCount: { type: Number, required: true, min: 0 },
    selectedHardCount: { type: Number, required: true, min: 0 },
    transitions: { type: difficultyTransitionsSchema, required: true },
  },
  { _id: false }
);

const employerInterviewGraphAnalyticsSchema = new Schema<IEmployerInterviewGraphAnalytics>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    graphId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewGraph', required: true },
    calculationVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    graph: { type: graphSummarySchema, required: true },
    execution: { type: executionSummarySchema, required: true },
    followUps: { type: followUpSummarySchema, required: true },
    coverage: { type: coverageSummarySchema, required: true },
    adaptiveRouting: { type: adaptiveRoutingSummarySchema, required: true },
    difficulty: { type: difficultySummarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_graph_analytics',
  }
);

// Exactly one analytics row per interview, ever — replaced/reconciled in
// place on every rebuild (same upsert-in-place convention as 27A/27C).
employerInterviewGraphAnalyticsSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewGraphAnalytics>('EmployerInterviewGraphAnalytics', employerInterviewGraphAnalyticsSchema);
