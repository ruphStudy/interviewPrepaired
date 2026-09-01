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

  const getStateConfig = () => {
    switch (currentState) {
      case AvatarState.SPEAKING:
        return {
          gradient: 'from-blue-500 via-purple-500 to-pink-500',
          label: 'SPEAKING',
          ringColor: 'border-blue-400',
          ringAnimation: 'animate-ping',
        };
      case AvatarState.LISTENING:
        return {
          gradient: 'from-green-500 via-teal-500 to-blue-500',
          label: 'LISTENING',
          ringColor: 'border-green-400',
          ringAnimation: 'animate-pulse',
        };
      case AvatarState.THINKING:
        return {
          gradient: 'from-yellow-500 via-orange-500 to-red-500',
          label: 'THINKING',
          ringColor: 'border-yellow-400',
          ringAnimation: 'animate-spin',
        };
      case AvatarState.COMPLETED:
        return {
          gradient: 'from-green-400 via-emerald-500 to-teal-600',
          label: 'COMPLETED',
          ringColor: 'border-green-300',
          ringAnimation: 'animate-bounce',
        };
      case AvatarState.IDLE:
      default:
        return {
          gradient: 'from-gray-500 via-gray-600 to-gray-700',
          label: 'READY',
          ringColor: 'border-gray-400',
          ringAnimation: '',
        };
    }
  };

  const config = getStateConfig();

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Avatar Container */}
      <div className="relative">
        {/* Main Avatar Circle — sized to fit within the screen's constrained
            height (max-h-[60vh] on the parent) with room left for the state
            chip below and the question card/controls that follow; a fixed
            32rem circle used to overflow that budget and collide with them. */}
        <div
          className={`relative w-40 h-40 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-2xl transform transition-all duration-500 overflow-hidden`}
        >
          {/* Glow Effect */}
          <div className="absolute inset-0 rounded-full bg-white opacity-10 animate-pulse" />
          
          {/* Video or Image Content */}
          <div className="relative z-10 w-full h-full flex items-center justify-center overflow-hidden rounded-full">
            {!mediaError ? (
              <>
                {/* Video - shown when SPEAKING */}
                <video
                  ref={videoRef}
                  src={INTERVIEWER_VIDEO}
                  loop
                  muted
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                    showVideo ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ display: showVideo ? 'block' : 'none' }}
                />
                
                {/* Static Image - shown when NOT speaking */}
                <img
                  src={INTERVIEWER_IMAGE}
                  alt="Interviewer"
                  onError={() => setMediaError(true)}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                    !showVideo ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ display: !showVideo ? 'block' : 'none' }}
                />
              </>
            ) : (
              /* Fallback - show placeholder when media files are missing */
              <div className="text-white text-center p-8">
                <div className="text-6xl mb-4">🎤</div>
                <div className="text-sm opacity-75">
                  Add media files to:<br/>
                  /assets/media/
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Animated Ring */}
        <div
          className={`absolute inset-0 rounded-full border-4 ${config.ringColor} ${config.ringAnimation}`}
          style={{ opacity: 0.5 }}
        />

        {/* Outer Glow Ring */}
        <div
          className={`absolute -inset-6 rounded-full border-2 ${config.ringColor} opacity-20 animate-pulse`}
        />
      </div>

      {/* State Label — a compact chip, not a second large stacked pill, so
          this block's total height stays small and predictable. */}
      <div className="mt-3 text-center">
        <span className={`
          inline-block px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest
          bg-gradient-to-r ${config.gradient} text-white shadow-md
        `}>
          {config.label}
        </span>
      </div>
    </div>
  );
};
