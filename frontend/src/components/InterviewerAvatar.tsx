import React, { useEffect, useRef, useState } from 'react';
import type { AvatarClip } from '../features/interview/avatar/avatarVideoConfig';
import { isPreloadClip } from '../features/interview/avatar/avatarVideoConfig';
import type { AvatarReactionOutput } from '../features/interview/avatar/avatarReactionManager';
import { prefersReducedMotion } from '../utils/reducedMotion';

// Same static fallback already used by the pre-existing InterviewAvatar —
// reused as-is so "no reusable-video asset available/loaded" degrades to
// the EXACT same known-good visual, never a new fallback asset.
const INTERVIEWER_IMAGE = '/src/assets/media/interviewer-idle.png';

const CROSSFADE_MS = 220;

interface InterviewerAvatarProps {
  /** Output of `useAvatarReactionManager` — this component only renders it, never derives state itself. */
  video: AvatarReactionOutput;
  className?: string;
  /** Same telemetry contract as the pre-existing InterviewAvatar — optional, never affects rendering if it throws. */
  onTelemetryEvent?: (eventType: string, data?: Record<string, string | number | boolean>) => void;
}

const STATE_LABELS: Partial<Record<string, string>> = {
  idle: 'Ready',
  welcome: 'Speaking',
  normalQuestion: 'Speaking',
  probe: 'Speaking',
  transition: 'Speaking',
  clarify: 'Speaking',
  challenge: 'Speaking',
  callback: 'Speaking',
  listening: 'Listening',
  waiting: 'Listening',
  thinking: 'Thinking',
  acknowledge: 'Listening',
  nod: 'Listening',
  smile: 'Listening',
  closing: 'Speaking',
  closingNod: 'Completed',
};
const STATE_DOT: Partial<Record<string, string>> = {
  idle: 'bg-gray-400',
  listening: 'bg-green-400',
  waiting: 'bg-green-400',
  acknowledge: 'bg-green-400',
  nod: 'bg-green-400',
  smile: 'bg-green-400',
  thinking: 'bg-yellow-400',
  closingNod: 'bg-emerald-400',
};

/**
 * Reusable-avatar-video renderer. Visual only: the AI interviewer's actual
 * VOICE remains the existing Google/browser TTS (`useSpeechInterview`/
 * `voiceService`) — this component never plays any audio from its own
 * video elements (always `muted`), and never decides WHEN to speak, only
 * WHAT TO SHOW while speaking/listening/thinking, per `video` (already
 * resolved by `useAvatarReactionManager`).
 *
 * Crossfades between the previous and current clip (plain CSS opacity,
 * ~220ms) to avoid a hard cut/blank-frame; skipped entirely when the user
 * prefers reduced motion (the new clip simply appears). Falls back to the
 * existing static idle image whenever there's no clip to show (idle state)
 * or playback/load fails for any reason — the interview/TTS flow is never
 * blocked by any of this.
 */
export const InterviewerAvatar: React.FC<InterviewerAvatarProps> = ({ video, className = '', onTelemetryEvent }) => {
  const emitTelemetry = (eventType: string, data?: Record<string, string | number | boolean>) => {
    try {
      onTelemetryEvent?.(eventType, data);
    } catch {
      // Telemetry must never affect avatar rendering/playback.
    }
  };

  const reducedMotion = prefersReducedMotion();

  const [current, setCurrent] = useState<AvatarClip | null>(video.clip);
  const [previous, setPrevious] = useState<AvatarClip | null>(null);
  const [fadingIn, setFadingIn] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const fadeTimerRef = useRef<number | null>(null);

  const currentVideoRef = useRef<HTMLVideoElement>(null);

  // Swap in a new clip with a short crossfade whenever the resolved clip
  // (by id) actually changes — never on every render of the same clip.
  useEffect(() => {
    const nextId = video.clip?.id ?? null;
    const currentId = current?.id ?? null;
    if (nextId === currentId) return;

    setPlaybackBlocked(false);
    if (reducedMotion || !current) {
      setCurrent(video.clip);
      setPrevious(null);
      return;
    }

    setPrevious(current);
    setCurrent(video.clip);
    setFadingIn(false);
    // Next tick, trigger the opacity transition to 1.
    const raf = requestAnimationFrame(() => setFadingIn(true));
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => setPrevious(null), CROSSFADE_MS);
    return () => {
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.clip?.id]);

  useEffect(() => () => {
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
  }, []);

  // Attempt to play the current clip whenever it (or the loop flag) changes.
  useEffect(() => {
    const el = currentVideoRef.current;
    if (!el || !current) return;
    el.loop = video.loop;
    el.currentTime = 0;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err) => {
        setPlaybackBlocked(true);
        emitTelemetry('AVATAR_AUTOPLAY_BLOCKED', { reason: err?.name ? String(err.name) : 'unknown' });
        emitTelemetry('AVATAR_FALLBACK_USED', { fallbackType: 'autoplay_blocked' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, video.loop]);

  const showVideo = !mediaError && !!current && !playbackBlocked;
  const label = STATE_LABELS[video.videoState] ?? 'Ready';
  const dotColor = STATE_DOT[video.videoState] ?? 'bg-gray-400';

  return (
    <div className={`relative w-full h-full bg-gray-900 overflow-hidden ${className}`}>
      {!mediaError ? (
        <>
          {previous && !reducedMotion && (
            <video
              key={`prev-${previous.id}`}
              src={previous.src}
              muted
              playsInline
              preload={isPreloadClip(previous) ? 'auto' : 'metadata'}
              className="absolute inset-0 w-full h-full object-cover object-center transition-opacity ease-linear"
              style={{
                transitionDuration: `${CROSSFADE_MS}ms`,
                opacity: fadingIn ? 0 : 1,
                transform: previous.mirrored ? 'scaleX(-1)' : undefined,
              }}
            />
          )}

          {current && (
            <video
              key={current.id}
              ref={currentVideoRef}
              src={current.src}
              muted
              playsInline
              preload={isPreloadClip(current) ? 'auto' : 'metadata'}
              onError={() => {
                setMediaError(true);
                emitTelemetry('AVATAR_VIDEO_LOAD_FAILED', { clipId: current.id });
              }}
              className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity ease-linear ${
                showVideo ? '' : 'opacity-0'
              }`}
              style={{
                transitionDuration: `${CROSSFADE_MS}ms`,
                opacity: showVideo ? (reducedMotion || !previous ? 1 : fadingIn ? 1 : 0) : 0,
                transform: current.mirrored ? 'scaleX(-1)' : undefined,
              }}
            />
          )}

          {/* Static fallback — shown whenever there's no clip (idle) or playback was blocked. */}
          <img
            src={INTERVIEWER_IMAGE}
            alt="Interviewer"
            onError={() => {
              setMediaError(true);
              emitTelemetry('AVATAR_FALLBACK_USED', { fallbackType: 'media_missing' });
            }}
            className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300"
            style={{ opacity: showVideo ? 0 : 1 }}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white text-center p-8">
          <div>
            <div className="text-6xl mb-4">🎤</div>
            <div className="text-sm opacity-75">Interviewer avatar unavailable</div>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none">
        <span className="text-sm font-semibold text-white drop-shadow">AI Interviewer</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/35 px-2.5 py-1 rounded-full">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          {label}
        </span>
      </div>
    </div>
  );
};
