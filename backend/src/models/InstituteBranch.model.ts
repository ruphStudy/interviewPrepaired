import mongoose, { Schema, Document, Types } from 'mongoose';
import { InstituteBranchStatus } from '../constants/instituteBranch';

/**
 * A physical/administrative location under an institute organization (10B).
 * Deliberately minimal: no departments/courses/batches/students/trainers —
 * those are later prompts. Organization remains the tenant root; a branch is
 * always scoped to exactly one `organizationId`.
 */
export interface IInstituteBranch extends Document {
  organizationId: Types.ObjectId;
  name: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  status: InstituteBranchStatus;
  createdAt: Date;
  updatedAt: Date;
}

const instituteBranchSchema = new Schema<IInstituteBranch>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      maxlength: [150, 'name cannot exceed 150 characters'],
    },
    // Not globally unique — only unique within an organization when supplied
    // (see the partial index below).
    code: { type: String, trim: true, uppercase: true, maxlength: [50, 'code cannot exceed 50 characters'] },
    addressLine1: { type: String, trim: true, maxlength: [200, 'addressLine1 cannot exceed 200 characters'] },
    addressLine2: { type: String, trim: true, maxlength: [200, 'addressLine2 cannot exceed 200 characters'] },
    city: { type: String, trim: true, maxlength: [100, 'city cannot exceed 100 characters'] },
    state: { type: String, trim: true, maxlength: [100, 'state cannot exceed 100 characters'] },
    country: { type: String, trim: true, maxlength: [100, 'country cannot exceed 100 characters'] },
    postalCode: { type: String, trim: true, maxlength: [20, 'postalCode cannot exceed 20 characters'] },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: [254, 'contactEmail cannot exceed 254 characters'] },
    contactPhone: { type: String, trim: true, maxlength: [30, 'contactPhone cannot exceed 30 characters'] },
    status: {
      type: String,
      enum: {
        values: Object.values(InstituteBranchStatus),
        message: '{VALUE} is not a valid branch status',
      },
      default: InstituteBranchStatus.ACTIVE,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'institute_branches',
  }
);

instituteBranchSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
// Partial unique index: enforces "unique code per organization" only for
// documents that actually have a `code` (a string), so any number of
// branches with no code can coexist without colliding on a shared null/undefined value.
instituteBranchSchema.index(
  { organizationId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);

export default mongoose.model<IInstituteBranch>('InstituteBranch', instituteBranchSchema);
