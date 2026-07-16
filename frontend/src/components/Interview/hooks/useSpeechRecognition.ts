import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  timestamp: Date;
}

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  maxAlternatives?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  onResult?: (result: SpeechRecognitionResult) => void;
}

export interface UseSpeechRecognitionReturn {
  transcript: string;
  interimTranscript: string;
  finalTranscript: string;
  isListening: boolean;
  isPaused: boolean;
  isSupported: boolean;
  error: Error | null;
  confidence: number;
  results: SpeechRecognitionResult[];
  startListening: () => void;
  stopListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
  resetTranscript: () => void;
  clearError: () => void;
}

// ============================================================================
// Browser Speech Recognition Types
// ============================================================================

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message: string;
}

interface SpeechRecognitionAPI {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Speech Recognition API is supported
 */
const isSpeechRecognitionSupported = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
};

/**
 * Get Speech Recognition constructor
 */
const getSpeechRecognition = (): any => {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
};

/**
 * Convert error code to user-friendly message
 */
const getErrorMessage = (error: string): string => {
  const errorMessages: { [key: string]: string } = {
    'no-speech': 'No speech detected. Please try again.',
    'audio-capture': 'No microphone detected. Please check your device.',
    'not-allowed': 'Microphone access denied. Please enable microphone permissions.',
    'network': 'Network error occurred. Please check your connection.',
    'aborted': 'Speech recognition aborted.',
    'service-not-allowed': 'Speech recognition service not allowed.',
    'bad-grammar': 'Grammar error occurred.',
    'language-not-supported': 'Language not supported.',
  };
  return errorMessages[error] || `Speech recognition error: ${error}`;
};

// ============================================================================
// Custom Hook: useSpeechRecognition
// ============================================================================

export const useSpeechRecognition = (
  options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn => {
  const {
    continuous = true,
    interimResults = true,
    lang = 'en-US',
    maxAlternatives = 1,
    onStart,
    onEnd,
    onError,
    onResult,
  } = options;

  // State
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [finalTranscript, setFinalTranscript] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [results, setResults] = useState<SpeechRecognitionResult[]>([]);
  const [isSupported] = useState<boolean>(isSpeechRecognitionSupported());

  // Refs
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const isManualStopRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const maxRetriesRef = useRef<number>(3);

  // ============================================================================
  // Initialize Speech Recognition
  // ============================================================================

  useEffect(() => {
    if (!isSupported) {
      setError(new Error('Speech Recognition API is not supported in this browser.'));
      return;
    }

    const SpeechRecognitionConstructor = getSpeechRecognition();
    if (!SpeechRecognitionConstructor) return;

    const recognition = new SpeechRecognitionConstructor() as SpeechRecognitionAPI;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;
    recognition.maxAlternatives = maxAlternatives;

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [isSupported, continuous, interimResults, lang, maxAlternatives]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Handle recognition start
   */
  const handleStart = useCallback(() => {
    setIsListening(true);
    setIsPaused(false);
    setError(null);
    retryCountRef.current = 0;
    onStart?.();
  }, [onStart]);

  /**
   * Handle recognition end
   */
  const handleEnd = useCallback(() => {
    setIsListening(false);
    
    // Auto-restart if not manually stopped and not paused
    if (!isManualStopRef.current && !isPaused && retryCountRef.current < maxRetriesRef.current) {
      try {
        setTimeout(() => {
          if (recognitionRef.current && !isManualStopRef.current) {
            recognitionRef.current.start();
            retryCountRef.current += 1;
          }
        }, 100);
      } catch (e) {
        // Handle restart error silently
      }
    } else {
      onEnd?.();
    }
  }, [isPaused, onEnd]);

  /**
   * Handle recognition error
   */
  const handleError = useCallback((event: SpeechRecognitionErrorEvent) => {
    const errorMessage = getErrorMessage(event.error);
    const errorObj = new Error(errorMessage);
    setError(errorObj);
    onError?.(errorObj);

    // Don't retry on permission errors
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      setIsListening(false);
      isManualStopRef.current = true;
    }
  }, [onError]);

  /**
   * Handle recognition result
   */
  const handleResult = useCallback((event: SpeechRecognitionEvent) => {
    let interimText = '';
    let finalText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcriptText = result[0].transcript;
      const confidenceScore = result[0].confidence;

      if (result.isFinal) {
        finalText += transcriptText + ' ';
        
        // Store result
        const speechResult: SpeechRecognitionResult = {
          transcript: transcriptText,
          confidence: confidenceScore,
          isFinal: true,
          timestamp: new Date(),
        };
        
        setResults((prev) => [...prev, speechResult]);
        setConfidence(confidenceScore);
        onResult?.(speechResult);
      } else {
        interimText += transcriptText;
      }
    }

    if (finalText) {
      setFinalTranscript((prev) => prev + finalText);
      setTranscript((prev) => prev + finalText);
    }

    setInterimTranscript(interimText);
  }, [onResult]);

  // ============================================================================
  // Setup Event Listeners
  // ============================================================================

  useEffect(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognition.onstart = handleStart;
    recognition.onend = handleEnd;
    recognition.onerror = handleError;
    recognition.onresult = handleResult;

    return () => {
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
    };
  }, [handleStart, handleEnd, handleError, handleResult]);

  // ============================================================================
  // Control Functions
  // ============================================================================

  /**
   * Start listening
   */
  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) {
      setError(new Error('Speech Recognition is not available.'));
      return;
    }

    try {
      isManualStopRef.current = false;
      retryCountRef.current = 0;
      recognitionRef.current.start();
    } catch (e: any) {
      if (e.message?.includes('already started')) {
        // Already running, ignore
        return;
      }
      setError(new Error(`Failed to start: ${e.message}`));
    }
  }, [isSupported]);

  /**
   * Stop listening
   */
  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;

    try {
      isManualStopRef.current = true;
      recognitionRef.current.stop();
      setIsListening(false);
      setIsPaused(false);
    } catch (e: any) {
      setError(new Error(`Failed to stop: ${e.message}`));
    }
  }, []);

  /**
   * Pause listening
   */
  const pauseListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;

    try {
      recognitionRef.current.stop();
      setIsPaused(true);
      setIsListening(false);
    } catch (e: any) {
      setError(new Error(`Failed to pause: ${e.message}`));
    }
  }, [isListening]);

  /**
   * Resume listening
   */
  const resumeListening = useCallback(() => {
    if (!recognitionRef.current || !isPaused) return;

    try {
      isManualStopRef.current = false;
      recognitionRef.current.start();
      setIsPaused(false);
    } catch (e: any) {
      setError(new Error(`Failed to resume: ${e.message}`));
    }
  }, [isPaused]);

  /**
   * Reset transcript
   */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setFinalTranscript('');
    setResults([]);
    setConfidence(0);
    setError(null);
  }, []);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ============================================================================
  // Return Hook API
  // ============================================================================

  return {
    transcript,
    interimTranscript,
    finalTranscript,
    isListening,
    isPaused,
    isSupported,
    error,
    confidence,
    results,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    resetTranscript,
    clearError,
  };
};
