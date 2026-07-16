/**
 * TranscriptViewer Component
 * 
 * Displays live speech transcription with:
 * - Final and interim results
 * - Confidence scores
 * - Timestamps
 * - Auto-scrolling
 * - Visual highlighting
 */

import React, { useEffect, useRef } from 'react';
import { TranscriptViewerProps, RecordingState } from './types';

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  recordingState,
  showInterim = true,
  showTimestamps = false,
  showConfidence = false,
  highlightFinal = true,
  maxHeight = '400px',
  className = '',
  emptyMessage = 'Start recording to see transcript...',
}) => {
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (transcriptEndRef.current && containerRef.current) {
      const container = containerRef.current;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isNearBottom || recordingState === RecordingState.RECORDING) {
        transcriptEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }, [transcript, recordingState]);

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Format confidence as percentage
  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  // Get confidence color class
  const getConfidenceColorClass = (confidence: number): string => {
    if (confidence >= 0.9) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Check if transcript is empty
  const isEmpty = transcript.segments.length === 0 && !transcript.interimTranscript;

  return (
    <div className={`transcript-viewer ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-2">
          <svg
            className="w-5 h-5 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Transcript
          </h3>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{transcript.wordCount} words</span>
          <span>{transcript.characterCount} chars</span>
          {transcript.segments.length > 0 && showConfidence && (
            <span className={getConfidenceColorClass(transcript.segments[transcript.segments.length - 1].confidence)}>
              Avg: {formatConfidence(
                transcript.segments.reduce((sum, s) => sum + s.confidence, 0) / transcript.segments.length
              )}
            </span>
          )}
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={containerRef}
        className="transcript-content overflow-y-auto rounded-lg bg-gray-50 dark:bg-gray-900 p-4"
        style={{ maxHeight }}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-500">
            <svg
              className="w-12 h-12 mb-2 opacity-50"
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
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Final transcript segments */}
            {transcript.segments.map((segment) => (
              <div
                key={segment.id}
                className={`transcript-segment ${
                  highlightFinal
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="flex items-start space-x-2">
                  {/* Timestamp */}
                  {showTimestamps && (
                    <span className="text-xs text-gray-400 dark:text-gray-600 mt-0.5 min-w-[80px]">
                      {formatTimestamp(segment.timestamp)}
                    </span>
                  )}

                  {/* Text */}
                  <span className="flex-1 leading-relaxed">{segment.text}</span>

                  {/* Confidence */}
                  {showConfidence && (
                    <span
                      className={`text-xs ${getConfidenceColorClass(
                        segment.confidence
                      )} mt-0.5 min-w-[40px] text-right`}
                    >
                      {formatConfidence(segment.confidence)}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Interim transcript */}
            {showInterim && transcript.interimTranscript && (
              <div className="transcript-interim">
                <div className="flex items-start space-x-2">
                  {showTimestamps && <span className="text-xs min-w-[80px]"></span>}
                  <span className="flex-1 text-gray-500 dark:text-gray-400 italic leading-relaxed animate-pulse">
                    {transcript.interimTranscript}
                  </span>
                </div>
              </div>
            )}

            {/* Recording indicator */}
            {recordingState === RecordingState.RECORDING && (
              <div className="flex items-center space-x-2 text-red-500 dark:text-red-400 mt-4">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium">Recording...</span>
              </div>
            )}
          </div>
        )}

        {/* Auto-scroll anchor */}
        <div ref={transcriptEndRef} />
      </div>

      {/* Footer info */}
      {!isEmpty && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>
            Duration:{' '}
            {Math.floor(transcript.duration / 60000)}:
            {String(Math.floor((transcript.duration % 60000) / 1000)).padStart(2, '0')}
          </span>
          <span>{transcript.segments.length} segments</span>
        </div>
      )}
    </div>
  );
};

export default TranscriptViewer;
