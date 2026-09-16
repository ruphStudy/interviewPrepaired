import { useState, useCallback, useRef, useEffect } from 'react';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { voiceService } from '../services/voice.service';
import { DEFAULT_LANGUAGE_CODE } from '../config/languages';

interface UseSpeechInterviewProps {
  onAnswerComplete: (answer: string, duration: number) => void;
  onQuestionSpoken: () => void;
  language?: string;
}

export const useSpeechInterview = ({ onAnswerComplete, onQuestionSpoken, language }: UseSpeechInterviewProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [avatarState, setAvatarState] = useState<AvatarState>(AvatarState.IDLE);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const resolvedLanguage = language || DEFAULT_LANGUAGE_CODE;

  useEffect(() => {
    const hasRecognition = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    setSpeechSupported(hasRecognition);
    setSpeechError(hasRecognition ? null : 'Speech recognition is not supported in this browser. You can type your answer instead.');

    if (hasRecognition) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = resolvedLanguage;
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += `${event.results[i][0].transcript} `;
        }
        setCurrentAnswer(transcript.trim());
      };

      recognition.onerror = (event: any) => {
        const error = event?.error;
        let message = 'We could not capture your answer. Please try the microphone again or type your answer.';
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          message = 'Microphone permission is blocked. Allow microphone access or type your answer instead.';
        } else if (error === 'no-speech') {
          message = 'No speech was detected. Please try again or type your answer.';
        } else if (error === 'network') {
          message = 'Speech recognition is temporarily unavailable. You can type your answer instead.';
        }
        setSpeechError(message);
        setIsListening(false);
        setAvatarState(AvatarState.IDLE);
      };

      recognition.onend = () => {
        setIsListening(false);
        setAvatarState(AvatarState.IDLE);
      };
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Already stopped.
        }
        recognitionRef.current = null;
      }
      voiceService.stopSpeaking();
    };
  }, [resolvedLanguage]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    return new Promise<void>((resolve) => {
      setIsSpeaking(true);
      setAvatarState(AvatarState.SPEAKING);

      voiceService.speak(text, () => {
        setIsSpeaking(false);
        setAvatarState(AvatarState.IDLE);
        if (onEnd) onEnd();
        onQuestionSpoken();
        resolve();
      }, resolvedLanguage);
    });
  }, [resolvedLanguage, onQuestionSpoken]);

  const startListening = useCallback(() => {
    setSpeechError(null);
    if (!recognitionRef.current) {
      setSpeechSupported(false);
      setSpeechError('Speech recognition is not supported in this browser. You can type your answer instead.');
      return;
    }
    if (isListening) return;

    setCurrentAnswer('');
    startTimeRef.current = Date.now();
    try {
      setIsListening(true);
      setAvatarState(AvatarState.LISTENING);
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
      setAvatarState(AvatarState.IDLE);
      setSpeechError('The microphone could not start. Please try again or type your answer instead.');
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    try {
      recognitionRef.current.stop();
    } catch {
      // A browser can auto-stop recognition first; the captured transcript is
      // still valid and handled below.
    }
    setIsListening(false);
    setAvatarState(AvatarState.THINKING);

    const answer = currentAnswer.trim();
    if (answer.length < 3) {
      setAvatarState(AvatarState.IDLE);
      setSpeechError('We did not capture enough of your answer. Please try again or type it instead.');
      return;
    }

    const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
    setSpeechError(null);
    onAnswerComplete(answer, duration);
    setCurrentAnswer('');
  }, [isListening, currentAnswer, onAnswerComplete]);

  const stopSpeaking = useCallback(() => {
    voiceService.stopSpeaking();
    setIsSpeaking(false);
    setAvatarState(AvatarState.IDLE);
  }, []);

  const clearSpeechError = useCallback(() => setSpeechError(null), []);

  return {
    isSpeaking,
    isListening,
    currentAnswer,
    avatarState,
    setAvatarState,
    speechSupported,
    speechError,
    clearSpeechError,
    speak,
    startListening,
    stopListening,
    stopSpeaking,
  };
};