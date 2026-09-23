import { Types } from 'mongoose';
import {
  OrganizationProvisioningAudit,
  OrganizationProvisioningAction,
} from '../models/OrganizationProvisioningAudit.model';

export interface RecordProvisioningEventParams {
  actorUserId?: Types.ObjectId | string;
  organizationId?: Types.ObjectId | string;
  targetUserId?: Types.ObjectId | string;
  previousOwnerUserId?: Types.ObjectId | string;
  /** Bounded, non-sensitive context only — NEVER a password/JWT/invitation token/secret. */
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort append-only audit writer for the provisioning flow's
 * non-idempotency-critical events (everything except the initial
 * 'organization_created' row, which the provisioning service itself writes
 * directly so it can use the unique idempotencyKey index as the request's
 * primary idempotency defense — see OrganizationProvisioningAudit.model.ts).
 * Mirrors AuthSecurityEventService.record exactly: an audit-write failure
 * must never block or fail the provisioning action it describes.
 */
class OrganizationProvisioningAuditService {
  async record(action: OrganizationProvisioningAction, params: RecordProvisioningEventParams = {}): Promise<void> {
    try {
      await OrganizationProvisioningAudit.create({
        action,
        status: 'success',
        actorUserId: params.actorUserId,
        organizationId: params.organizationId,
        targetUserId: params.targetUserId,
        previousOwnerUserId: params.previousOwnerUserId,
        metadata: params.metadata,
      });
    } catch (error) {
      console.error('[OrganizationProvisioningAuditService] Failed to record provisioning event', { action, error });
    }
  }
}

export const organizationProvisioningAuditService = new OrganizationProvisioningAuditService();
