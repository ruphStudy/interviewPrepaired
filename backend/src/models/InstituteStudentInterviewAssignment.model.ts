import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';

/**
 * Assigns an InstituteInterviewTemplate to an InstituteStudent (12D) — a
 * pure relationship/task record. Does NOT create/start an actual Interview
 * here; `interviewId` is reserved for 12E to fill in once a real interview
 * exists from this assignment. No lifecycle transitions beyond the initial
 * `assigned` status are implemented yet.
 */
export interface IInstituteStudentInterviewAssignment extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  templateId: Types.ObjectId;
  // Trusted — always the acting caller's own membership id from
  // organizationContext.member._id, never accepted from the request body.
  assignedByMembershipId: Types.ObjectId;
  dueAt?: Date;
  instructions?: string;
  status: InstituteStudentInterviewAssignmentStatus;
  // Reserved for 12E — not set anywhere in this prompt.
  interviewId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const instituteStudentInterviewAssignmentSchema = new Schema<IInstituteStudentInterviewAssignment>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteStudent',
      required: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'InstituteInterviewTemplate',
      required: true,
    },
    assignedByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
    dueAt: { type: Date },
    instructions: { type: String, trim: true, maxlength: [1000, 'instructions cannot exceed 1000 characters'] },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteStudentInterviewAssignmentStatus),
        message: '{VALUE} is not a valid assignment status',
      },
      default: InstituteStudentInterviewAssignmentStatus.ASSIGNED,
      required: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: 'Interview',
    },
  },
  {
    timestamps: true,
    collection: 'institute_student_interview_assignments',
  }
);

instituteStudentInterviewAssignmentSchema.index({ organizationId: 1, studentId: 1, status: 1, createdAt: -1 });
instituteStudentInterviewAssignmentSchema.index({ organizationId: 1, templateId: 1, status: 1 });
// Prevents a duplicate still-ASSIGNED row for the same org+student+template.
// Scoped to status=ASSIGNED only, so a later re-assignment after the prior
// one is completed/cancelled is not blocked by this index.
instituteStudentInterviewAssignmentSchema.index(
  { organizationId: 1, studentId: 1, templateId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: InstituteStudentInterviewAssignmentStatus.ASSIGNED } }
);

export default mongoose.model<IInstituteStudentInterviewAssignment>(
  'InstituteStudentInterviewAssignment',
  instituteStudentInterviewAssignmentSchema
);
