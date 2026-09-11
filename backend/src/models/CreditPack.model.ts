import mongoose, { Schema, Document } from 'mongoose';

/** A purchasable B2C interview-credit top-up pack (PR-BILL-5). Mirrors SubscriptionPlan's conventions. */
export interface ICreditPack extends Document {
  code: string;
  name: string;
  description?: string;
  credits: number;
  priceInrPaise: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const creditPackSchema = new Schema<ICreditPack>(
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
    credits: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
    },
    // Integer paise — never store floating-point INR amounts.
    priceInrPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    active: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'creditpacks',
  }
);

creditPackSchema.index({ code: 1 }, { unique: true });
creditPackSchema.index({ active: 1, sortOrder: 1 });

export const CreditPack = mongoose.model<ICreditPack>('CreditPack', creditPackSchema);
