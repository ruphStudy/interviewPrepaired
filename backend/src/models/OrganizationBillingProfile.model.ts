import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationBillingType = 'prepaid_credits' | 'subscription' | 'contract';
export type OrganizationBillingProfileStatus = 'active' | 'suspended' | 'closed';

/**
 * ONE billing-identity profile per organization (PR-B2B-BILL-1). Purely
 * descriptive/contact data for invoicing/receipts — never auto-filled or
 * fabricated. `gstin`/`taxId`/`legalName`/`billingAddress` are only ever set
 * when an authorized billing-permission user explicitly provides them via
 * the billing profile update endpoint.
 */
export interface IOrganizationBillingProfile extends Document {
  organizationId: Types.ObjectId;
  billingType: OrganizationBillingType;
  billingEmail?: string;
  legalName?: string;
  billingAddress?: string;
  taxId?: string;
  gstin?: string;
  currency: string;
  paymentProvider?: 'razorpay';
  customerReference?: string;
  status: OrganizationBillingProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

const organizationBillingProfileSchema = new Schema<IOrganizationBillingProfile>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    billingType: {
      type: String,
      enum: ['prepaid_credits', 'subscription', 'contract'],
      required: true,
    },
    billingEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [254, 'billingEmail cannot exceed 254 characters'],
    },
    legalName: {
      type: String,
      trim: true,
      maxlength: [200, 'legalName cannot exceed 200 characters'],
    },
    billingAddress: {
      type: String,
      trim: true,
      maxlength: [500, 'billingAddress cannot exceed 500 characters'],
    },
    taxId: {
      type: String,
      trim: true,
      maxlength: [50, 'taxId cannot exceed 50 characters'],
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [15, 'gstin cannot exceed 15 characters'],
    },
    currency: {
      type: String,
      required: true,
      default: 'INR',
      uppercase: true,
    },
    paymentProvider: {
      type: String,
      enum: ['razorpay'],
    },
    customerReference: {
      type: String,
      trim: true,
      maxlength: [200, 'customerReference cannot exceed 200 characters'],
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'closed'],
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'organization_billing_profiles',
  }
);

export const OrganizationBillingProfile = mongoose.model<IOrganizationBillingProfile>(
  'OrganizationBillingProfile',
  organizationBillingProfileSchema
);
