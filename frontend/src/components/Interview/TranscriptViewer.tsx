import React, { useEffect, useRef } from 'react';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

export interface TranscriptViewerProps {
  transcript: string;
  interimTranscript?: string;
  isListening: boolean;
  showWordCount?: boolean;
  showCharCount?: boolean;
  maxHeight?: string;
  className?: string;
}

// ============================================================================
// TranscriptViewer Component
// ============================================================================

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  interimTranscript = '',
  isListening,
  showWordCount = true,
  showCharCount = true,
  maxHeight = '400px',
  className = '',
}) => {
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  /**
   * Auto-scroll to bottom when transcript updates
   */
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, interimTranscript]);

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Get word count
   */
  const getWordCount = (): number => {
    return transcript.split(' ').filter(Boolean).length;
  };

  /**
   * Get character count
   */
  const getCharCount = (): number => {
    return transcript.length;
  };

  /**
   * Copy transcript to clipboard
   */
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  /**
   * Download transcript as text file
   */
  const downloadTranscript = () => {
    const element = document.createElement('a');
    const file = new Blob([transcript], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `transcript-${new Date().toISOString()}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // ============================================================================
  // Render
  // ============================================================================

  const hasContent = transcript || interimTranscript;

  return (
    <div className={`transcript-viewer bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Live Transcript</h3>
        
        {/* Actions */}
        {hasContent && (
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Copy to clipboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              onClick={downloadTranscript}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title="Download transcript"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Transcript Content */}
      <div
        className="p-4 overflow-y-auto custom-scrollbar"
        style={{ maxHeight }}
      >
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg
              className="w-16 h-16 text-gray-300 mb-4"
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
            <p className="text-gray-500 text-lg font-medium mb-2">
              No transcript yet
            </p>
            <p className="text-gray-400 text-sm">
              Click "Start" to begin recording
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Final Transcript */}
            {transcript && (
              <p className="text-gray-900 text-base leading-relaxed whitespace-pre-wrap">
                {transcript}
              </p>
            )}

            {/* Interim Transcript */}
            {interimTranscript && (
              <p className="text-gray-500 text-base leading-relaxed italic whitespace-pre-wrap">
                {interimTranscript}
                {isListening && (
                  <span className="inline-block w-1 h-5 ml-1 bg-blue-500 animate-pulse" />
                )}
              </p>
            )}

            {/* Scroll anchor */}
            <div ref={transcriptEndRef} />
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {hasContent && (showWordCount || showCharCount) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-6 text-sm text-gray-600">
            {showWordCount && (
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                <span>
                  <strong>{getWordCount()}</strong> words
                </span>
              </div>
            )}
            {showCharCount && (
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>
                  <strong>{getCharCount()}</strong> characters
                </span>
              </div>
            )}
          </div>

          {/* Live Indicator */}
          {isListening && (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-red-600">LIVE</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TranscriptViewer;
