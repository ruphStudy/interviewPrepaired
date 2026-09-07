import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) cross-assessment PATTERN derivation for ONE
 * candidate (32B) — built purely from that SAME candidate's own completed
 * assessment artifacts within THIS exact organization (the same sources
 * 32A aggregates). Never compares against other candidates, never a
 * hire/reject recommendation, never a numeric score.
 */
export type TalentConsistencyLevel = 'consistent_strong' | 'consistent_sufficient' | 'mixed' | 'consistent_gap' | 'insufficient_data';
export type TalentEvidenceStateValue = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';

export interface ICompetencySourceState {
  sourceType: string;
  state: TalentEvidenceStateValue;
}

export interface ICompetencyConsistency {
  competencyName: string;
  sourceCount: number;
  sourceStates: ICompetencySourceState[];
  consistency: TalentConsistencyLevel;
}

export interface ICrossAssessmentSignals {
  repeatedStrengths: string[];
  repeatedEvidenceGaps: string[];
  mixedEvidence: string[];
}

export interface ISourceCoverage {
  standardInterview: boolean;
  scenario: boolean;
  coding: boolean;
  knowledgeGrounding: boolean;
  totalSourceTypes: number;
}

export interface IEvidenceBreadth {
  skillCount: number;
  competencyCount: number;
  multiSourceCompetencyCount: number;
}

export interface IEmployerCrossAssessmentTalentIntelligence extends Document {
  organizationId: Types.ObjectId;
  candidateId: Types.ObjectId;
  intelligenceVersion: string;
  generatedAt: Date;
  competencyConsistency: ICompetencyConsistency[];
  crossAssessmentSignals: ICrossAssessmentSignals;
  sourceCoverage: ISourceCoverage;
  evidenceBreadth: IEvidenceBreadth;
  createdAt: Date;
  updatedAt: Date;
}

const sourceStateSchema = new Schema<ICompetencySourceState>(
  {
    sourceType: { type: String, required: true },
    state: { type: String, enum: ['strong', 'sufficient', 'partial', 'insufficient', 'not_observed'], required: true },
  },
  { _id: false }
);

const competencyConsistencySchema = new Schema<ICompetencyConsistency>(
  {
    competencyName: { type: String, required: true, trim: true, maxlength: [200, 'competencyName cannot exceed 200 characters'] },
    sourceCount: { type: Number, required: true, min: 0 },
    sourceStates: { type: [sourceStateSchema], default: [] },
    consistency: {
      type: String,
      enum: ['consistent_strong', 'consistent_sufficient', 'mixed', 'consistent_gap', 'insufficient_data'],
      required: true,
    },
  },
  { _id: false }
);

const crossAssessmentSignalsSchema = new Schema<ICrossAssessmentSignals>(
  {
    repeatedStrengths: { type: [String], default: [] },
    repeatedEvidenceGaps: { type: [String], default: [] },
    mixedEvidence: { type: [String], default: [] },
  },
  { _id: false }
);

const sourceCoverageSchema = new Schema<ISourceCoverage>(
  {
    standardInterview: { type: Boolean, required: true, default: false },
    scenario: { type: Boolean, required: true, default: false },
    coding: { type: Boolean, required: true, default: false },
    knowledgeGrounding: { type: Boolean, required: true, default: false },
    totalSourceTypes: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const evidenceBreadthSchema = new Schema<IEvidenceBreadth>(
  {
    skillCount: { type: Number, required: true, min: 0, default: 0 },
    competencyCount: { type: Number, required: true, min: 0, default: 0 },
    multiSourceCompetencyCount: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const employerCrossAssessmentTalentIntelligenceSchema = new Schema<IEmployerCrossAssessmentTalentIntelligence>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'EmployerCandidate', required: true },
    intelligenceVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    competencyConsistency: { type: [competencyConsistencySchema], default: [] },
    crossAssessmentSignals: { type: crossAssessmentSignalsSchema, required: true },
    sourceCoverage: { type: sourceCoverageSchema, required: true },
    evidenceBreadth: { type: evidenceBreadthSchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_cross_assessment_talent_intelligence',
  }
);

employerCrossAssessmentTalentIntelligenceSchema.index({ organizationId: 1, candidateId: 1 }, { unique: true });

export default mongoose.model<IEmployerCrossAssessmentTalentIntelligence>(
  'EmployerCrossAssessmentTalentIntelligence',
  employerCrossAssessmentTalentIntelligenceSchema
);
