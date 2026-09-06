import React, { useEffect, useRef, useState } from 'react';
import { AvatarState } from './AvatarState';

// Import media files (will use dynamic imports with error handling)
const INTERVIEWER_VIDEO = '/src/assets/media/interviewer-speaking.mp4';
const INTERVIEWER_IMAGE = '/src/assets/media/interviewer-idle.png';

interface InterviewAvatarProps {
  currentState: AvatarState;
  className?: string;
}

export const InterviewAvatar: React.FC<InterviewAvatarProps> = ({
  currentState,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [mediaError, setMediaError] = useState(false);

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
    setShowVideo(shouldPlayVideo);

    if (videoRef.current && isVideoLoaded) {
      if (shouldPlayVideo) {
        videoRef.current.play().catch(err => {
          console.warn('Video play failed:', err);
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0; // Reset to start
      }
    }
  }, [currentState, isVideoLoaded]);

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
          {/* Video - shown when SPEAKING */}
          <video
            ref={videoRef}
            src={INTERVIEWER_VIDEO}
            loop
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
              showVideo ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ display: showVideo ? 'block' : 'none' }}
          />

          {/* Static Image - shown when NOT speaking */}
          <img
            src={INTERVIEWER_IMAGE}
            alt="Interviewer"
            onError={() => setMediaError(true)}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
              !showVideo ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ display: !showVideo ? 'block' : 'none' }}
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
