import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteStudentStatus } from '../constants/instituteStudent';

const CURRENT_YEAR = new Date().getFullYear();

/**
 * A student record under an institute organization (11B) — profile/roster
 * data only, no registration/auth/login (that's 11C), no bulk import (11D),
 * no assignment logic (11E). Always scoped to exactly one `organizationId`;
 * `batchId`/`courseId`/`branchId`, when present, are service-validated to
 * belong to that same organization and to be mutually consistent with each
 * other (never trusted from the request alone).
 */
export interface IInstituteStudent extends Document {
  organizationId: Types.ObjectId;
  batchId?: Types.ObjectId;
  courseId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  enrollmentNumber?: string;
  graduationYear?: number;
  status: InstituteStudentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const instituteStudentSchema = new Schema<IInstituteStudent>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    batchId: { type: Schema.Types.ObjectId, ref: 'InstituteBatch' },
    courseId: { type: Schema.Types.ObjectId, ref: 'InstituteCourse' },
    branchId: { type: Schema.Types.ObjectId, ref: 'InstituteBranch' },
    firstName: {
      type: String,
      required: [true, 'firstName is required'],
      trim: true,
      maxlength: [100, 'firstName cannot exceed 100 characters'],
    },
    lastName: { type: String, trim: true, maxlength: [100, 'lastName cannot exceed 100 characters'] },
    email: { type: String, trim: true, lowercase: true, maxlength: [254, 'email cannot exceed 254 characters'] },
    phone: { type: String, trim: true, maxlength: [30, 'phone cannot exceed 30 characters'] },
    // Not globally unique — only unique within an organization when supplied
    // (see the partial index below).
    enrollmentNumber: { type: String, trim: true, maxlength: [100, 'enrollmentNumber cannot exceed 100 characters'] },
    graduationYear: {
      type: Number,
      min: [1900, 'graduationYear must be 1900 or later'],
      max: [CURRENT_YEAR + 10, `graduationYear cannot be more than ${CURRENT_YEAR + 10}`],
      validate: {
        validator: (value: number) => Number.isInteger(value),
        message: 'graduationYear must be a whole number',
      },
    },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteStudentStatus),
        message: '{VALUE} is not a valid student status',
      },
      default: InstituteStudentStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_students',
  }
);

instituteStudentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
instituteStudentSchema.index({ organizationId: 1, batchId: 1, status: 1 });
instituteStudentSchema.index({ organizationId: 1, courseId: 1, status: 1 });
// Partial unique index: enforces "unique enrollment number per organization"
// only for documents that actually have one (a string), so any number of
// students with no enrollment number can coexist without colliding.
instituteStudentSchema.index(
  { organizationId: 1, enrollmentNumber: 1 },
  { unique: true, partialFilterExpression: { enrollmentNumber: { $type: 'string' } } }
);
// Not unique — supports lookup/search by email within an organization only.
instituteStudentSchema.index({ organizationId: 1, email: 1 });

export default mongoose.model<IInstituteStudent>('InstituteStudent', instituteStudentSchema);
