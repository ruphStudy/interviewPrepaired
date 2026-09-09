import mongoose, { Schema, Document, Types } from 'mongoose';
import { UserSubscriptionStatus, UserSubscriptionSource } from './UserSubscription.model';

export type UserSubscriptionHistoryAction =
  | 'created'
  | 'plan_changed'
  | 'cancel_scheduled'
  | 'cancellation_resumed'
  | 'cancelled'
  | 'expired'
  | 'past_due'
  | 'renewed';

/**
 * Append-only audit trail of actual B2C subscription state transitions
 * (PR-BILL-1). Written only when a real transition happens — never
 * duplicated on a repeated idempotent service call. Never used to derive
 * live subscription state; UserSubscription remains the source of truth.
 */
export interface IUserSubscriptionHistory extends Document {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  previousPlanCode?: string;
  nextPlanCode?: string;
  previousStatus?: UserSubscriptionStatus;
  nextStatus?: UserSubscriptionStatus;
  action: UserSubscriptionHistoryAction;
  source: UserSubscriptionSource;
  externalReference?: string;
  changedAt: Date;
  /** Bounded, internal-only context — never provider credentials/secrets. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const userSubscriptionHistorySchema = new Schema<IUserSubscriptionHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'UserSubscription',
    },
    previousPlanCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    nextPlanCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    previousStatus: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'trial', 'past_due'],
    },
    nextStatus: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'trial', 'past_due'],
    },
    action: {
      type: String,
      enum: [
        'created',
        'plan_changed',
        'cancel_scheduled',
        'cancellation_resumed',
        'cancelled',
        'expired',
        'past_due',
        'renewed',
      ],
      required: true,
    },
    source: {
      type: String,
      enum: ['system', 'admin', 'payment'],
      required: true,
    },
    externalReference: {
      type: String,
      trim: true,
      maxlength: [200, 'externalReference cannot exceed 200 characters'],
    },
    changedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'usersubscriptionhistories',
  }
);

userSubscriptionHistorySchema.index({ userId: 1, changedAt: -1 });

export const UserSubscriptionHistory = mongoose.model<IUserSubscriptionHistory>(
  'UserSubscriptionHistory',
  userSubscriptionHistorySchema
);
