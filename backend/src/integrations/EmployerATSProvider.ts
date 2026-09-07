import { IEmployerIntegrationConnection } from '../models/EmployerIntegrationConnection.model';

/**
 * Provider-neutral ATS adapter contract (31E) — employer hiring-pipeline
 * business logic never depends directly on Greenhouse/Lever/Workday/etc.
 * Only `custom` (a webhook-compatible generic ATS endpoint) is genuinely
 * functional today; every named vendor returns a deterministic
 * `provider_not_implemented` result rather than faking connectivity. This
 * keeps the architecture ready for a real adapter later without touching
 * any caller.
 */
export interface ATSConnectivityResult {
  available: boolean;
  reason?: 'not_configured' | 'provider_not_implemented' | 'ok';
}

export interface ATSPushResult {
  success: boolean;
  reason?: string;
  externalId?: string;
}

export interface ATSApplicationStatusPush {
  internalApplicationId: string;
  status: string;
}

export interface ATSInterviewResultPush {
  internalInterviewId: string;
  status: string;
  reportAvailable: boolean;
}

export interface ATSCandidateReferencePush {
  internalCandidateId: string;
}

export interface EmployerATSProvider {
  readonly provider: string;
  validateConnection(connection: IEmployerIntegrationConnection): Promise<ATSConnectivityResult>;
  pushApplicationStatus(connection: IEmployerIntegrationConnection, params: ATSApplicationStatusPush): Promise<ATSPushResult>;
  pushInterviewResult(connection: IEmployerIntegrationConnection, params: ATSInterviewResultPush): Promise<ATSPushResult>;
  pushCandidateReference(connection: IEmployerIntegrationConnection, params: ATSCandidateReferencePush): Promise<ATSPushResult>;
}

/** Used for every named vendor (greenhouse/lever/workday) — no real SDK/credentials exist in this project, so this NEVER fakes a successful push/connection. */
export class UnimplementedATSProvider implements EmployerATSProvider {
  constructor(public readonly provider: string) {}

  async validateConnection(): Promise<ATSConnectivityResult> {
    return { available: false, reason: 'provider_not_implemented' };
  }

  async pushApplicationStatus(): Promise<ATSPushResult> {
    return { success: false, reason: 'provider_not_implemented' };
  }

  async pushInterviewResult(): Promise<ATSPushResult> {
    return { success: false, reason: 'provider_not_implemented' };
  }

  async pushCandidateReference(): Promise<ATSPushResult> {
    return { success: false, reason: 'provider_not_implemented' };
  }
}

/** `custom` — a webhook-compatible generic ATS endpoint. Actual delivery is handled by `EmployerIntegrationDeliveryService`'s shared signed-HTTP mechanism (via the outbox), never duplicated here — this adapter only reports connectivity. */
export class CustomWebhookATSProvider implements EmployerATSProvider {
  public readonly provider = 'custom';

  async validateConnection(connection: IEmployerIntegrationConnection): Promise<ATSConnectivityResult> {
    if (!connection.config.baseUrl) {
      return { available: false, reason: 'not_configured' };
    }
    return { available: true, reason: 'ok' };
  }

  async pushApplicationStatus(): Promise<ATSPushResult> {
    // Delivered via the standard event outbox (application_status_changed) — this direct-push path is intentionally a structural placeholder for a future non-outbox use case.
    return { success: false, reason: 'use_integration_event_outbox' };
  }

  async pushInterviewResult(): Promise<ATSPushResult> {
    return { success: false, reason: 'use_integration_event_outbox' };
  }

  async pushCandidateReference(): Promise<ATSPushResult> {
    return { success: false, reason: 'use_integration_event_outbox' };
  }
}

export function getATSProvider(provider: string): EmployerATSProvider {
  if (provider === 'custom') return new CustomWebhookATSProvider();
  return new UnimplementedATSProvider(provider);
}
