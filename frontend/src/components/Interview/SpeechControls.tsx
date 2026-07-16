import React from 'react';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface SpeechControlsProps {
  isListening: boolean;
  isPaused: boolean;
  hasTranscript: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReRecord: () => void;
  onClear: () => void;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// SpeechControls Component
// ============================================================================

export const SpeechControls: React.FC<SpeechControlsProps> = ({
  isListening,
  isPaused,
  hasTranscript,
  onStart,
  onStop,
  onPause,
  onResume,
  onReRecord,
  onClear,
  disabled = false,
  className = '',
}) => {
  // ============================================================================
  // Button Components
  // ============================================================================

  const StartButton = () => (
    <button
      onClick={onStart}
      disabled={disabled || isListening || isPaused}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || isListening || isPaused
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-green-500 text-white hover:bg-green-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Start Recording"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
      <span>Start</span>
    </button>
  );

  const StopButton = () => (
    <button
      onClick={onStop}
      disabled={disabled || (!isListening && !isPaused)}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || (!isListening && !isPaused)
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-red-500 text-white hover:bg-red-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Stop Recording"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
      <span>Stop</span>
    </button>
  );

  const PauseButton = () => (
    <button
      onClick={onPause}
      disabled={disabled || !isListening}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || !isListening
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-yellow-500 text-white hover:bg-yellow-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Pause Recording"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
      </svg>
      <span>Pause</span>
    </button>
  );

  const ResumeButton = () => (
    <button
      onClick={onResume}
      disabled={disabled || !isPaused}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || !isPaused
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Resume Recording"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
      <span>Resume</span>
    </button>
  );

  const ReRecordButton = () => (
    <button
      onClick={onReRecord}
      disabled={disabled || isListening}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || isListening
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-purple-500 text-white hover:bg-purple-600 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Re-record"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <span>Re-record</span>
    </button>
  );

  const ClearButton = () => (
    <button
      onClick={onClear}
      disabled={disabled || !hasTranscript || isListening}
      className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
        disabled || !hasTranscript || isListening
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-gray-600 text-white hover:bg-gray-700 active:scale-95 shadow-md hover:shadow-lg'
      }`}
      title="Clear Transcript"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        />
      </svg>
      <span>Clear</span>
    </button>
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={`speech-controls ${className}`}>
      {/* Primary Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
        {/* Show Start button when not recording */}
        {!isListening && !isPaused && <StartButton />}

        {/* Show Resume button when paused */}
        {isPaused && <ResumeButton />}

        {/* Show Pause button when recording */}
        {isListening && <PauseButton />}

        {/* Always show Stop button (disabled when appropriate) */}
        <StopButton />
      </div>

      {/* Secondary Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <ReRecordButton />
        <ClearButton />
      </div>

      {/* Keyboard Shortcuts Hint */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-500">
          Keyboard shortcuts:{' '}
          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
            Space
          </kbd>{' '}
          to toggle recording,{' '}
          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
            R
          </kbd>{' '}
          to re-record,{' '}
          <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
            C
          </kbd>{' '}
          to clear
        </p>
      </div>
    </div>
  );
};

export default SpeechControls;
