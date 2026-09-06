import React, { useEffect, useRef } from 'react';
import { useInterviewerAvatar, InterviewerSpeakingContext } from './useInterviewerAvatar';

interface InterviewAvatarProps {
  /** Interviewer/system TTS is currently playing. */
  isSpeaking: boolean;
  /** Candidate's microphone/speech recognition is currently active. */
  isListening: boolean;
  /** Coarse context for SPEAKING clip selection (welcome/question/closing) — read from the existing interview phase, not new business logic. */
  speakingContext?: InterviewerSpeakingContext;
  /** Changing this resets avatar behavior state for a brand-new interview session. */
  resetKey?: string | number | null;
  className?: string;
}

const STATE_LABELS: Record<string, { label: string; dotColor: string }> = {
  SPEAKING: { label: 'Speaking', dotColor: 'bg-blue-400' },
  LISTENING: { label: 'Listening', dotColor: 'bg-green-400' },
  INTERRUPTION: { label: 'Listening', dotColor: 'bg-green-400' },
  IDLE: { label: 'Ready', dotColor: 'bg-gray-400' },
};

export const InterviewAvatar: React.FC<InterviewAvatarProps> = ({
  isSpeaking,
  isListening,
  speakingContext,
  resetKey,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { semanticState, mediaSrc, isVideo, handleClipEnded } = useInterviewerAvatar({
    isSpeaking,
    isListening,
    speakingContext,
    resetKey,
  });

  // A new clip src means a new file — always (re)start it from the top
  // rather than relying on the browser to notice the `src` changed mid-seek.
  useEffect(() => {
    if (isVideo && videoRef.current) {
      const video = videoRef.current;
      video.currentTime = 0;
      video.play().catch((err) => {
        console.warn('Interviewer video play failed:', err);
      });
    }
  }, [mediaSrc, isVideo]);

  const config = STATE_LABELS[semanticState] || STATE_LABELS.IDLE;

  return (
    <div className={`relative w-full h-full bg-gray-900 overflow-hidden ${className}`}>
      {/* ONE persistent media container — dimensions never change between
          idle image and any MP4 state, so switching states never reflows
          or flashes the panel. */}
      {isVideo ? (
        <video
          key={mediaSrc}
          ref={videoRef}
          src={mediaSrc}
          muted
          playsInline
          autoPlay
          onEnded={handleClipEnded}
          onError={handleClipEnded}
          className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-200"
        />
      ) : (
        <img
          key={mediaSrc}
          src={mediaSrc}
          alt="Interviewer"
          className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-200"
        />
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
