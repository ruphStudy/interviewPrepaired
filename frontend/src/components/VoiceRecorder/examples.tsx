/**
 * VoiceRecorder Usage Examples
 * 
 * Comprehensive examples showing different ways to use the VoiceRecorder module
 */

import React, { useState } from 'react';
import {
  VoiceRecorder,
  useSpeechRecognition,
  RecordingState,
  SpeechRecognitionError,
  RecordingMetadata,
} from './index';

// ============================================================================
// Example 1: Basic Interview Question Answer
// ============================================================================

export function BasicInterviewAnswer() {
  const [answer, setAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleRecordingComplete = (transcript: string, metadata: RecordingMetadata) => {
    setAnswer(transcript);
    console.log('Recording metadata:', metadata);
    // Submit answer to backend
    // submitAnswer({ transcript, duration: metadata.duration });
  };

  const handleSubmit = () => {
    if (answer.trim()) {
      setIsSubmitted(true);
      // Submit to API
      console.log('Submitting answer:', answer);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Interview Question</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">
          Explain the concept of React hooks and provide examples of useState and useEffect.
        </p>
      </div>

      <VoiceRecorder
        onRecordingComplete={handleRecordingComplete}
        onTranscriptChange={(transcript) => setAnswer(transcript)}
        showControls={true}
        showTranscript={true}
        maxHeight="400px"
      />

      {answer && !isSubmitted && (
        <div className="mt-6">
          <button
            onClick={handleSubmit}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            Submit Answer
          </button>
        </div>
      )}

      {isSubmitted && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-300">
            Answer submitted successfully! Word count: {answer.split(/\s+/).length}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 2: Custom UI with Hook
// ============================================================================

export function CustomRecorderUI() {
  const {
    recordingState,
    transcript,
    error,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    resetRecording,
    metadata,
  } = useSpeechRecognition({
    maxDuration: 3 * 60 * 1000, // 3 minutes
    speechRecognitionConfig: {
      language: 'en-US',
      continuous: true,
      interimResults: true,
    },
  });

  const isRecording = recordingState === RecordingState.RECORDING;
  const isPaused = recordingState === RecordingState.PAUSED;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Custom Voice Recorder</h2>

      {/* Custom Controls */}
      <div className="flex items-center space-x-4 mb-6">
        {!isRecording && !isPaused && (
          <button
            onClick={startRecording}
            className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg"
          >
            🎙️ Start
          </button>
        )}

        {isRecording && (
          <>
            <button
              onClick={pauseRecording}
              className="px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg"
            >
              ⏸️ Pause
            </button>
            <button
              onClick={stopRecording}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-800 text-white rounded-lg"
            >
              ⏹️ Stop
            </button>
          </>
        )}

        {isPaused && (
          <>
            <button
              onClick={resumeRecording}
              className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg"
            >
              ▶️ Resume
            </button>
            <button
              onClick={stopRecording}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-800 text-white rounded-lg"
            >
              ⏹️ Stop
            </button>
          </>
        )}

        {recordingState !== RecordingState.IDLE && (
          <button
            onClick={resetRecording}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            🔄 Reset
          </button>
        )}
      </div>

      {/* Status Display */}
      <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Status:</span>
            <span className="ml-2 font-semibold">{recordingState}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Duration:</span>
            <span className="ml-2 font-semibold">
              {Math.floor(transcript.duration / 1000)}s
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Words:</span>
            <span className="ml-2 font-semibold">{transcript.wordCount}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Confidence:</span>
            <span className="ml-2 font-semibold">
              {Math.round(metadata.averageConfidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Transcript Display */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold mb-2">Transcript:</h3>
        <div className="text-gray-800 dark:text-gray-200">
          {transcript.fullTranscript || 'Start recording to see transcript...'}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-300">{error.message}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 3: Multi-language Support
// ============================================================================

export function MultiLanguageRecorder() {
  const [language, setLanguage] = useState('en-US');
  const [transcript, setTranscript] = useState('');

  const languages = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'pt-BR', name: 'Portuguese' },
    { code: 'zh-CN', name: 'Chinese' },
    { code: 'ja-JP', name: 'Japanese' },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Multi-Language Voice Recorder</h2>

      {/* Language Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Select Language:</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <VoiceRecorder
        key={language} // Force re-render on language change
        options={{
          speechRecognitionConfig: {
            language,
            continuous: true,
            interimResults: true,
          },
        }}
        onTranscriptChange={setTranscript}
      />
    </div>
  );
}

// ============================================================================
// Example 4: With Error Handling and Recovery
// ============================================================================

export function RecorderWithErrorHandling() {
  const [errorLog, setErrorLog] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);

  const handleError = (error: SpeechRecognitionError) => {
    const errorMessage = `[${new Date().toLocaleTimeString()}] ${error.code}: ${error.message}`;
    setErrorLog((prev) => [...prev, errorMessage]);
    setAttempts((prev) => prev + 1);

    // Track errors
    console.error('Speech recognition error:', error);

    // Show user-friendly message
    if (!error.recoverable) {
      switch (error.code) {
        case 'not-allowed':
          alert('Please enable microphone permissions in your browser settings');
          break;
        case 'audio-capture':
          alert('No microphone detected. Please connect a microphone and try again');
          break;
        case 'not-supported':
          alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari');
          break;
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Recorder with Error Handling</h2>

      <VoiceRecorder
        onError={handleError}
        options={{
          speechRecognitionConfig: {
            autoRestart: true,
            restartDelay: 1000,
          },
        }}
      />

      {/* Error Log */}
      {errorLog.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Error Log ({attempts} attempts):</h3>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg max-h-48 overflow-y-auto">
            {errorLog.map((log, index) => (
              <div key={index} className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Example 5: With Analytics Tracking
// ============================================================================

export function RecorderWithAnalytics() {
  const [analyticsData, setAnalyticsData] = useState({
    recordingCount: 0,
    totalDuration: 0,
    totalWords: 0,
    averageConfidence: 0,
  });

  const handleRecordingComplete = (transcript: string, metadata: RecordingMetadata) => {
    // Track analytics
    setAnalyticsData((prev) => ({
      recordingCount: prev.recordingCount + 1,
      totalDuration: prev.totalDuration + metadata.duration,
      totalWords: prev.totalWords + transcript.split(/\s+/).length,
      averageConfidence:
        (prev.averageConfidence * prev.recordingCount + metadata.averageConfidence) /
        (prev.recordingCount + 1),
    }));

    // Send to analytics service
    console.log('Analytics:', {
      event: 'recording_completed',
      duration: metadata.duration,
      wordCount: transcript.split(/\s+/).length,
      confidence: metadata.averageConfidence,
      language: metadata.language,
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Recorder with Analytics</h2>

      {/* Analytics Dashboard */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {analyticsData.recordingCount}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Recordings</div>
        </div>
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {Math.floor(analyticsData.totalDuration / 1000)}s
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Duration</div>
        </div>
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {analyticsData.totalWords}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Words</div>
        </div>
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {Math.round(analyticsData.averageConfidence * 100)}%
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Confidence</div>
        </div>
      </div>

      <VoiceRecorder onRecordingComplete={handleRecordingComplete} />
    </div>
  );
}

// ============================================================================
// Example 6: Compact Mode (Minimal UI)
// ============================================================================

export function CompactRecorder() {
  const [transcript, setTranscript] = useState('');

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-xl font-bold mb-4">Quick Voice Note</h2>

      <VoiceRecorder
        onTranscriptChange={setTranscript}
        showControls={true}
        showTranscript={false}
        className="mb-4"
      />

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Transcript will appear here..."
        className="w-full h-32 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 resize-none"
      />
    </div>
  );
}

// ============================================================================
// Export all examples
// ============================================================================

export default {
  BasicInterviewAnswer,
  CustomRecorderUI,
  MultiLanguageRecorder,
  RecorderWithErrorHandling,
  RecorderWithAnalytics,
  CompactRecorder,
};
