import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Deterministic (NO AI) structural graph of ONE hiring-assessment interview
 * (27A) — competencies, materialized questions, and how questions cover
 * competencies. Built ONLY from existing authoritative artifacts: the
 * finalized 20A blueprint, the finalized 20B competency rubric, and 21A
 * materialized `Interview.questions`. Never reads candidate answers,
 * evaluations, reasoning/confidence artifacts, resume, recruiter notes,
 * decisions, or communications. This is STORED STRUCTURE only — it never
 * changes a running interview, never adapts difficulty, never generates
 * dynamic follow-up questions (that is 27B+). Mutable, upserted in place on
 * every rebuild (same convention as 25A/26E) — never appends stale nodes,
 * no historical duplicate rows.
 */
export type EmployerInterviewGraphNodeType = 'competency' | 'question';
export type EmployerInterviewGraphEdgeType = 'competency_to_question' | 'question_to_competency' | 'possible_followup';

export interface IInterviewGraphNodeMetadata {
  difficulty?: string;
  questionType?: string;
  importance?: string;
  weight?: number;
}

export interface IInterviewGraphNode {
  nodeId: string;
  type: EmployerInterviewGraphNodeType;
  competencyName?: string;
  questionIndex?: number;
  label: string;
  metadata?: IInterviewGraphNodeMetadata;
}

export interface IInterviewGraphEdgeMetadata {
  reason?: string;
}

export interface IInterviewGraphEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  type: EmployerInterviewGraphEdgeType;
  metadata?: IInterviewGraphEdgeMetadata;
}

export interface IInterviewGraphSummary {
  competencyNodeCount: number;
  questionNodeCount: number;
  edgeCount: number;
  coveredCompetencyCount: number;
}

export interface IEmployerInterviewGraph extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  graphVersion: string;
  generatedAt: Date;
  nodes: IInterviewGraphNode[];
  edges: IInterviewGraphEdge[];
  summary: IInterviewGraphSummary;
  createdAt: Date;
  updatedAt: Date;
}

const nodeMetadataSchema = new Schema<IInterviewGraphNodeMetadata>(
  {
    difficulty: { type: String },
    questionType: { type: String },
    importance: { type: String },
    weight: { type: Number },
  },
  { _id: false }
);

const nodeSchema = new Schema<IInterviewGraphNode>(
  {
    nodeId: { type: String, required: true },
    type: { type: String, enum: { values: ['competency', 'question'], message: '{VALUE} is not a valid node type' }, required: true },
    competencyName: { type: String },
    questionIndex: { type: Number, min: 0 },
    label: { type: String, required: true },
    metadata: { type: nodeMetadataSchema },
  },
  { _id: false }
);

const edgeMetadataSchema = new Schema<IInterviewGraphEdgeMetadata>(
  {
    reason: { type: String },
  },
  { _id: false }
);

const edgeSchema = new Schema<IInterviewGraphEdge>(
  {
    edgeId: { type: String, required: true },
    fromNodeId: { type: String, required: true },
    toNodeId: { type: String, required: true },
    type: {
      type: String,
      enum: {
        values: ['competency_to_question', 'question_to_competency', 'possible_followup'],
        message: '{VALUE} is not a valid edge type',
      },
      required: true,
    },
    metadata: { type: edgeMetadataSchema },
  },
  { _id: false }
);

const summarySchema = new Schema<IInterviewGraphSummary>(
  {
    competencyNodeCount: { type: Number, required: true, min: 0 },
    questionNodeCount: { type: Number, required: true, min: 0 },
    edgeCount: { type: Number, required: true, min: 0 },
    coveredCompetencyCount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const employerInterviewGraphSchema = new Schema<IEmployerInterviewGraph>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    graphVersion: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    nodes: { type: [nodeSchema], default: [] },
    edges: { type: [edgeSchema], default: [] },
    summary: { type: summarySchema, required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_graphs',
  }
);

// Exactly one graph per interview, ever — replaced/reconciled in place on
// every rebuild (same upsert-in-place convention as 25A/26E); never a
// historical duplicate.
employerInterviewGraphSchema.index({ organizationId: 1, interviewId: 1 }, { unique: true });

export default mongoose.model<IEmployerInterviewGraph>('EmployerInterviewGraph', employerInterviewGraphSchema);
