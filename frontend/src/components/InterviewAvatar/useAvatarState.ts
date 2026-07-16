import { useState, useCallback } from 'react';
import { AvatarState } from './AvatarState';

export interface UseAvatarStateReturn {
  avatarState: AvatarState;
  setAvatarState: (state: AvatarState) => void;
  setToSpeaking: () => void;
  setToListening: () => void;
  setToThinking: () => void;
  setToIdle: () => void;
  setToCompleted: () => void;
}

export const useAvatarState = (initialState: AvatarState = AvatarState.IDLE): UseAvatarStateReturn => {
  const [avatarState, setAvatarState] = useState<AvatarState>(initialState);

  const setToSpeaking = useCallback(() => {
    console.log('[Avatar] State: SPEAKING');
    setAvatarState(AvatarState.SPEAKING);
  }, []);

  const setToListening = useCallback(() => {
    console.log('[Avatar] State: LISTENING');
    setAvatarState(AvatarState.LISTENING);
  }, []);

  const setToThinking = useCallback(() => {
    console.log('[Avatar] State: THINKING');
    setAvatarState(AvatarState.THINKING);
  }, []);

  const setToIdle = useCallback(() => {
    console.log('[Avatar] State: IDLE');
    setAvatarState(AvatarState.IDLE);
  }, []);

  const setToCompleted = useCallback(() => {
    console.log('[Avatar] State: COMPLETED');
    setAvatarState(AvatarState.COMPLETED);
  }, []);

  return {
    avatarState,
    setAvatarState,
    setToSpeaking,
    setToListening,
    setToThinking,
    setToIdle,
    setToCompleted,
  };
};
