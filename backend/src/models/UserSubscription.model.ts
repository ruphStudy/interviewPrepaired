import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserSubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';
export type UserSubscriptionSource = 'system' | 'admin' | 'payment';

export interface IUserSubscription extends Document {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planCode: string;
  status: UserSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd?: Date;
  startedAt: Date;
  cancelledAt?: Date;
  cancelAtPeriodEnd: boolean;
  source: UserSubscriptionSource;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const userSubscriptionSchema = new Schema<IUserSubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: 'SubscriptionPlan',
      required: true,
    },
    // Stable snapshot of the plan's code at assignment time — the plan
    // definition itself is only ever read via planId/SubscriptionPlan.
    planCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'trial'],
      required: true,
      default: 'active',
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ['system', 'admin', 'payment'],
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'usersubscriptions',
  }
);

// Only one current (active/trial) subscription is expected per user — this
// is enforced at the service layer (not a DB-level partial unique index),
// so this index just makes that lookup efficient.
userSubscriptionSchema.index({ userId: 1 });
userSubscriptionSchema.index({ userId: 1, status: 1 });
userSubscriptionSchema.index({ planCode: 1 });
userSubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const UserSubscription = mongoose.model<IUserSubscription>(
  'UserSubscription',
  userSubscriptionSchema
);
