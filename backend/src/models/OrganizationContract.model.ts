import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationContractStatus = 'draft' | 'active' | 'expired' | 'cancelled';
export type OrganizationContractBillingModel = 'prepaid' | 'monthly' | 'annual' | 'custom';

/**
 * Manually-administered enterprise contract (PR-B2B-BILL-5) — global-admin
 * only. Never stores binary/document content; `renewalTerms` is a bounded
 * free-text summary, not a contract document itself. Status only ever
 * flips (draft -> active -> expired/cancelled) — a contract row is never
 * deleted, preserving financial/audit history permanently.
 */
export interface IOrganizationContract extends Document {
  organizationId: Types.ObjectId;
  contractCode: string;
  status: OrganizationContractStatus;
  startDate: Date;
  endDate?: Date;
  billingModel: OrganizationContractBillingModel;
  planCode?: string;
  contractValueInrPaise?: number;
  creditAllowance?: number;
  renewalTerms?: string;
  externalReference?: string;
  createdByAdminUserId: Types.ObjectId;
  activatedAt?: Date;
  expiredAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationContractSchema = new Schema<IOrganizationContract>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    contractCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'expired', 'cancelled'],
      default: 'draft',
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    billingModel: {
      type: String,
      enum: ['prepaid', 'monthly', 'annual', 'custom'],
      required: true,
    },
    planCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    contractValueInrPaise: {
      type: Number,
      min: 0,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    creditAllowance: {
      type: Number,
      min: 0,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    renewalTerms: {
      type: String,
      trim: true,
      maxlength: [1000, 'renewalTerms cannot exceed 1000 characters'],
    },
    externalReference: {
      type: String,
      trim: true,
      maxlength: [200, 'externalReference cannot exceed 200 characters'],
    },
    createdByAdminUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    activatedAt: { type: Date },
    expiredAt: { type: Date },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
    collection: 'organization_contracts',
  }
);

organizationContractSchema.index({ organizationId: 1, createdAt: -1 });
organizationContractSchema.index({ organizationId: 1, status: 1 });

export const OrganizationContract = mongoose.model<IOrganizationContract>('OrganizationContract', organizationContractSchema);
