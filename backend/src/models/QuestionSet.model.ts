import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IQuestionSetQuestion {
  questionText: string;
  referenceAnswer?: string;
}

export interface IQuestionSet extends Document {
  userId: Types.ObjectId;
  name: string;
  description?: string;
  questions: IQuestionSetQuestion[];
  source: 'manual' | 'uploaded';
  createdAt: Date;
  updatedAt: Date;
}

const questionSetQuestionSchema = new Schema<IQuestionSetQuestion>(
  {
    questionText: { type: String, required: true, trim: true },
    referenceAnswer: { type: String, trim: true },
  },
  { _id: false }
);

// questionCount/questionsWithAnswers are intentionally not persisted — they
// are cheap to derive from `questions` and storing them would risk drifting
// out of sync with the actual array on partial updates.
const questionSetSchema = new Schema<IQuestionSet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    questions: { type: [questionSetQuestionSchema], required: true, default: [] },
    source: { type: String, enum: ['manual', 'uploaded'], default: 'manual', required: true },
  },
  {
    timestamps: true,
    collection: 'questionsets',
  }
);

questionSetSchema.index({ userId: 1, updatedAt: -1 });
questionSetSchema.index({ userId: 1, name: 1 });

export default mongoose.model<IQuestionSet>('QuestionSet', questionSetSchema);
