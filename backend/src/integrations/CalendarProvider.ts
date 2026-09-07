import { IEmployerIntegrationConnection } from '../models/EmployerIntegrationConnection.model';
import { IEmployerInterviewCalendarEvent } from '../models/EmployerInterviewCalendarEvent.model';

/**
 * Provider-neutral calendar adapter contract (31E). This project has no
 * existing Google/Microsoft OAuth credentials or SDK, so
 * `UnconfiguredCalendarProvider` is the only implementation wired up —
 * it NEVER fakes remote event creation. The local
 * `EmployerInterviewCalendarEvent` record (plus its `.ics` export) remains
 * fully useful on its own regardless of provider sync state.
 */
export interface CalendarSyncResult {
  synced: boolean;
  externalEventId?: string;
  reason?: 'not_configured' | 'provider_not_implemented' | 'ok';
  errorMessage?: string;
}

export interface CalendarProvider {
  readonly provider: string;
  validateConnection(connection: IEmployerIntegrationConnection): Promise<CalendarSyncResult>;
  createEvent(connection: IEmployerIntegrationConnection, event: IEmployerInterviewCalendarEvent): Promise<CalendarSyncResult>;
  updateEvent(connection: IEmployerIntegrationConnection, event: IEmployerInterviewCalendarEvent): Promise<CalendarSyncResult>;
  cancelEvent(connection: IEmployerIntegrationConnection, event: IEmployerInterviewCalendarEvent): Promise<CalendarSyncResult>;
}

/** Used for every calendar provider today (google_calendar/microsoft_calendar) — no OAuth infrastructure exists, so this never claims a successful remote sync. */
export class UnconfiguredCalendarProvider implements CalendarProvider {
  constructor(public readonly provider: string) {}

  async validateConnection(): Promise<CalendarSyncResult> {
    return { synced: false, reason: 'not_configured' };
  }

  async createEvent(): Promise<CalendarSyncResult> {
    return { synced: false, reason: 'provider_not_implemented' };
  }

  async updateEvent(): Promise<CalendarSyncResult> {
    return { synced: false, reason: 'provider_not_implemented' };
  }

  async cancelEvent(): Promise<CalendarSyncResult> {
    return { synced: false, reason: 'provider_not_implemented' };
  }
}

export function getCalendarProvider(provider: string): CalendarProvider {
  return new UnconfiguredCalendarProvider(provider);
}
