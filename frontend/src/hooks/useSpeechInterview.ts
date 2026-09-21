import { useState, useCallback, useRef, useEffect } from 'react';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { voiceService } from '../services/voice.service';
import { DEFAULT_LANGUAGE_CODE } from '../config/languages';
import { detectConcepts } from '../utils/conceptRegistry';

interface UseSpeechInterviewProps {
  onAnswerComplete: (answer: string, duration: number, detectedConcepts: string[]) => void;
  onQuestionSpoken: () => void;
  language?: string;
}

// While-speaking concept detection (2C) is debounced so a local, offline
// scan of the registry doesn't run on every single interim speech-result
// event — only after the transcript has been quiet for this long.
const CONCEPT_DETECTION_DEBOUNCE_MS = 450;

export const useSpeechInterview = ({ onAnswerComplete, onQuestionSpoken, language }: UseSpeechInterviewProps) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [avatarState, setAvatarState] = useState<AvatarState>(AvatarState.IDLE);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  // Accumulated, deduplicated canonical concept keys detected locally (no
  // AI, no network call) from the interim/final transcript as the
  // candidate speaks. Never stores raw partial transcript text — only the
  // deduplicated concept-key list leaves the browser (on final submit).
  const [detectedConcepts, setDetectedConcepts] = useState<string[]>([]);

  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const conceptDetectionTimerRef = useRef<number | null>(null);
  const detectedConceptsRef = useRef<string[]>([]);
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

  // Debounced (~450ms) local concept detection over the accumulating
  // interim/final transcript — resets on every currentAnswer change rather
  // than firing on each character/interim event. Purely local (no network,
  // no AI); only the deduplicated canonical concept keys are kept.
  useEffect(() => {
    if (conceptDetectionTimerRef.current !== null) {
      window.clearTimeout(conceptDetectionTimerRef.current);
    }
    if (!currentAnswer.trim()) return;

    conceptDetectionTimerRef.current = window.setTimeout(() => {
      const found = detectConcepts(currentAnswer);
      if (found.length === 0) return;
      setDetectedConcepts((prev) => {
        const merged = Array.from(new Set([...prev, ...found]));
        detectedConceptsRef.current = merged;
        return merged;
      });
    }, CONCEPT_DETECTION_DEBOUNCE_MS);

    return () => {
      if (conceptDetectionTimerRef.current !== null) {
        window.clearTimeout(conceptDetectionTimerRef.current);
      }
    };
  }, [currentAnswer]);

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

  const startListening = useCallback((): boolean => {
    setSpeechError(null);
    if (!recognitionRef.current) {
      setSpeechSupported(false);
      setSpeechError('Speech recognition is not supported in this browser. You can type your answer instead.');
      return false;
    }
    if (isListening) return false;

    setCurrentAnswer('');
    // Reuse the same "new question started" reset point for detected
    // concepts — startListening already resets currentAnswer per question,
    // so accumulated concepts should not carry over from the previous one.
    setDetectedConcepts([]);
    detectedConceptsRef.current = [];
    startTimeRef.current = Date.now();
    try {
      setIsListening(true);
      setAvatarState(AvatarState.LISTENING);
      recognitionRef.current.start();
      return true;
    } catch {
      setIsListening(false);
      setAvatarState(AvatarState.IDLE);
      setSpeechError('The microphone could not start. Please try again or type your answer instead.');
      return false;
    }
  }, [isListening]);

  const stopListening = useCallback((): boolean => {
    if (!recognitionRef.current || !isListening) return false;

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
      return false;
    }

    const duration = Math.max(0, Math.floor((Date.now() - startTimeRef.current) / 1000));
    setSpeechError(null);
    // Also run one last synchronous detection pass over the final transcript
    // so a concept mentioned only in the last debounce window isn't lost.
    const finalConcepts = Array.from(new Set([...detectedConceptsRef.current, ...detectConcepts(answer)]));
    onAnswerComplete(answer, duration, finalConcepts);
    setCurrentAnswer('');
    return true;
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
    detectedConcepts,
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