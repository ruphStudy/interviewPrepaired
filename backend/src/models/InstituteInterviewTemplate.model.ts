import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteInterviewTemplateStatus } from '../constants/instituteInterviewTemplate';
import { DifficultyLevel } from '../services/OpenAIService';
import { SUPPORTED_LANGUAGE_CODES, SupportedLanguageCode } from '../config/languages';

/**
 * A reusable interview configuration for an institute (12C) — references an
 * EXISTING QuestionSet by id only; question text/answers are never copied
 * in here (the QuestionSet remains the single source of truth for its
 * content). No student assignment or interview creation from a template
 * happens here — that's 12D. `courseId`/`batchId` are optional scoping
 * only, service-validated to belong to the same organization and to be
 * mutually consistent (batch's own courseId is authoritative).
 */
export interface IInstituteInterviewTemplateConfig {
  difficulty?: DifficultyLevel;
  style?: string;
  language?: SupportedLanguageCode;
  questionLimit?: number;
}

export interface IInstituteInterviewTemplate extends Document {
  organizationId: Types.ObjectId;
  name: string;
  description?: string;
  questionSetId: Types.ObjectId;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  interviewConfig?: IInstituteInterviewTemplateConfig;
  status: InstituteInterviewTemplateStatus;
  createdAt: Date;
  updatedAt: Date;
}

const interviewConfigSchema = new Schema<IInstituteInterviewTemplateConfig>(
  {
    difficulty: {
      type: String,
      enum: { values: Object.values(DifficultyLevel), message: '{VALUE} is not a valid difficulty' },
    },
    style: { type: String, trim: true, maxlength: [100, 'style cannot exceed 100 characters'] },
    language: {
      type: String,
      enum: { values: SUPPORTED_LANGUAGE_CODES, message: '{VALUE} is not a supported language' },
    },
    questionLimit: {
      type: Number,
      min: [1, 'questionLimit must be at least 1'],
      max: [50, 'questionLimit cannot exceed 50'],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'questionLimit must be a whole number',
      },
    },
  },
  { _id: false }
);

const instituteInterviewTemplateSchema = new Schema<IInstituteInterviewTemplate>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [150, 'name cannot exceed 150 characters'],
    },
    description: { type: String, trim: true, maxlength: [1000, 'description cannot exceed 1000 characters'] },
    // References an existing QuestionSet only — never duplicated content.
    questionSetId: {
      type: Schema.Types.ObjectId,
      ref: 'QuestionSet',
      required: [true, 'questionSetId is required'],
    },
    courseId: { type: Schema.Types.ObjectId, ref: 'InstituteCourse' },
    batchId: { type: Schema.Types.ObjectId, ref: 'InstituteBatch' },
    interviewConfig: { type: interviewConfigSchema },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteInterviewTemplateStatus),
        message: '{VALUE} is not a valid template status',
      },
      default: InstituteInterviewTemplateStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_interview_templates',
  }
);

instituteInterviewTemplateSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
instituteInterviewTemplateSchema.index({ organizationId: 1, courseId: 1, status: 1 });
instituteInterviewTemplateSchema.index({ organizationId: 1, batchId: 1, status: 1 });

export default mongoose.model<IInstituteInterviewTemplate>('InstituteInterviewTemplate', instituteInterviewTemplateSchema);
