import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationSubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'expired';
export type OrganizationSubscriptionSource = 'payment' | 'admin' | 'contract';

// Statuses that count as "current" — mirrors UserSubscriptionService's
// CURRENT_STATUSES convention at the organization level.
export const CURRENT_ORGANIZATION_SUBSCRIPTION_STATUSES: OrganizationSubscriptionStatus[] = ['active', 'trial', 'past_due'];

/**
 * ONE organization's subscription lifecycle row (PR-B2B-BILL-3) — company
 * (seat/feature) plans today, but generic enough for any org type. At most
 * one CURRENT (active/trial/past_due) row per organization is enforced by
 * the unique PARTIAL index below — never in application code alone.
 */
export interface IOrganizationSubscription extends Document {
  organizationId: Types.ObjectId;
  planCode: string;
  /** Reserved for a future DB-backed plan catalog — the catalog is code-based today (constants/organizationBillingPlan.ts), so this is never populated/queried yet. */
  planId?: Types.ObjectId;
  status: OrganizationSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  /** Never claims true recurring auto-charge — no recurring-payment authorization is implemented; kept for shape-compatibility with UserSubscription, always false here. */
  autoRenew: boolean;
  source: OrganizationSubscriptionSource;
  pendingNextPlanCode?: string;
  externalReference?: string;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSubscriptionSchema = new Schema<IOrganizationSubscription>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    planCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
    },
    status: {
      type: String,
      enum: ['active', 'trial', 'past_due', 'cancelled', 'expired'],
      required: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
    source: {
      type: String,
      enum: ['payment', 'admin', 'contract'],
      required: true,
    },
    pendingNextPlanCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    externalReference: {
      type: String,
      trim: true,
      maxlength: [200, 'externalReference cannot exceed 200 characters'],
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'organization_subscriptions',
  }
);

organizationSubscriptionSchema.index({ organizationId: 1, createdAt: -1 });

// Only one CURRENT (active/trial/past_due) subscription per organization —
// a DB-level invariant, never relied on as an in-memory/application-only
// guarantee. Mirrors the partial-unique-index style already used by
// OrganizationInterviewCreditLedger for idempotency.
organizationSubscriptionSchema.index(
  { organizationId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['active', 'trial', 'past_due'] } } }
);

export const OrganizationSubscription = mongoose.model<IOrganizationSubscription>(
  'OrganizationSubscription',
  organizationSubscriptionSchema
);
