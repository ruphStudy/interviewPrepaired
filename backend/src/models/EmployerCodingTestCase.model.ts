import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ONE test case for an `EmployerCodingQuestion` (30A) — pure data, no
 * execution. `type: 'hidden'` rows are EMPLOYER-INTERNAL ONLY: their
 * input/expectedOutput/weight must never be exposed through any candidate/
 * public API. Execution against these test cases arrives in 30C.
 */
export type EmployerCodingTestCaseType = 'sample' | 'hidden';

export interface IEmployerCodingTestCase extends Document {
  organizationId: Types.ObjectId;
  codingQuestionId: Types.ObjectId;
  type: EmployerCodingTestCaseType;
  input: string;
  expectedOutput: string;
  weight: number;
  explanation?: string;
  order: number;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const employerCodingTestCaseSchema = new Schema<IEmployerCodingTestCase>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    codingQuestionId: { type: Schema.Types.ObjectId, ref: 'EmployerCodingQuestion', required: true },
    type: {
      type: String,
      enum: { values: ['sample', 'hidden'], message: '{VALUE} is not a valid test case type' },
      required: true,
    },
    input: { type: String, required: true, maxlength: [4000, 'input cannot exceed 4000 characters'] },
    expectedOutput: { type: String, required: true, maxlength: [4000, 'expectedOutput cannot exceed 4000 characters'] },
    weight: { type: Number, required: true, min: 0, max: 100, default: 1 },
    explanation: { type: String, trim: true, maxlength: [500, 'explanation cannot exceed 500 characters'] },
    order: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: { values: ['active', 'archived'], message: '{VALUE} is not a valid status' },
      required: true,
      default: 'active',
    },
  },
  {
    timestamps: true,
    collection: 'employer_coding_test_cases',
  }
);

employerCodingTestCaseSchema.index({ organizationId: 1, codingQuestionId: 1, order: 1 });

export default mongoose.model<IEmployerCodingTestCase>('EmployerCodingTestCase', employerCodingTestCaseSchema);
