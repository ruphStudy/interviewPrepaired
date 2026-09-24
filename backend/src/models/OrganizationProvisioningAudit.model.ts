import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrganizationProvisioningAction =
  | 'organization_created'
  | 'owner_invitation_created'
  | 'owner_invitation_resent'
  | 'owner_invitation_revoked'
  | 'owner_activation_completed'
  | 'owner_invitation_accepted'
  | 'organization_suspended'
  | 'organization_reactivated'
  | 'owner_changed'
  // Institute People Management (PR-PEOPLE-1) — additive, same append-only
  // audit trail, same "never a secret/token/password in metadata" discipline.
  | 'trainer_invited'
  | 'student_added'
  | 'people_import_completed'
  | 'people_relationship_disabled'
  | 'people_relationship_reactivated'
  | 'bulk_assignment_created'
  // Employer People Management (PR-PEOPLE-2) — additive, same discipline.
  // 'people_import_completed'/'people_relationship_disabled'/
  // 'people_relationship_reactivated'/'bulk_assignment_created' above are
  // already domain-neutral and reused as-is for Employer events too.
  | 'recruiter_invited'
  | 'candidate_added';

export type OrganizationProvisioningStatus = 'pending' | 'success' | 'failed';

/**
 * Append-only audit trail for the Super Admin B2B organization provisioning
 * flow (create org+owner, owner invitation lifecycle, suspend/reactivate,
 * owner transfer). Mirrors this codebase's established per-domain audit
 * model pattern (PrivacyActionAudit, AuthSecurityEvent) — same discipline:
 * `metadata` MUST NEVER contain a password/JWT/raw token/security secret,
 * bounded non-sensitive fields only.
 *
 * `idempotencyKey` doubles as the primary defense for "create organization"
 * idempotency (D5): a unique-sparse index means a retried request with the
 * SAME key hits a duplicate-key error rather than creating a second
 * organization — the caller resolves that race by re-reading this row
 * rather than by an audit-write ever blocking the action it describes.
 */
export interface IOrganizationProvisioningAudit extends Document {
  action: OrganizationProvisioningAction;
  /** Who performed the action — the Super Admin for admin-initiated actions, or the invitee themselves for owner_activation_completed/owner_invitation_accepted. */
  actorUserId?: Types.ObjectId;
  organizationId?: Types.ObjectId;
  /** The owner being created/attached/activated/transferred to. */
  targetUserId?: Types.ObjectId;
  /** Set only for owner_changed — the owner being replaced. */
  previousOwnerUserId?: Types.ObjectId;
  status: OrganizationProvisioningStatus;
  /** Only ever populated on 'organization_created' rows — see class doc above. */
  idempotencyKey?: string;
  /** NEVER password/JWT/raw invitation token/security secret. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const organizationProvisioningAuditSchema = new Schema<IOrganizationProvisioningAudit>(
  {
    action: {
      type: String,
      enum: [
        'organization_created',
        'owner_invitation_created',
        'owner_invitation_resent',
        'owner_invitation_revoked',
        'owner_activation_completed',
        'owner_invitation_accepted',
        'organization_suspended',
        'organization_reactivated',
        'owner_changed',
        'trainer_invited',
        'student_added',
        'people_import_completed',
        'people_relationship_disabled',
        'people_relationship_reactivated',
        'bulk_assignment_created',
        'recruiter_invited',
        'candidate_added',
      ],
      required: true,
    },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    previousOwnerUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      required: true,
      default: 'pending',
    },
    idempotencyKey: {
      type: String,
      trim: true,
      maxlength: [200, 'idempotencyKey cannot exceed 200 characters'],
    },
    // See class doc above — NEVER a secret/token/password field.
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: 'organization_provisioning_audits',
  }
);

// Partial unique index — only rows that actually set idempotencyKey
// participate in the uniqueness constraint (most rows never set it).
organizationProvisioningAuditSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
organizationProvisioningAuditSchema.index({ organizationId: 1, createdAt: -1 });
organizationProvisioningAuditSchema.index({ action: 1, status: 1 });

export const OrganizationProvisioningAudit = mongoose.model<IOrganizationProvisioningAudit>(
  'OrganizationProvisioningAudit',
  organizationProvisioningAuditSchema
);
export default OrganizationProvisioningAudit;
