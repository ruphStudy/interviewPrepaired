import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteBatchStatus } from '../constants/instituteBatch';

/**
 * A cohort of an institute course (11A), optionally scoped to one of the
 * institute's branches. Deliberately minimal: no students/trainers/
 * assignments — those are later prompts (11B+). Always scoped to exactly
 * one `organizationId`; `courseId` (required) and `branchId` (optional),
 * when present, are service-validated to belong to that same organization
 * and to be mutually consistent (never trusted from the request alone).
 */
export interface IInstituteBatch extends Document {
  organizationId: Types.ObjectId;
  courseId: Types.ObjectId;
  branchId?: Types.ObjectId;
  name: string;
  code?: string;
  academicYear?: string;
  startDate?: Date;
  endDate?: Date;
  capacity?: number;
  status: InstituteBatchStatus;
  createdAt: Date;
  updatedAt: Date;
}

const instituteBatchSchema = new Schema<IInstituteBatch>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteCourse',
      required: [true, 'courseId is required'],
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteBranch',
    },
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
      maxlength: [150, 'name cannot exceed 150 characters'],
    },
    // Not globally unique — only unique within an organization when supplied
    // (see the partial index below).
    code: { type: String, trim: true, uppercase: true, maxlength: [50, 'code cannot exceed 50 characters'] },
    academicYear: { type: String, trim: true, maxlength: [20, 'academicYear cannot exceed 20 characters'] },
    startDate: { type: Date },
    endDate: { type: Date },
    capacity: {
      type: Number,
      min: [1, 'capacity must be at least 1'],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'capacity must be a whole number',
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteBatchStatus),
        message: '{VALUE} is not a valid batch status',
      },
      default: InstituteBatchStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_batches',
  }
);

// Defense-in-depth backstop — the service is the primary, clean-error-message
// enforcement point (assertValidDateRange), this just guards direct saves.
instituteBatchSchema.pre('validate', function (next) {
  if (this.startDate && this.endDate && this.endDate.getTime() < this.startDate.getTime()) {
    return next(new Error('endDate must be on or after startDate'));
  }
  next();
});

instituteBatchSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
instituteBatchSchema.index({ organizationId: 1, courseId: 1, status: 1 });
instituteBatchSchema.index({ organizationId: 1, branchId: 1, status: 1 });
// Partial unique index: enforces "unique code per organization" only for
// documents that actually have a `code` (a string), so any number of
// batches with no code can coexist without colliding on a shared null/undefined value.
instituteBatchSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

export default mongoose.model<IInstituteBatch>('InstituteBatch', instituteBatchSchema);
