import { useCallback, useRef } from 'react';
import { voiceService } from '../services/voice.service';
import { AudioPlanItem } from '../utils/audioPlanBuilder';
import { buildTtsCacheKey, noopTtsCache, TtsCache } from '../utils/ttsCache';

/**
 * Phase 9C — a single controlled queue that plays an `AudioPlanItem[]`
 * sequentially, replacing Phase 8's inline sequential `await
 * voiceService.speak(...)` calls in `InterviewScreen.tsx`'s
 * `speakPresentationSequence` with a typed, reusable module.
 *
 * `executeAudioPlan` below is the pure, framework-free stepping engine
 * (no `useRef`/`useCallback`) — directly exercised by a scratch harness
 * (this repo has no frontend test runner; see this phase's report) the same
 * way `presentationReducer` was extracted out of
 * `useInterviewPresentationState` for pure-function testability.
 * `useAudioPlaybackQueue` is a thin React wrapper that only owns the
 * monotonic `playToken` (so a second `play()` call retires an
 * still-in-flight previous one) and folds it into the `isCurrent` predicate
 * passed to `executeAudioPlan`.
 *
 * Generation/staleness: this module mints NO generation ids of its own — it
 * reuses whatever `isCurrent()` predicate the caller supplies (built from
 * `useInterviewPresentationState`'s exact `isRequestCurrent`/
 * `isQuestionCurrent` + the mounted ref), per this phase's explicit
 * instruction not to mint a second, parallel id scheme. `isCurrent` is
 * re-checked before EVERY item and immediately after every `await` inside
 * `executeAudioPlan`, so a stale `play()` call (an outer generation that
 * moved on while a pause/utterance was in flight) always stops advancing —
 * a "stale onEnded" can never resume progress once `isCurrent()` goes
 * false, matching Phase 7's exact no-op-on-stale-action contract.
 *
 * Single active stream: `voiceService.speak()` already calls
 * `this.synthesis.cancel()` at the very top of every invocation (Phase 7's
 * finding, unchanged), so two `browser_tts`/`dynamic_tts`(-degraded)/
 * `asset`(-degraded) items can never audibly overlap. `cancel()` below
 * additionally stops mid-utterance playback immediately (e.g. on
 * unmount/retry/interview-end) rather than waiting for the current item to
 * finish first.
 */

export interface PlayAudioPlanOptions {
  /** Re-checked before EVERY item and after every await — must reflect Phase 7's exact generation guard (e.g. `() => isMountedRef.current && isRequestCurrent(requestGeneration)`). */
  isCurrent: () => boolean;
  /** The existing `speak` from `useSpeechInterview` — this queue never talks to `voiceService` directly for actual utterances, so there is still exactly ONE TTS call path in the app. */
  speak: (text: string, onEnd?: () => void, options?: { rate?: number; pitch?: number }) => Promise<void>;
  locale?: string;
  ttsCache?: TtsCache;
  /**
   * Phase 10B — real item-boundary lifecycle hooks, so a consumer (the
   * avatar controller) can react to genuine start/end events instead of a
   * guessed timeout. Both are called ONLY when `isCurrent()` is still true
   * at the moment of the call (checked immediately before invoking each) —
   * a stale item event (an outer generation that has since moved on) is
   * always a silent no-op, matching every other callback in this module.
   * `onItemStart` fires for every item (including `pause`/`silence`, with
   * no useful `avatarState` on those); `onItemEnd` fires once that item's
   * own action has settled (even when it threw — TTS failure must never
   * block progression, matching this function's existing contract), UNLESS
   * `isCurrent()` went false while the item's action was in flight, in
   * which case — same as every other point in this loop — the event is
   * dropped rather than reporting a stale item as finished. A consumer
   * should therefore treat `onItemStart`/`onItemEnd` as paired only while
   * the plan keeps running to completion, never assume a start it saw is
   * guaranteed a matching end once the plan has been cancelled.
   */
  onItemStart?: (item: AudioPlanItem) => void;
  onItemEnd?: (item: AudioPlanItem) => void;
}

export type PlaybackOutcome = 'completed' | 'cancelled';

export function wait(ms: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Pure stepping engine — no React, no module-level state. Executes `plan`
 * item-by-item, checking `options.isCurrent()` before every item and after
 * every `await`, returning `'cancelled'` the instant it goes false (never
 * executing a further item) and `'completed'` only if every item ran with
 * `isCurrent()` still true throughout.
 */
export async function executeAudioPlan(plan: AudioPlanItem[], options: PlayAudioPlanOptions): Promise<PlaybackOutcome> {
  const cache = options.ttsCache ?? noopTtsCache;
  const locale = options.locale ?? 'en-IN';

  for (const item of plan) {
    if (!options.isCurrent()) return 'cancelled';
    if (options.isCurrent()) options.onItemStart?.(item);

    switch (item.type) {
      case 'pause': {
        await wait(item.durationMs);
        break;
      }

      case 'browser_tts': {
        if (!options.isCurrent()) return 'cancelled';
        try {
          await options.speak(item.text, undefined, { rate: item.rate, pitch: item.pitch });
        } catch {
          // TTS is an enhancement — a failure must never block the interview.
        }
        break;
      }

      case 'dynamic_tts': {
        // Honest degrade (see AudioRoutingService.ts's header): no
        // dynamic TTS provider exists anywhere in this codebase today.
        // The cache is checked first purely so the seam is real and
        // testable — `noopTtsCache` always misses, so this always falls
        // through to the exact same browser_tts path.
        const key = buildTtsCacheKey({ text: item.text, locale, provider: 'browser_tts', voice: 'auto', rate: item.rate ?? 1 });
        const cached = cache.get(key);
        if (!cached) {
          if (!options.isCurrent()) return 'cancelled';
          try {
            await options.speak(item.text, undefined, { rate: item.rate, pitch: item.pitch });
          } catch {
            // Non-blocking.
          }
        }
        break;
      }

      case 'asset': {
        // Honest degrade: no manifest entry is ever `enabled`/has a real
        // `url` today (backend/src/constants/audioAssetManifest.ts), so
        // this always falls back to speaking `fallbackText` — never a
        // silent drop of the segment.
        if (!options.isCurrent()) return 'cancelled';
        try {
          await options.speak(item.fallbackText, undefined, { rate: item.rate, pitch: item.pitch });
        } catch {
          // Non-blocking.
        }
        break;
      }

      case 'silence':
        break;

      default:
        break;
    }

    if (options.isCurrent()) options.onItemEnd?.(item);
    if (!options.isCurrent()) return 'cancelled';
  }

  return options.isCurrent() ? 'completed' : 'cancelled';
}

export interface UseAudioPlaybackQueueReturn {
  play: (plan: AudioPlanItem[], options: PlayAudioPlanOptions) => Promise<PlaybackOutcome>;
  cancel: () => void;
}

export function useAudioPlaybackQueue(): UseAudioPlaybackQueueReturn {
  const tokenRef = useRef(0);

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    voiceService.stopSpeaking();
  }, []);

  const play = useCallback((plan: AudioPlanItem[], options: PlayAudioPlanOptions): Promise<PlaybackOutcome> => {
    const myToken = ++tokenRef.current; // retires any still-in-flight previous play()
    const isCurrent = () => tokenRef.current === myToken && options.isCurrent();
    return executeAudioPlan(plan, { ...options, isCurrent });
  }, []);

  return { play, cancel };
}
