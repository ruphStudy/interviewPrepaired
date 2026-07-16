import React, { useMemo } from 'react';
import Lottie from 'lottie-react';
import { AvatarState } from './AvatarState';

import speakingAnimation from '../../assets/animations/speaking-avatar.json';
import listeningAnimation from '../../assets/animations/listening-avatar.json';
import thinkingAnimation from '../../assets/animations/thinking-avatar.json';
import idleAnimation from '../../assets/animations/idle-avatar.json';
import completedAnimation from '../../assets/animations/completed-avatar.json';

interface InterviewAvatarProps {
  currentState: AvatarState;
  className?: string;
}

export const InterviewAvatar: React.FC<InterviewAvatarProps> = ({
  currentState,
  className = '',
}) => {
  const getStateConfig = () => {
    switch (currentState) {
      case AvatarState.SPEAKING:
        return {
          animation: speakingAnimation,
          gradient: 'from-blue-500 via-purple-500 to-pink-500',
          label: 'SPEAKING',
          ringColor: 'border-blue-400',
          ringAnimation: 'animate-ping',
        };
      case AvatarState.LISTENING:
        return {
          animation: listeningAnimation,
          gradient: 'from-green-500 via-teal-500 to-blue-500',
          label: 'LISTENING',
          ringColor: 'border-green-400',
          ringAnimation: 'animate-pulse',
        };
      case AvatarState.THINKING:
        return {
          animation: thinkingAnimation,
          gradient: 'from-yellow-500 via-orange-500 to-red-500',
          label: 'THINKING',
          ringColor: 'border-yellow-400',
          ringAnimation: 'animate-spin',
        };
      case AvatarState.COMPLETED:
        return {
          animation: completedAnimation,
          gradient: 'from-green-400 via-emerald-500 to-teal-600',
          label: 'COMPLETED',
          ringColor: 'border-green-300',
          ringAnimation: 'animate-bounce',
        };
      case AvatarState.IDLE:
      default:
        return {
          animation: idleAnimation,
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
        {/* Main Avatar Circle */}
        <div
          className={`relative w-80 h-80 rounded-full bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-2xl transform transition-all duration-500 hover:scale-105`}
        >
          {/* Glow Effect */}
          <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-pulse" />
          
          {/* Lottie Animation */}
          <div className="relative z-10 w-72 h-72 flex items-center justify-center">
            <Lottie
              animationData={config.animation}
              loop={currentState !== AvatarState.COMPLETED}
              autoplay
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>

        {/* Animated Ring */}
        <div
          className={`absolute inset-0 rounded-full border-4 ${config.ringColor} ${config.ringAnimation}`}
          style={{ opacity: 0.6 }}
        />

        {/* Outer Glow Ring */}
        <div
          className={`absolute -inset-4 rounded-full border-2 ${config.ringColor} opacity-30 animate-pulse`}
        />
      </div>

      {/* State Label */}
      <div className="mt-8 text-center">
        <div className="relative">
          <span className={`
            inline-block px-8 py-3 rounded-full text-lg font-bold uppercase tracking-widest
            bg-gradient-to-r ${config.gradient} text-white shadow-lg
            transform transition-all duration-300 hover:scale-110
          `}>
            {config.label}
          </span>
          <div className={`absolute inset-0 rounded-full bg-gradient-to-r ${config.gradient} blur-xl opacity-50 animate-pulse`} />
        </div>
      </div>
    </div>
  );
};
