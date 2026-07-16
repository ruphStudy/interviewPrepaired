import React, { useState, useEffect } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { SpeechControls } from './SpeechControls';
import { TranscriptViewer } from './TranscriptViewer';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface VoiceRecorderProps {
  onTranscriptChange?: (transcript: string) => void;
  onRecordingComplete?: (transcript: string, duration: number) => void;
  onError?: (error: Error) => void;
  maxDuration?: number; // in seconds
  autoStop?: boolean;
  className?: string;
}

// ============================================================================
// VoiceRecorder Component
// ============================================================================

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscriptChange,
  onRecordingComplete,
  onError,
  maxDuration = 300, // 5 minutes default
  autoStop = true,
  className = '',
}) => {
  // Speech Recognition Hook
  const {
    transcript,
    interimTranscript,
    finalTranscript,
    isListening,
    isPaused,
    isSupported,
    error,
    confidence,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    resetTranscript,
    clearError,
  } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    lang: 'en-US',
  });

  // Local State
  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Update transcript change callback
   */
  useEffect(() => {
    if (transcript && onTranscriptChange) {
      onTranscriptChange(transcript);
    }
  }, [transcript, onTranscriptChange]);

  /**
   * Handle errors
   */
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  /**
   * Timer for recording duration
   */
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isListening && !isPaused) {
      if (!startTime) {
        setStartTime(Date.now());
      }

      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (startTime || Date.now())) / 1000);
        setDuration(elapsed);

        // Auto-stop if max duration reached
        if (autoStop && elapsed >= maxDuration) {
          handleStop();
        }
      }, 1000);
    } else if (isPaused) {
      // Keep duration when paused
    } else {
      // Reset start time when stopped
      if (interval) {
        clearInterval(interval);
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isListening, isPaused, startTime, maxDuration, autoStop]);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Start recording
   */
  const handleStart = () => {
    clearError();
    setStartTime(Date.now());
    setDuration(0);
    startListening();
  };

  /**
   * Stop recording
   */
  const handleStop = () => {
    stopListening();
    if (onRecordingComplete && finalTranscript) {
      onRecordingComplete(finalTranscript, duration);
    }
  };

  /**
   * Pause recording
   */
  const handlePause = () => {
    pauseListening();
  };

  /**
   * Resume recording
   */
  const handleResume = () => {
    resumeListening();
  };

  /**
   * Re-record (reset and start)
   */
  const handleReRecord = () => {
    resetTranscript();
    setDuration(0);
    setStartTime(null);
    clearError();
    startListening();
  };

  /**
   * Clear transcript
   */
  const handleClear = () => {
    resetTranscript();
    setDuration(0);
    setStartTime(null);
    clearError();
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  /**
   * Format duration as MM:SS
   */
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Get status message
   */
  const getStatusMessage = (): string => {
    if (!isSupported) {
      return 'Speech recognition not supported in this browser';
    }
    if (error) {
      return error.message;
    }
    if (isListening) {
      return 'Recording...';
    }
    if (isPaused) {
      return 'Paused';
    }
    return 'Ready to record';
  };

  /**
   * Get status color
   */
  const getStatusColor = (): string => {
    if (!isSupported || error) return 'text-red-600';
    if (isListening) return 'text-green-600';
    if (isPaused) return 'text-yellow-600';
    return 'text-gray-600';
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (!isSupported) {
    return (
      <div className={`voice-recorder ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-red-900 mb-2">
            Speech Recognition Not Supported
          </h3>
          <p className="text-red-700 mb-4">
            Your browser doesn't support the Speech Recognition API.
          </p>
          <p className="text-sm text-red-600">
            Please use Chrome, Edge, or Safari for the best experience.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`voice-recorder space-y-6 ${className}`}>
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Voice Recorder</h2>
          <div className="flex items-center space-x-4">
            {/* Status Indicator */}
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isListening
                    ? 'bg-green-500 animate-pulse'
                    : isPaused
                    ? 'bg-yellow-500'
                    : 'bg-gray-300'
                }`}
              />
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusMessage()}
              </span>
            </div>

            {/* Timer */}
            <div className="text-2xl font-mono font-bold text-gray-700">
              {formatDuration(duration)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {maxDuration > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className={`h-2 rounded-full transition-all duration-1000 ${
                duration / maxDuration > 0.9
                  ? 'bg-red-500'
                  : duration / maxDuration > 0.7
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min((duration / maxDuration) * 100, 100)}%` }}
            />
          </div>
        )}

        {/* Controls */}
        <SpeechControls
          isListening={isListening}
          isPaused={isPaused}
          hasTranscript={transcript.length > 0}
          onStart={handleStart}
          onStop={handleStop}
          onPause={handlePause}
          onResume={handleResume}
          onReRecord={handleReRecord}
          onClear={handleClear}
        />

        {/* Confidence Indicator */}
        {isListening && confidence > 0 && (
          <div className="mt-4 flex items-center space-x-2">
            <span className="text-sm text-gray-600">Confidence:</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  confidence > 0.8
                    ? 'bg-green-500'
                    : confidence > 0.5
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700">
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 mr-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-700">{error.message}</p>
            </div>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Transcript Viewer */}
      <TranscriptViewer
        transcript={transcript}
        interimTranscript={interimTranscript}
        isListening={isListening}
      />

      {/* Stats */}
      {transcript && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {transcript.split(' ').filter(Boolean).length}
              </div>
              <div className="text-sm text-gray-600">Words</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{transcript.length}</div>
              <div className="text-sm text-gray-600">Characters</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {Math.round(confidence * 100)}%
              </div>
              <div className="text-sm text-gray-600">Confidence</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
