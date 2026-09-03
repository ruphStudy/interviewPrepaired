import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Links a trainer (an OrganizationMember with role TRAINER) to exactly one
 * target: either an InstituteCourse or an InstituteBatch (12B) — never
 * both, never neither. Purely a relationship record — no historical/
 * evidentiary value, so unlike interviews it's safe to physically delete.
 * No student assignment or interview-template logic here (12C+).
 */
export interface IInstituteTrainerAssignment extends Document {
  organizationId: Types.ObjectId;
  trainerMembershipId: Types.ObjectId;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const instituteTrainerAssignmentSchema = new Schema<IInstituteTrainerAssignment>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    trainerMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteCourse',
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteBatch',
    },
  },
  {
    timestamps: true,
    collection: 'institute_trainer_assignments',
  }
);

// Exactly one of courseId/batchId — defense-in-depth backstop; the service
// is the primary, clean-error-message enforcement point.
instituteTrainerAssignmentSchema.pre('validate', function (next) {
  const hasCourse = this.courseId !== undefined && this.courseId !== null;
  const hasBatch = this.batchId !== undefined && this.batchId !== null;
  if (hasCourse === hasBatch) {
    return next(new Error('Exactly one of courseId or batchId is required'));
  }
  next();
});

instituteTrainerAssignmentSchema.index({ organizationId: 1, trainerMembershipId: 1 });
// Unique trainer+course within an organization — only for documents that
// actually have a courseId, so batch-only assignments never collide on it.
instituteTrainerAssignmentSchema.index(
  { organizationId: 1, trainerMembershipId: 1, courseId: 1 },
  { unique: true, partialFilterExpression: { courseId: { $exists: true } } }
);
// Unique trainer+batch within an organization — only for documents that
// actually have a batchId, so course-only assignments never collide on it.
instituteTrainerAssignmentSchema.index(
  { organizationId: 1, trainerMembershipId: 1, batchId: 1 },
  { unique: true, partialFilterExpression: { batchId: { $exists: true } } }
);

export default mongoose.model<IInstituteTrainerAssignment>('InstituteTrainerAssignment', instituteTrainerAssignmentSchema);
