import { Types } from 'mongoose';
import EmployerIntegrationEvent, { IEmployerIntegrationEvent, EmployerIntegrationEventType } from '../models/EmployerIntegrationEvent.model';
import { employerIntegrationDeliveryService } from './EmployerIntegrationDeliveryService';

export const INTEGRATION_EVENT_VERSION = 'integration-event-v1';
export const INTEGRATION_PAYLOAD_VERSION = 'integration-delivery-v1';

export interface EmitEventParams {
  organizationId: Types.ObjectId | string;
  eventType: EmployerIntegrationEventType;
  applicationId?: Types.ObjectId | string;
  jobId?: Types.ObjectId | string;
  interviewId?: Types.ObjectId | string;
  sourceArtifactType?: string;
  sourceArtifactId?: string;
  /** Bounded, non-confidential extra context only (e.g. `{status: 'shortlisted'}`) — never answers/source code/resume/KB text. */
  data?: Record<string, string>;
}

/**
 * Small internal event emitter (31D) — persists an
 * `EmployerIntegrationEvent` FIRST, then best-effort fans out delivery
 * rows/attempts. NEVER throws: every milestone integration call-site can
 * `await emitEvent(...)` unconditionally without its own try/catch — a
 * failure here is logged and swallowed, never affecting the primary
 * hiring operation that triggered it. NO AI, never called synchronously
 * inside a critical transaction path in a way that could block it (the
 * actual outbound HTTP delivery is fired-and-forgotten from here).
 */
export class EmployerIntegrationEventService {
  async emitEvent(params: EmitEventParams): Promise<void> {
    try {
      const event = await this.recordEvent(params);
      // Fire-and-forget — never awaited by the caller's primary operation.
      void employerIntegrationDeliveryService.enqueueAndProcessForEvent(event).catch((error) => {
        console.error('[EmployerIntegrationEventService] Delivery fan-out failed (non-fatal)', error);
      });
    } catch (error) {
      console.error('[EmployerIntegrationEventService] Failed to record integration event (non-fatal)', error);
    }
  }

  private async recordEvent(params: EmitEventParams): Promise<IEmployerIntegrationEvent> {
    return EmployerIntegrationEvent.create({
      organizationId: params.organizationId,
      applicationId: params.applicationId,
      jobId: params.jobId,
      interviewId: params.interviewId,
      eventType: params.eventType,
      eventVersion: INTEGRATION_EVENT_VERSION,
      payloadVersion: INTEGRATION_PAYLOAD_VERSION,
      occurredAt: new Date(),
      sourceArtifactType: params.sourceArtifactType,
      sourceArtifactId: params.sourceArtifactId,
      data: params.data ? new Map(Object.entries(params.data)) : undefined,
    });
  }
}

export const employerIntegrationEventService = new EmployerIntegrationEventService();
export default employerIntegrationEventService;
