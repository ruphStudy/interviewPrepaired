import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteCourseStatus } from '../constants/instituteCourse';

/**
 * A course offered by an institute organization (10C), optionally scoped to
 * one of its branches. Deliberately minimal: no batches/students/trainers —
 * those are later prompts. Always scoped to exactly one `organizationId`;
 * `branchId`, when present, is service-validated to belong to that same
 * organization (never trusted from the request alone).
 */
export interface IInstituteCourse extends Document {
  organizationId: Types.ObjectId;
  branchId?: Types.ObjectId;
  name: string;
  code?: string;
  description?: string;
  durationMonths?: number;
  status: InstituteCourseStatus;
  createdAt: Date;
  updatedAt: Date;
}

const instituteCourseSchema = new Schema<IInstituteCourse>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteBranch',
    },
    name: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
      maxlength: [150, 'name cannot exceed 150 characters'],
    },
    // Not globally unique — only unique within an organization when supplied
    // (see the partial index below).
    code: { type: String, trim: true, uppercase: true, maxlength: [50, 'code cannot exceed 50 characters'] },
    description: { type: String, trim: true, maxlength: [1000, 'description cannot exceed 1000 characters'] },
    durationMonths: {
      type: Number,
      min: [1, 'durationMonths must be at least 1'],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'durationMonths must be a whole number',
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteCourseStatus),
        message: '{VALUE} is not a valid course status',
      },
      default: InstituteCourseStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_courses',
  }
);

instituteCourseSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
instituteCourseSchema.index({ organizationId: 1, branchId: 1, status: 1 });
// Partial unique index: enforces "unique code per organization" only for
// documents that actually have a `code` (a string), so any number of
// courses with no code can coexist without colliding on a shared null/undefined value.
instituteCourseSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

export default mongoose.model<IInstituteCourse>('InstituteCourse', instituteCourseSchema);
