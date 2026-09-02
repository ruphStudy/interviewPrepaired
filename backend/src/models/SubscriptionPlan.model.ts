import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscriptionPlan extends Document {
  code: string;
  name: string;
  description?: string;
  type: 'b2c';
  priceInrPaise: number;
  billingInterval: 'month' | 'none';
  includedInterviews: number;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  features: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['b2c'],
      required: true,
      default: 'b2c',
    },
    // Integer paise — never store floating-point INR amounts.
    priceInrPaise: {
      type: Number,
      required: true,
      min: 0,
    },
    billingInterval: {
      type: String,
      enum: ['month', 'none'],
      required: true,
    },
    includedInterviews: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    features: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'subscriptionplans',
  }
);

subscriptionPlanSchema.index({ code: 1 }, { unique: true });
subscriptionPlanSchema.index({ isActive: 1, sortOrder: 1 });

export const SubscriptionPlan = mongoose.model<ISubscriptionPlan>(
  'SubscriptionPlan',
  subscriptionPlanSchema
);
