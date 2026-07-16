/**
 * SpeechControls Component
 * 
 * Control panel for voice recording with:
 * - Start/Stop recording
 * - Pause/Resume
 * - Reset/Re-record
 * - Visual state indicators
 * - Keyboard shortcuts
 */

import React, { useEffect } from 'react';
import { SpeechControlsProps, RecordingState } from './types';

export const SpeechControls: React.FC<SpeechControlsProps> = ({
  recordingState,
  isListening,
  canRecord,
  onStart,
  onStop,
  onPause,
  onResume,
  onReset,
  disabled = false,
  className = '',
}) => {
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Space or 'R' to start/stop recording
      if (e.code === 'Space' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (recordingState === RecordingState.IDLE || recordingState === RecordingState.STOPPED) {
          onStart();
        } else if (recordingState === RecordingState.RECORDING) {
          onStop();
        }
      }

      // 'P' to pause/resume
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (recordingState === RecordingState.RECORDING) {
          onPause();
        } else if (recordingState === RecordingState.PAUSED) {
          onResume();
        }
      }

      // 'Escape' to reset
      if (e.key === 'Escape') {
        e.preventDefault();
        onReset();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [recordingState, onStart, onStop, onPause, onResume, onReset]);

  // Button states
  const isIdle = recordingState === RecordingState.IDLE;
  const isRecording = recordingState === RecordingState.RECORDING;
  const isPaused = recordingState === RecordingState.PAUSED;
  const isStopped = recordingState === RecordingState.STOPPED;
  const isError = recordingState === RecordingState.ERROR;

  const isDisabled = disabled || !canRecord || isError;

  return (
    <div className={`speech-controls ${className}`}>
      <div className="flex flex-col space-y-4">
        {/* Primary Controls */}
        <div className="flex items-center justify-center space-x-4">
          {/* Start/Stop Button */}
          {(isIdle || isStopped) && (
            <button
              onClick={onStart}
              disabled={isDisabled}
              className={`
                flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium
                transition-all duration-200 transform hover:scale-105
                ${
                  isDisabled
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl'
                }
              `}
              title="Start Recording (Space or R)"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span>Start Recording</span>
            </button>
          )}

          {(isRecording || isPaused) && (
            <>
              {/* Pause/Resume Button */}
              <button
                onClick={isRecording ? onPause : onResume}
                disabled={isDisabled}
                className={`
                  flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium
                  transition-all duration-200 transform hover:scale-105
                  ${
                    isDisabled
                      ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : isPaused
                      ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl'
                      : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg hover:shadow-xl'
                  }
                `}
                title={isPaused ? 'Resume Recording' : 'Pause Recording (P)'}
              >
                {isPaused ? (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <span>Pause</span>
                  </>
                )}
              </button>

              {/* Stop Button */}
              <button
                onClick={onStop}
                disabled={isDisabled}
                className={`
                  flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-medium
                  transition-all duration-200 transform hover:scale-105
                  ${
                    isDisabled
                      ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-gray-700 hover:bg-gray-800 text-white shadow-lg hover:shadow-xl'
                  }
                `}
                title="Stop Recording"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
                <span>Stop</span>
              </button>
            </>
          )}
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center justify-center space-x-2">
          {/* Reset Button */}
          {!isIdle && (
            <button
              onClick={onReset}
              disabled={isDisabled}
              className={`
                flex items-center space-x-1 px-4 py-2 rounded-md text-sm font-medium
                transition-colors duration-200
                ${
                  isDisabled
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }
              `}
              title="Reset Recording (Escape)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Re-record</span>
            </button>
          )}
        </div>

        {/* Status Indicator */}
        <div className="flex items-center justify-center space-x-2 text-sm">
          {isIdle && (
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span>Ready to record</span>
            </div>
          )}

          {isRecording && (
            <div className="flex items-center space-x-2 text-red-500 dark:text-red-400">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="font-medium">Recording...</span>
              {isListening && (
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </div>
          )}

          {isPaused && (
            <div className="flex items-center space-x-2 text-yellow-500 dark:text-yellow-400">
              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
              <span className="font-medium">Paused</span>
            </div>
          )}

          {isStopped && (
            <div className="flex items-center space-x-2 text-green-500 dark:text-green-400">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="font-medium">Recording complete</span>
            </div>
          )}

          {isError && (
            <div className="flex items-center space-x-2 text-red-600 dark:text-red-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              <span className="font-medium">Error occurred</span>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Help */}
        {!isDisabled && (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center space-y-1">
            <p>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">Space</kbd> or{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">R</kbd> Start/Stop
            </p>
            <p>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">P</kbd> Pause/Resume
              {' · '}
              <kbd className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700">Esc</kbd> Reset
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpeechControls;
