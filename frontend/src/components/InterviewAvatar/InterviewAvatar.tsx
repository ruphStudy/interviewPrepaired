import React, { useEffect, useRef, useState } from 'react';
import { AvatarState } from './AvatarState';

// Import media files (will use dynamic imports with error handling)
const INTERVIEWER_VIDEO = '/src/assets/media/interviewer-speaking.mp4';
const INTERVIEWER_IMAGE = '/src/assets/media/interviewer-idle.png';

interface InterviewAvatarProps {
  currentState: AvatarState;
  className?: string;
  /**
   * Phase 10C — optional, purely cosmetic scheduling output from
   * `useAvatarPresentationController`/`utils/microBehaviorScheduler.ts`.
   * No visual asset exists for `BLINK`/`DISTRACTED_LOOK` today, so only
   * `SMALL_NOD` gets a real (subtle, CSS-only, asset-free) treatment here;
   * the others are honestly scheduled but not yet visually realized.
   * Omitting this prop entirely preserves the exact pre-Phase-10 contract.
   */
  currentMicroBehavior?: 'SMALL_NOD' | 'BLINK' | 'DISTRACTED_LOOK' | null;
}

export const InterviewAvatar: React.FC<InterviewAvatarProps> = ({
  currentState,
  className = '',
  currentMicroBehavior = null,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  // Phase 10B — distinct from `mediaError` (missing/corrupt file, permanent):
  // this tracks a rejected `play()` call (autoplay policy, transient) for
  // the CURRENT attempt only, so a failed play falls back to the idle image
  // instead of leaving the video element visible-but-frozen/silent, which
  // would look like the avatar is mid-speech when nothing is playing.
  const [videoPlaybackBlocked, setVideoPlaybackBlocked] = useState(false);
  const [nodPulse, setNodPulse] = useState(false);

  // Preload video on component mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      const handleCanPlay = () => setIsVideoLoaded(true);
      const handleError = () => {
        console.warn('Video failed to load, using fallback');
        setMediaError(true);
      };

      videoRef.current.addEventListener('canplaythrough', handleCanPlay);
      videoRef.current.addEventListener('error', handleError);

      return () => {
        videoRef.current?.removeEventListener('canplaythrough', handleCanPlay);
        videoRef.current?.removeEventListener('error', handleError);
      };
    }
  }, []);

  // Control video playback based on state
  useEffect(() => {
    const shouldPlayVideo = currentState === AvatarState.SPEAKING;
    // Every fresh attempt to show the video starts unblocked — a previous
    // rejection must never permanently pin the avatar to the idle fallback
    // once a NEW SPEAKING span begins.
    if (shouldPlayVideo) setVideoPlaybackBlocked(false);
    setShowVideo(shouldPlayVideo);

    if (videoRef.current && isVideoLoaded) {
      if (shouldPlayVideo) {
        videoRef.current.play().catch(err => {
          console.warn('Video play failed:', err);
          // Autoplay-blocked (or any other rejection): fall back to the
          // static idle image for THIS attempt rather than leaving a
          // paused/silent video element visually presented as "speaking".
          setVideoPlaybackBlocked(true);
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0; // Reset to start
      }
    }
  }, [currentState, isVideoLoaded]);

  // SMALL_NOD is the one micro-behavior with a real, honest, asset-free
  // visual today — a brief, subtle vertical nudge on the existing idle
  // image. BLINK/DISTRACTED_LOOK intentionally render nothing (see the
  // `currentMicroBehavior` prop doc above) — an unconvincing half-effect
  // would be worse than doing nothing, per this phase's explicit guidance.
  useEffect(() => {
    if (currentMicroBehavior !== 'SMALL_NOD') return undefined;
    setNodPulse(true);
    const timer = window.setTimeout(() => setNodPulse(false), 550);
    return () => window.clearTimeout(timer);
  }, [currentMicroBehavior]);

  const effectiveShowVideo = showVideo && !videoPlaybackBlocked;

  // Presentation-only: a compact video-call-style state indicator overlaid
  // on the media itself. Does not touch avatar/interview state logic.
  const getStateConfig = () => {
    switch (currentState) {
      case AvatarState.SPEAKING:
        return { label: 'Speaking', dotColor: 'bg-blue-400' };
      case AvatarState.LISTENING:
        return { label: 'Listening', dotColor: 'bg-green-400' };
      case AvatarState.THINKING:
        return { label: 'Thinking', dotColor: 'bg-yellow-400' };
      case AvatarState.COMPLETED:
        return { label: 'Completed', dotColor: 'bg-emerald-400' };
      case AvatarState.IDLE:
      default:
        return { label: 'Ready', dotColor: 'bg-gray-400' };
    }
  };

  const config = getStateConfig();

  return (
    <div className={`relative w-full h-full bg-gray-900 overflow-hidden ${className}`}>
      {!mediaError ? (
        <>
          {/* Video - shown when SPEAKING and actually playing */}
          <video
            ref={videoRef}
            src={INTERVIEWER_VIDEO}
            loop
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
              effectiveShowVideo ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ display: effectiveShowVideo ? 'block' : 'none' }}
          />

          {/* Static Image - shown whenever the video isn't (not speaking, OR play() was rejected) */}
          <img
            src={INTERVIEWER_IMAGE}
            alt="Interviewer"
            onError={() => setMediaError(true)}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-all duration-300 ${
              !effectiveShowVideo ? 'opacity-100' : 'opacity-0'
            } ${nodPulse ? 'translate-y-1' : 'translate-y-0'}`}
            style={{ display: !effectiveShowVideo ? 'block' : 'none' }}
          />
        </>
      ) : (
        /* Fallback - show placeholder when media files are missing */
        <div className="absolute inset-0 flex items-center justify-center text-white text-center p-8">
          <div>
            <div className="text-6xl mb-4">🎤</div>
            <div className="text-sm opacity-75">
              Add media files to:<br />
              /assets/media/
            </div>
          </div>
        </div>
      )}

      {/* Video-call style overlay: interviewer name + compact state chip,
          bottom-left, over a subtle gradient so the person's face stays clear. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none">
        <span className="text-sm font-semibold text-white drop-shadow">AI Interviewer</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-black/35 px-2.5 py-1 rounded-full">
          <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
          {config.label}
        </span>
      </div>
    </div>
  );
};
