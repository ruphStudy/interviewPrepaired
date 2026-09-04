import mongoose, { Schema, Document, Types } from 'mongoose';
import { EmployerJobStatus, EmployerJobWorkplaceType, EmployerJobEmploymentType } from '../constants/employerJob';

/**
 * A job posting owned by a COMPANY organization (16B). Always scoped to
 * exactly one `organizationId`. Deliberately minimal: no JD AI parsing
 * (Sprint 17), no candidates/applications (Sprint 18), no hiring-team
 * scoping (16D) — this is job-posting CRUD + status lifecycle only.
 */
export interface IEmployerJob extends Document {
  organizationId: Types.ObjectId;
  title: string;
  jobCode?: string;
  department?: string;
  location?: string;
  workplaceType?: EmployerJobWorkplaceType;
  employmentType?: EmployerJobEmploymentType;
  experienceMinYears?: number;
  experienceMaxYears?: number;
  openings?: number;
  description?: string;
  responsibilities?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  applicationDeadline?: Date;
  status: EmployerJobStatus;
  createdByMembershipId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employerJobSchema = new Schema<IEmployerJob>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [200, 'title cannot exceed 200 characters'],
    },
    // Not globally unique — only unique within an organization when supplied
    // (see the partial index below), same policy as InstituteCourse.code.
    jobCode: { type: String, trim: true, uppercase: true, maxlength: [50, 'jobCode cannot exceed 50 characters'] },
    department: { type: String, trim: true, maxlength: [150, 'department cannot exceed 150 characters'] },
    location: { type: String, trim: true, maxlength: [200, 'location cannot exceed 200 characters'] },
    workplaceType: {
      type: String,
      enum: { values: Object.values(EmployerJobWorkplaceType), message: '{VALUE} is not a valid workplace type' },
    },
    employmentType: {
      type: String,
      enum: { values: Object.values(EmployerJobEmploymentType), message: '{VALUE} is not a valid employment type' },
    },
    experienceMinYears: { type: Number, min: [0, 'experienceMinYears cannot be negative'] },
    experienceMaxYears: { type: Number, min: [0, 'experienceMaxYears cannot be negative'] },
    openings: {
      type: Number,
      min: [1, 'openings must be at least 1'],
      validate: { validator: (value: number) => Number.isInteger(value), message: 'openings must be a whole number' },
    },
    description: { type: String, trim: true, maxlength: [5000, 'description cannot exceed 5000 characters'] },
    // Per-item trim/length/count cleanup happens in EmployerJobService — the
    // schema just stores whatever array the service already sanitized.
    responsibilities: { type: [String], default: undefined },
    requiredSkills: { type: [String], default: undefined },
    preferredSkills: { type: [String], default: undefined },
    salaryMin: { type: Number, min: [0, 'salaryMin cannot be negative'] },
    salaryMax: { type: Number, min: [0, 'salaryMax cannot be negative'] },
    salaryCurrency: { type: String, trim: true, uppercase: true, maxlength: [10, 'salaryCurrency cannot exceed 10 characters'] },
    applicationDeadline: { type: Date },
    status: {
      type: String,
      enum: { values: Object.values(EmployerJobStatus), message: '{VALUE} is not a valid job status' },
      default: EmployerJobStatus.DRAFT,
      required: true,
    },
    createdByMembershipId: {
      type: Schema.Types.ObjectId,
      ref: 'OrganizationMember',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'employer_jobs',
  }
);

// Defense in depth alongside EmployerJobService.assertIntegrity() — max must
// be >= min for both pairs, only when both sides are present.
employerJobSchema.pre('validate', function (next) {
  if (
    this.experienceMinYears !== undefined &&
    this.experienceMaxYears !== undefined &&
    this.experienceMaxYears < this.experienceMinYears
  ) {
    return next(new Error('experienceMaxYears must be greater than or equal to experienceMinYears'));
  }
  if (this.salaryMin !== undefined && this.salaryMax !== undefined && this.salaryMax < this.salaryMin) {
    return next(new Error('salaryMax must be greater than or equal to salaryMin'));
  }
  next();
});

employerJobSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
employerJobSchema.index({ organizationId: 1, department: 1 });
// Partial unique index: enforces "unique jobCode per organization" only for
// documents that actually have one (a string) — any number of jobs with no
// code can coexist without colliding on a shared null/undefined value.
employerJobSchema.index(
  { organizationId: 1, jobCode: 1 },
  { unique: true, partialFilterExpression: { jobCode: { $type: 'string' } } }
);

export default mongoose.model<IEmployerJob>('EmployerJob', employerJobSchema);
