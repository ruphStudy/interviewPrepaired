/**
 * VoiceRecorder Component
 * 
 * Main voice recording component that combines:
 * - Speech recognition hook
 * - Recording controls
 * - Real-time transcript display
 * - Error handling
 * - Browser compatibility checks
 */

import React, { useEffect, useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { SpeechControls } from './SpeechControls';
import { TranscriptViewer } from './TranscriptViewer';
import { VoiceRecorderProps, RecordingState } from './types';

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscriptChange,
  onRecordingComplete,
  onError,
  options,
  autoStart = false,
  showControls = true,
  showTranscript = true,
  className = '',
  maxHeight = '400px',
}) => {
  const [hasStarted, setHasStarted] = useState(false);

  const {
    recordingState,
    isListening,
    transcript,
    error,
    browserSupport,
    metadata,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    canRecord,
    getFullTranscript,
  } = useSpeechRecognition(options);

  // ========================================
  // Auto-start
  // ========================================

  useEffect(() => {
    if (autoStart && !hasStarted && browserSupport.isSupported) {
      setHasStarted(true);
      startRecording();
    }
  }, [autoStart, hasStarted, browserSupport.isSupported, startRecording]);

  // ========================================
  // Callbacks
  // ========================================

  // Notify parent of transcript changes
  useEffect(() => {
    if (onTranscriptChange) {
      onTranscriptChange(getFullTranscript());
    }
  }, [transcript, onTranscriptChange, getFullTranscript]);

  // Notify parent when recording is complete
  useEffect(() => {
    if (recordingState === RecordingState.STOPPED && onRecordingComplete) {
      onRecordingComplete(getFullTranscript(), metadata);
    }
  }, [recordingState, onRecordingComplete, getFullTranscript, metadata]);

  // Notify parent of errors
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // ========================================
  // Handlers
  // ========================================

  const handleStart = async () => {
    try {
      await startRecording();
      setHasStarted(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  const handleStop = async () => {
    try {
      await stopRecording();
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };

  const handlePause = () => {
    try {
      pauseRecording();
    } catch (err) {
      console.error('Failed to pause recording:', err);
    }
  };

  const handleResume = () => {
    try {
      resumeRecording();
    } catch (err) {
      console.error('Failed to resume recording:', err);
    }
  };

  const handleReset = () => {
    try {
      resetRecording();
      setHasStarted(false);
    } catch (err) {
      console.error('Failed to reset recording:', err);
    }
  };

  // ========================================
  // Browser Support Check
  // ========================================

  if (!browserSupport.isSupported) {
    return (
      <div className={`voice-recorder-error ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
                Speech Recognition Not Supported
              </h3>
              <p className="text-red-700 dark:text-red-400 mb-3">
                Your browser doesn't support speech recognition or microphone access.
              </p>
              {browserSupport.suggestions && browserSupport.suggestions.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-red-800 dark:text-red-300">Suggestions:</p>
                  <ul className="list-disc list-inside space-y-1 text-red-700 dark:text-red-400">
                    {browserSupport.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // Error State
  // ========================================

  if (error && !error.recoverable) {
    return (
      <div className={`voice-recorder-error ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-start space-x-3">
            <svg
              className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-2">
                Recording Error
              </h3>
              <p className="text-red-700 dark:text-red-400 mb-3">{error.message}</p>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // Main Render
  // ========================================

  return (
    <div className={`voice-recorder ${className}`}>
      <div className="space-y-6">
        {/* Header with Status */}
        <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                Voice Recorder
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Record your answer with speech-to-text
              </p>
            </div>
          </div>

          {/* Duration Display */}
          {recordingState !== RecordingState.IDLE && (
            <div className="text-right">
              <div className="text-2xl font-mono font-semibold text-gray-800 dark:text-gray-200">
                {Math.floor(transcript.duration / 60000)}:
                {String(Math.floor((transcript.duration % 60000) / 1000)).padStart(2, '0')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {transcript.wordCount} words
              </div>
            </div>
          )}
        </div>

        {/* Recording Controls */}
        {showControls && (
          <SpeechControls
            recordingState={recordingState}
            isListening={isListening}
            canRecord={canRecord()}
            onStart={handleStart}
            onStop={handleStop}
            onPause={handlePause}
            onResume={handleResume}
            onReset={handleReset}
          />
        )}

        {/* Error Display (recoverable errors) */}
        {error && error.recoverable && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">{error.message}</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  Attempting to recover...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transcript Display */}
        {showTranscript && (
          <TranscriptViewer
            transcript={transcript}
            recordingState={recordingState}
            showInterim={true}
            showTimestamps={false}
            showConfidence={false}
            highlightFinal={true}
            maxHeight={maxHeight}
          />
        )}

        {/* Recording Info */}
        {recordingState !== RecordingState.IDLE && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Status:</span>
                <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                  {recordingState}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Segments:</span>
                <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                  {transcript.segments.length}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Language:</span>
                <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                  {metadata.language}
                </span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Confidence:</span>
                <span className="ml-2 font-medium text-gray-800 dark:text-gray-200">
                  {Math.round(metadata.averageConfidence * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceRecorder;
