import { useCallback, useEffect, useRef } from 'react';
import { interviewApi } from '../api/interviewApi';
import {
  ClientTelemetryDataValue,
  ClientTelemetryEventType,
  createTelemetryBuffer,
} from '../utils/clientTelemetry';

/**
 * Phase 13 (13B) — the thin React wrapper around `utils/clientTelemetry.ts`'s
 * pure buffer. Owns the ONLY network call this phase's frontend telemetry
 * ever makes (`interviewApi.postClientTelemetry`), and that call is
 * FIRE-AND-FORGET BY CONSTRUCTION: `flush()` never returns a promise the
 * caller is expected to await, and any network failure is silently
 * swallowed right here — a telemetry failure must never surface as an
 * interview-UI error or block the candidate from continuing. This is the
 * single most important correctness property of 13B; see this phase's
 * report for how it's verified.
 *
 * Batching: events accumulate in the bounded buffer and flush (a) when the
 * buffer fills, (b) on a periodic timer, or (c) whenever the caller invokes
 * `flush()` explicitly (e.g. at a turn boundary) — never one HTTP request
 * per micro-event.
 */

const FLUSH_INTERVAL_MS = 15_000;

export interface RecordTelemetryFields {
  questionNumber?: number;
  data?: Record<string, ClientTelemetryDataValue>;
}

export interface UseClientTelemetryReturn {
  record: (eventType: ClientTelemetryEventType, fields?: RecordTelemetryFields) => void;
  /** Best-effort, fire-and-forget — never throws, never returns a value the caller need act on. */
  flush: () => void;
}

export function useClientTelemetry(interviewId: string | undefined): UseClientTelemetryReturn {
  const bufferRef = useRef(createTelemetryBuffer());
  const interviewIdRef = useRef(interviewId);
  interviewIdRef.current = interviewId;

  const flush = useCallback(() => {
    const id = interviewIdRef.current;
    const events = bufferRef.current.drain();
    if (!id || events.length === 0) return;
    // Deliberately not awaited/returned — a caller that awaited this could
    // accidentally gate interview progression on a network call that exists
    // purely for observability. `.catch` here (rather than letting the
    // rejection propagate) is what makes this genuinely fire-and-forget
    // rather than merely "not awaited" (an unawaited-but-uncaught promise
    // would still surface as an unhandled rejection).
    void interviewApi.postClientTelemetry(id, events).catch(() => undefined);
  }, []);

  const record = useCallback(
    (eventType: ClientTelemetryEventType, fields?: RecordTelemetryFields) => {
      let due = false;
      try {
        due = bufferRef.current.push({
          eventType,
          questionNumber: fields?.questionNumber,
          occurredAt: Date.now(),
          data: fields?.data,
        });
      } catch {
        // Telemetry must never throw into a call site that's mid-interview-flow.
        return;
      }
      if (due) flush();
    },
    [flush]
  );

  useEffect(() => {
    const intervalId = window.setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { record, flush };
}
