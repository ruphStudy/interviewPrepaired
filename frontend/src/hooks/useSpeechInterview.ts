import { useState, useCallback, useRef, useEffect } from 'react';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { voiceService } from '../services/voice.service';

interface UseSpeechInterviewProps {
  onAnswerComplete: (answer: string, duration: number) => void;
  onQuestionSpoken: () => void;
}

export const useSpeechInterview = ({ onAnswerComplete, onQuestionSpoken }: UseSpeechInterviewProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [avatarState, setAvatarState] = useState<AvatarState>(AvatarState.IDLE);
  
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize Speech Recognition with Indian English
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-IN'; // Indian English for recognition
      
      console.log('🎤 Speech Recognition initialized with Indian English (en-IN)');

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        setCurrentAnswer(finalTranscript || interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('🔴 Speech recognition error:', event.error);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      voiceService.stopSpeaking();
    };
  }, []);

  // Speak text using Voice Service (with Indian English voice)
  const speak = useCallback((text: string, onEnd?: () => void) => {
    console.log('[Speech] Speaking:', text);
    return new Promise<void>((resolve) => {
      setIsSpeaking(true);
      setAvatarState(AvatarState.SPEAKING);

      // Use voice service which handles Indian voice selection
      voiceService.speak(text, () => {
        console.log('[Speech] Finished speaking');
        setIsSpeaking(false);
        setAvatarState(AvatarState.IDLE);
        if (onEnd) onEnd();
        resolve();
      });
      
      console.log('[Speech] Started speaking');
    });
  }, []);

  // Start listening to user's answer
  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setCurrentAnswer('');
      startTimeRef.current = Date.now();
      setIsListening(true);
      setAvatarState(AvatarState.LISTENING);
      recognitionRef.current.start();
    }
  }, [isListening]);

  // Stop listening and return answer
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setAvatarState(AvatarState.THINKING);
      
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      onAnswerComplete(currentAnswer || 'No answer provided', duration);
      setCurrentAnswer('');
    }
  }, [isListening, currentAnswer, onAnswerComplete]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    voiceService.stopSpeaking();
    setIsSpeaking(false);
    setAvatarState(AvatarState.IDLE);
  }, []);

  return {
    isSpeaking,
    isListening,
    currentAnswer,
    avatarState,
    setAvatarState,
    speak,
    startListening,
    stopListening,
    stopSpeaking,
  };
};
