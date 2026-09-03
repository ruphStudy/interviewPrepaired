import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteTrainerProfileStatus } from '../constants/instituteTrainerProfile';

/**
 * Optional trainer-specific profile metadata (12A) layered on top of the
 * EXISTING OrganizationMember identity (role = TRAINER) — this is
 * deliberately not a second identity/account model. `membershipId` is the
 * canonical link back to that membership row; `userId` is denormalized onto
 * this document only for convenience (never a separate source of truth —
 * OrganizationMember.userId remains authoritative). No trainer assignments/
 * templates here — that's 12B+.
 */
export interface IInstituteTrainerProfile extends Document {
  organizationId: Types.ObjectId;
  membershipId: Types.ObjectId;
  userId: Types.ObjectId;
  employeeCode?: string;
  designation?: string;
  department?: string;
  specialization?: string[];
  bio?: string;
  status: InstituteTrainerProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

const instituteTrainerProfileSchema = new Schema<IInstituteTrainerProfile>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    membershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Not globally unique — only unique within an organization when
    // supplied (see the partial index below).
    employeeCode: { type: String, trim: true, uppercase: true, maxlength: [50, 'employeeCode cannot exceed 50 characters'] },
    designation: { type: String, trim: true, maxlength: [150, 'designation cannot exceed 150 characters'] },
    department: { type: String, trim: true, maxlength: [150, 'department cannot exceed 150 characters'] },
    specialization: { type: [String], default: undefined },
    bio: { type: String, trim: true, maxlength: [1000, 'bio cannot exceed 1000 characters'] },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteTrainerProfileStatus),
        message: '{VALUE} is not a valid trainer profile status',
      },
      default: InstituteTrainerProfileStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_trainer_profiles',
  }
);

// At most one profile per membership per organization.
instituteTrainerProfileSchema.index({ organizationId: 1, membershipId: 1 }, { unique: true });
// Partial unique index: enforces "unique employee code per organization"
// only for documents that actually have one (a string), so any number of
// trainers with no employee code can coexist without colliding.
instituteTrainerProfileSchema.index(
  { organizationId: 1, employeeCode: 1 },
  { unique: true, partialFilterExpression: { employeeCode: { $type: 'string' } } }
);

export default mongoose.model<IInstituteTrainerProfile>('InstituteTrainerProfile', instituteTrainerProfileSchema);
