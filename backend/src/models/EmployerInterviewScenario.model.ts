import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A structured, JOB-RELEVANT workplace scenario DEFINITION for one hiring-
 * assessment interview (28A) — describes a realistic situation, never a
 * personalized candidate trap. Built from the finalized 20A blueprint/20B
 * rubric/job context only — never candidate answers, resume, screening
 * result, recruiter notes, decisions, or communications. This sprint
 * creates DEFINITIONS only: no scenario execution, no response evaluation,
 * no multi-step runtime simulation (that is 28C/28D). An interview may
 * contain multiple scenarios — never a unique-per-interview constraint.
 */
export type EmployerInterviewScenarioStatus = 'draft' | 'ready' | 'archived';
export type EmployerInterviewScenarioCategory =
  | 'technical'
  | 'system_design'
  | 'debugging'
  | 'incident'
  | 'architecture'
  | 'leadership'
  | 'stakeholder'
  | 'prioritization'
  | 'communication'
  | 'domain'
  | 'other';
export type EmployerInterviewScenarioDifficulty = 'easy' | 'medium' | 'hard';

export interface IScenarioContext {
  situation: string;
  candidateRole: string;
  constraints: string[];
  availableInformation: string[];
}

export interface IEmployerInterviewScenario extends Document {
  organizationId: Types.ObjectId;
  applicationId: Types.ObjectId;
  jobId: Types.ObjectId;
  interviewId: Types.ObjectId;
  blueprintId: Types.ObjectId;
  rubricId: Types.ObjectId;
  scenarioVersion: string;
  status: EmployerInterviewScenarioStatus;
  title: string;
  description: string;
  category: EmployerInterviewScenarioCategory;
  context: IScenarioContext;
  targetCompetencies: string[];
  difficulty: EmployerInterviewScenarioDifficulty;
  objectives: string[];
  successEvidence: string[];
  failureSignals: string[];
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const scenarioContextSchema = new Schema<IScenarioContext>(
  {
    situation: { type: String, required: true, trim: true, maxlength: [2000, 'situation cannot exceed 2000 characters'] },
    candidateRole: { type: String, required: true, trim: true, maxlength: [300, 'candidateRole cannot exceed 300 characters'] },
    constraints: { type: [String], default: [] },
    availableInformation: { type: [String], default: [] },
  },
  { _id: false }
);

const employerInterviewScenarioSchema = new Schema<IEmployerInterviewScenario>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: 'EmployerJobApplication', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmployerJob', required: true },
    interviewId: { type: Schema.Types.ObjectId, ref: 'Interview', required: true },
    blueprintId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewBlueprint', required: true },
    rubricId: { type: Schema.Types.ObjectId, ref: 'EmployerInterviewCompetencyRubric', required: true },
    scenarioVersion: { type: String, required: true },
    status: {
      type: String,
      enum: { values: ['draft', 'ready', 'archived'], message: '{VALUE} is not a valid scenario status' },
      required: true,
      default: 'draft',
    },
    title: { type: String, required: true, trim: true, maxlength: [200, 'title cannot exceed 200 characters'] },
    description: { type: String, required: true, trim: true, maxlength: [2000, 'description cannot exceed 2000 characters'] },
    category: {
      type: String,
      enum: {
        values: [
          'technical',
          'system_design',
          'debugging',
          'incident',
          'architecture',
          'leadership',
          'stakeholder',
          'prioritization',
          'communication',
          'domain',
          'other',
        ],
        message: '{VALUE} is not a valid scenario category',
      },
      required: true,
    },
    context: { type: scenarioContextSchema, required: true },
    targetCompetencies: { type: [String], required: true, default: [] },
    difficulty: {
      type: String,
      enum: { values: ['easy', 'medium', 'hard'], message: '{VALUE} is not a valid difficulty' },
      required: true,
    },
    objectives: { type: [String], default: [] },
    successEvidence: { type: [String], default: [] },
    failureSignals: { type: [String], default: [] },
    createdByMembershipId: { type: Schema.Types.ObjectId, ref: 'OrganizationMember', required: true },
  },
  {
    timestamps: true,
    collection: 'employer_interview_scenarios',
  }
);

// An interview may contain MULTIPLE scenarios — these are query indexes
// only, never a uniqueness constraint.
employerInterviewScenarioSchema.index({ organizationId: 1, interviewId: 1, createdAt: -1 });
employerInterviewScenarioSchema.index({ organizationId: 1, applicationId: 1, createdAt: -1 });

export default mongoose.model<IEmployerInterviewScenario>('EmployerInterviewScenario', employerInterviewScenarioSchema);
