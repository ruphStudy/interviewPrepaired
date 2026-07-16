/**
 * useSpeechRecognition Hook
 * 
 * Custom React hook for managing speech recognition with:
 * - Start/Stop/Pause/Resume functionality
 * - Real-time transcription
 * - Error handling
 * - Browser compatibility
 * - Auto-restart on errors
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RecordingState,
  RecognitionState,
  SpeechRecognitionResult,
  TranscriptSegment,
  TranscriptData,
  SpeechRecognitionError,
  SpeechRecognitionErrorCode,
  RecordingMetadata,
  BrowserSupport,
  RecordingOptions,
  UseSpeechRecognitionReturn,
  SpeechRecognitionInstance,
  SpeechRecognitionErrorEvent,
} from './types';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_OPTIONS: RecordingOptions = {
  maxDuration: 5 * 60 * 1000, // 5 minutes
  autoPause: false,
  silenceThreshold: 3000, // 3 seconds
  speechRecognitionConfig: {
    language: 'en-US',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    autoRestart: true,
    restartDelay: 1000,
  },
};

// ============================================================================
// Browser Compatibility
// ============================================================================

/**
 * Check browser support for Speech Recognition API
 */
const checkBrowserSupport = (): BrowserSupport => {
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const hasGetUserMedia = hasMediaDevices && !!navigator.mediaDevices.getUserMedia;
  const hasSpeechRecognition = typeof window !== 'undefined' && 'SpeechRecognition' in window;
  const hasWebkitSpeechRecognition = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window;

  const isSupported = (hasSpeechRecognition || hasWebkitSpeechRecognition) && hasGetUserMedia;

  let suggestions: string[] = [];
  if (!isSupported) {
    if (!hasSpeechRecognition && !hasWebkitSpeechRecognition) {
      suggestions.push('Use Chrome, Edge, or Safari for speech recognition support');
    }
    if (!hasGetUserMedia) {
      suggestions.push('Enable microphone access in browser settings');
    }
  }

  return {
    speechRecognition: hasSpeechRecognition,
    webkitSpeechRecognition: hasWebkitSpeechRecognition,
    mediaDevices: hasMediaDevices,
    getUserMedia: hasGetUserMedia,
    isSupported,
    suggestions,
  };
};

/**
 * Get Speech Recognition constructor
 */
const getSpeechRecognition = (): any => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

// ============================================================================
// Hook Implementation
// ============================================================================

export const useSpeechRecognition = (
  options: RecordingOptions = {}
): UseSpeechRecognitionReturn => {
  // Merge options with defaults
  const config = { ...DEFAULT_OPTIONS, ...options };

  // ========================================
  // State
  // ========================================

  const [recordingState, setRecordingState] = useState<RecordingState>(RecordingState.IDLE);
  const [recognitionState, setRecognitionState] = useState<RecognitionState>(RecognitionState.INACTIVE);
  const [error, setError] = useState<SpeechRecognitionError | null>(null);
  const [browserSupport] = useState<BrowserSupport>(checkBrowserSupport());

  // Transcript state
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [finalTranscript, setFinalTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');

  // Metadata state
  const [startTime, setStartTime] = useState<number>(0);
  const [pausedTime, setPausedTime] = useState<number>(0);
  const [totalPausedDuration, setTotalPausedDuration] = useState<number>(0);

  // ========================================
  // Refs
  // ========================================

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef<boolean>(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldRestartRef = useRef<boolean>(false);

  // ========================================
  // Computed Values
  // ========================================

  const transcript: TranscriptData = {
    segments,
    finalTranscript,
    interimTranscript,
    fullTranscript: finalTranscript + (interimTranscript ? ' ' + interimTranscript : ''),
    wordCount: finalTranscript.split(/\s+/).filter(Boolean).length,
    characterCount: finalTranscript.length,
    duration: startTime ? Date.now() - startTime - totalPausedDuration : 0,
  };

  const metadata: RecordingMetadata = {
    startTime,
    endTime: recordingState === RecordingState.STOPPED ? Date.now() : undefined,
    duration: transcript.duration,
    pausedDuration: totalPausedDuration,
    state: recordingState,
    language: config.speechRecognitionConfig?.language || 'en-US',
    segmentCount: segments.length,
    averageConfidence: segments.length > 0
      ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      : 0,
  };

  // ========================================
  // Error Handling
  // ========================================

  const handleError = useCallback((code: SpeechRecognitionErrorCode, message: string, recoverable: boolean = true) => {
    const error: SpeechRecognitionError = {
      code,
      message,
      timestamp: Date.now(),
      recoverable,
    };
    setError(error);
    setRecognitionState(RecognitionState.ERROR);
    
    console.error('[SpeechRecognition] Error:', error);

    // Try to recover from recoverable errors
    if (recoverable && shouldRestartRef.current && config.speechRecognitionConfig?.autoRestart) {
      const delay = config.speechRecognitionConfig.restartDelay || 1000;
      restartTimeoutRef.current = setTimeout(() => {
        console.log('[SpeechRecognition] Auto-restarting...');
        startRecognition();
      }, delay);
    } else {
      setRecordingState(RecordingState.ERROR);
    }
  }, [config.speechRecognitionConfig]);

  // ========================================
  // Recognition Management
  // ========================================

  const initializeRecognition = useCallback(() => {
    if (!browserSupport.isSupported) {
      handleError(
        SpeechRecognitionErrorCode.NOT_SUPPORTED,
        'Speech recognition is not supported in this browser',
        false
      );
      return null;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      handleError(
        SpeechRecognitionErrorCode.NOT_SUPPORTED,
        'Speech recognition API not available',
        false
      );
      return null;
    }

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance;

    // Configure recognition
    recognition.continuous = config.speechRecognitionConfig?.continuous ?? true;
    recognition.interimResults = config.speechRecognitionConfig?.interimResults ?? true;
    recognition.lang = config.speechRecognitionConfig?.language || 'en-US';
    recognition.maxAlternatives = config.speechRecognitionConfig?.maxAlternatives || 1;

    // Event handlers
    recognition.onstart = () => {
      console.log('[SpeechRecognition] Started');
      isListeningRef.current = true;
      setRecognitionState(RecognitionState.ACTIVE);
      setError(null);
    };

    recognition.onend = () => {
      console.log('[SpeechRecognition] Ended');
      isListeningRef.current = false;
      setRecognitionState(RecognitionState.INACTIVE);

      // Auto-restart if needed
      if (shouldRestartRef.current && config.speechRecognitionConfig?.autoRestart) {
        const delay = config.speechRecognitionConfig.restartDelay || 1000;
        restartTimeoutRef.current = setTimeout(() => {
          if (shouldRestartRef.current) {
            console.log('[SpeechRecognition] Auto-restarting...');
            startRecognition();
          }
        }, delay);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecognition] Error event:', event.error);

      let errorCode: SpeechRecognitionErrorCode;
      let errorMessage: string;
      let recoverable = true;

      switch (event.error) {
        case 'no-speech':
          errorCode = SpeechRecognitionErrorCode.NO_SPEECH;
          errorMessage = 'No speech detected. Please try again.';
          recoverable = true;
          break;
        case 'audio-capture':
          errorCode = SpeechRecognitionErrorCode.AUDIO_CAPTURE;
          errorMessage = 'Microphone not found or not accessible.';
          recoverable = false;
          break;
        case 'not-allowed':
          errorCode = SpeechRecognitionErrorCode.NOT_ALLOWED;
          errorMessage = 'Microphone access denied. Please enable microphone permissions.';
          recoverable = false;
          break;
        case 'network':
          errorCode = SpeechRecognitionErrorCode.NETWORK;
          errorMessage = 'Network error occurred. Please check your connection.';
          recoverable = true;
          break;
        case 'aborted':
          errorCode = SpeechRecognitionErrorCode.ABORTED;
          errorMessage = 'Speech recognition aborted.';
          recoverable = false;
          break;
        default:
          errorCode = SpeechRecognitionErrorCode.UNKNOWN;
          errorMessage = `Speech recognition error: ${event.error}`;
          recoverable = true;
      }

      handleError(errorCode, errorMessage, recoverable);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;

        if (result.isFinal) {
          final += transcript + ' ';

          // Add to segments
          const segment: TranscriptSegment = {
            id: `segment-${Date.now()}-${i}`,
            text: transcript,
            confidence,
            isFinal: true,
            timestamp: Date.now(),
          };
          setSegments((prev) => [...prev, segment]);
        } else {
          interim += transcript;
        }
      }

      if (final) {
        setFinalTranscript((prev) => prev + final);
      }
      setInterimTranscript(interim);
    };

    recognition.onspeechstart = () => {
      console.log('[SpeechRecognition] Speech started');
    };

    recognition.onspeechend = () => {
      console.log('[SpeechRecognition] Speech ended');
    };

    recognition.onaudiostart = () => {
      console.log('[SpeechRecognition] Audio started');
    };

    recognition.onaudioend = () => {
      console.log('[SpeechRecognition] Audio ended');
    };

    return recognition;
  }, [browserSupport, config, handleError]);

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) {
      recognitionRef.current = initializeRecognition();
    }

    if (recognitionRef.current && !isListeningRef.current) {
      try {
        setRecognitionState(RecognitionState.STARTING);
        recognitionRef.current.start();
      } catch (error) {
        console.error('[SpeechRecognition] Start error:', error);
        handleError(
          SpeechRecognitionErrorCode.UNKNOWN,
          'Failed to start speech recognition',
          true
        );
      }
    }
  }, [initializeRecognition, handleError]);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        shouldRestartRef.current = false;
        setRecognitionState(RecognitionState.STOPPING);
        recognitionRef.current.stop();
      } catch (error) {
        console.error('[SpeechRecognition] Stop error:', error);
      }
    }
  }, []);

  // ========================================
  // Recording Actions
  // ========================================

  const startRecording = useCallback(async () => {
    if (!browserSupport.isSupported) {
      handleError(
        SpeechRecognitionErrorCode.NOT_SUPPORTED,
        'Speech recognition is not supported',
        false
      );
      return;
    }

    // Request microphone permission
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      handleError(
        SpeechRecognitionErrorCode.NOT_ALLOWED,
        'Microphone permission denied',
        false
      );
      return;
    }

    // Reset state
    setSegments([]);
    setFinalTranscript('');
    setInterimTranscript('');
    setError(null);
    setStartTime(Date.now());
    setTotalPausedDuration(0);

    // Start recording
    setRecordingState(RecordingState.RECORDING);
    shouldRestartRef.current = true;
    startRecognition();

    // Set max duration timeout
    if (config.maxDuration) {
      maxDurationTimeoutRef.current = setTimeout(() => {
        console.log('[SpeechRecognition] Max duration reached');
        stopRecording();
      }, config.maxDuration);
    }
  }, [browserSupport, config, startRecognition, handleError]);

  const stopRecording = useCallback(async () => {
    shouldRestartRef.current = false;
    stopRecognition();
    setRecordingState(RecordingState.STOPPED);
    setInterimTranscript(''); // Clear interim on stop

    // Clear timeouts
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }, [stopRecognition]);

  const pauseRecording = useCallback(() => {
    if (recordingState === RecordingState.RECORDING) {
      shouldRestartRef.current = false;
      stopRecognition();
      setRecordingState(RecordingState.PAUSED);
      setPausedTime(Date.now());
    }
  }, [recordingState, stopRecognition]);

  const resumeRecording = useCallback(() => {
    if (recordingState === RecordingState.PAUSED) {
      const pauseDuration = Date.now() - pausedTime;
      setTotalPausedDuration((prev) => prev + pauseDuration);
      setRecordingState(RecordingState.RECORDING);
      shouldRestartRef.current = true;
      startRecognition();
    }
  }, [recordingState, pausedTime, startRecognition]);

  const resetRecording = useCallback(() => {
    stopRecording();
    setSegments([]);
    setFinalTranscript('');
    setInterimTranscript('');
    setError(null);
    setStartTime(0);
    setTotalPausedDuration(0);
    setRecordingState(RecordingState.IDLE);
  }, [stopRecording]);

  const clearTranscript = useCallback(() => {
    setSegments([]);
    setFinalTranscript('');
    setInterimTranscript('');
  }, []);

  // ========================================
  // Utilities
  // ========================================

  const getFullTranscript = useCallback(() => {
    return transcript.fullTranscript;
  }, [transcript]);

  const getFinalTranscript = useCallback(() => {
    return finalTranscript;
  }, [finalTranscript]);

  const getInterimTranscript = useCallback(() => {
    return interimTranscript;
  }, [interimTranscript]);

  const getConfidence = useCallback(() => {
    return metadata.averageConfidence;
  }, [metadata]);

  const getDuration = useCallback(() => {
    return transcript.duration;
  }, [transcript]);

  const isRecording = useCallback(() => {
    return recordingState === RecordingState.RECORDING;
  }, [recordingState]);

  const canRecord = useCallback(() => {
    return browserSupport.isSupported && recordingState !== RecordingState.ERROR;
  }, [browserSupport, recordingState]);

  // ========================================
  // Cleanup
  // ========================================

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (recognitionRef.current) {
        shouldRestartRef.current = false;
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error('[SpeechRecognition] Cleanup error:', error);
        }
      }
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current);
      }
    };
  }, []);

  // ========================================
  // Return
  // ========================================

  return {
    // State
    isListening: isListeningRef.current,
    recordingState,
    recognitionState,
    transcript,
    error,
    browserSupport,
    metadata,

    // Actions
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    clearTranscript,

    // Utilities
    getFullTranscript,
    getFinalTranscript,
    getInterimTranscript,
    getConfidence,
    getDuration,
    isRecording,
    canRecord,
  };
};

export default useSpeechRecognition;
