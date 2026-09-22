/**
 * Phase 13 (13B) — pure, framework-free client telemetry buffer.
 *
 * Mirrors this repo's established "pure/testable core, thin React wrapper"
 * pattern (e.g. `executeAudioPlan` in useAudioPlaybackQueue.ts,
 * `selectMicroBehavior` in microBehaviorScheduler.ts): NO React, no module
 * state, no I/O. `useClientTelemetry.ts` is the thin hook that owns a
 * buffer instance + the actual (fire-and-forget) network call.
 *
 * This module NEVER sends candidate answer/question text — only bounded,
 * already-explicit structured fields (event type, an optional
 * questionNumber, and a small `data` map of already-primitive values).
 *
 * Timing discipline: every `durationMs`-shaped value a caller puts into
 * `data` must be computed ENTIRELY client-side via `performance.now()`
 * deltas (monotonic) — this module never compares a client timestamp
 * against a server one. `occurredAt` below is a plain `Date.now()` epoch ms,
 * used only for record-keeping/ordering on the server, never for a duration
 * calculation.
 */

export type ClientTelemetryEventType =
  | 'ANSWER_ROUND_TRIP_MEASURED'
  | 'TTS_PLAYBACK_STARTED'
  | 'TTS_PLAYBACK_COMPLETED'
  | 'TTS_BROWSER_FALLBACK'
  | 'STALE_AUDIO_PLAN_DISCARDED'
  | 'AVATAR_STATE_CHANGED'
  | 'AVATAR_VIDEO_LOAD_FAILED'
  | 'AVATAR_AUTOPLAY_BLOCKED'
  | 'AVATAR_FALLBACK_USED'
  | 'MICRO_BEHAVIOR_TRIGGERED';

export type ClientTelemetryDataValue = string | number | boolean;

export interface ClientTelemetryEvent {
  eventType: ClientTelemetryEventType;
  /** 1-based displayed question number this event relates to, when known. */
  questionNumber?: number;
  /** `Date.now()` at the moment this event was recorded — record-keeping/ordering only. */
  occurredAt: number;
  /** Bounded, already-primitive values only — never raw answer/question text. */
  data?: Record<string, ClientTelemetryDataValue>;
}

export const DEFAULT_TELEMETRY_BUFFER_MAX_SIZE = 20;

export interface TelemetryBuffer {
  /** Appends one event; returns true when the buffer has reached its bound and a flush is now due. */
  push(event: ClientTelemetryEvent): boolean;
  /** Removes and returns every buffered event, resetting the buffer to empty. */
  drain(): ClientTelemetryEvent[];
  size(): number;
}

/**
 * A small, bounded, in-memory FIFO buffer — pure data structure, no timers,
 * no network. `maxSize` caps how many events accumulate before `push`
 * signals a flush is due (the caller — `useClientTelemetry` — decides what
 * "flush" actually does).
 */
export function createTelemetryBuffer(maxSize: number = DEFAULT_TELEMETRY_BUFFER_MAX_SIZE): TelemetryBuffer {
  let events: ClientTelemetryEvent[] = [];
  const bound = Math.max(1, maxSize);

  return {
    push(event: ClientTelemetryEvent): boolean {
      events.push(event);
      if (events.length > bound) events = events.slice(events.length - bound);
      return events.length >= bound;
    },
    drain(): ClientTelemetryEvent[] {
      const drained = events;
      events = [];
      return drained;
    },
    size(): number {
      return events.length;
    },
  };
}
