import { Types } from 'mongoose';
import { AuthSecurityEvent, AuthSecurityEventType } from '../models/AuthSecurityEvent.model';

export interface RecordEventParams {
  userId?: Types.ObjectId | string;
  sessionId?: string;
  userAgent?: string;
  /** Bounded, non-sensitive context only — NEVER a password/JWT/token. */
  metadata?: Record<string, unknown>;
}

/**
 * Minimal append-only account-security audit (PR-AUTH-4). Best-effort —
 * an audit-write failure must never block or fail the auth action it's
 * recording.
 */
class AuthSecurityEventService {
  async record(eventType: AuthSecurityEventType, params: RecordEventParams = {}): Promise<void> {
    try {
      await AuthSecurityEvent.create({
        eventType,
        userId: params.userId,
        sessionId: params.sessionId,
        userAgentSummary: params.userAgent ? params.userAgent.slice(0, 200) : undefined,
        metadata: params.metadata,
        occurredAt: new Date(),
      });
    } catch (error) {
      console.error('[AuthSecurityEventService] Failed to record security event', { eventType, error });
    }
  }
}

export const authSecurityEventService = new AuthSecurityEventService();
