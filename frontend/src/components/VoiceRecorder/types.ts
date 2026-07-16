/**
 * Voice Recorder Module - Type Definitions
 * 
 * Complete type system for voice recording functionality
 * including speech recognition, recording states, and events.
 */

// ============================================================================
// Recording States
// ============================================================================

/**
 * Recording state machine
 */
export enum RecordingState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  ERROR = 'error',
}

/**
 * Recognition state
 */
export enum RecognitionState {
  INACTIVE = 'inactive',
  STARTING = 'starting',
  ACTIVE = 'active',
  STOPPING = 'stopping',
  ERROR = 'error',
}

// ============================================================================
// Speech Recognition Types
// ============================================================================

/**
 * Speech recognition result
 */
export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

/**
 * Transcript segment
 */
export interface TranscriptSegment {
  id: string;
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
  duration?: number;
}

/**
 * Complete transcript data
 */
export interface TranscriptData {
  segments: TranscriptSegment[];
  finalTranscript: string;
  interimTranscript: string;
  fullTranscript: string;
  wordCount: number;
  characterCount: number;
  duration: number;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Speech recognition configuration
 */
export interface SpeechRecognitionConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  autoRestart?: boolean;
  restartDelay?: number;
}

/**
 * Recording options
 */
export interface RecordingOptions {
  maxDuration?: number; // milliseconds
  autoPause?: boolean;
  silenceThreshold?: number; // milliseconds
  speechRecognitionConfig?: SpeechRecognitionConfig;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Speech recognition error codes
 */
export enum SpeechRecognitionErrorCode {
  NO_SPEECH = 'no-speech',
  ABORTED = 'aborted',
  AUDIO_CAPTURE = 'audio-capture',
  NETWORK = 'network',
  NOT_ALLOWED = 'not-allowed',
  SERVICE_NOT_ALLOWED = 'service-not-allowed',
  BAD_GRAMMAR = 'bad-grammar',
  LANGUAGE_NOT_SUPPORTED = 'language-not-supported',
  NOT_SUPPORTED = 'not-supported',
  UNKNOWN = 'unknown',
}

/**
 * Speech recognition error
 */
export interface SpeechRecognitionError {
  code: SpeechRecognitionErrorCode;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

// ============================================================================
// Browser Compatibility
// ============================================================================

/**
 * Browser support status
 */
export interface BrowserSupport {
  speechRecognition: boolean;
  webkitSpeechRecognition: boolean;
  mediaDevices: boolean;
  getUserMedia: boolean;
  isSupported: boolean;
  browserName?: string;
  suggestions?: string[];
}

// ============================================================================
// Recording Metadata
// ============================================================================

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  startTime: number;
  endTime?: number;
  duration: number;
  pausedDuration: number;
  state: RecordingState;
  language: string;
  segmentCount: number;
  averageConfidence: number;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Recording event types
 */
export enum RecordingEventType {
  START = 'start',
  STOP = 'stop',
  PAUSE = 'pause',
  RESUME = 'resume',
  RESULT = 'result',
  ERROR = 'error',
  END = 'end',
  AUDIO_START = 'audio-start',
  AUDIO_END = 'audio-end',
  SOUND_START = 'sound-start',
  SOUND_END = 'sound-end',
  SPEECH_START = 'speech-start',
  SPEECH_END = 'speech-end',
}

/**
 * Recording event
 */
export interface RecordingEvent {
  type: RecordingEventType;
  timestamp: number;
  data?: any;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * Speech recognition hook return type
 */
export interface UseSpeechRecognitionReturn {
  // State
  isListening: boolean;
  recordingState: RecordingState;
  recognitionState: RecognitionState;
  transcript: TranscriptData;
  error: SpeechRecognitionError | null;
  browserSupport: BrowserSupport;
  metadata: RecordingMetadata;

  // Actions
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  resetRecording: () => void;
  clearTranscript: () => void;

  // Utilities
  getFullTranscript: () => string;
  getFinalTranscript: () => string;
  getInterimTranscript: () => string;
  getConfidence: () => number;
  getDuration: () => number;
  isRecording: () => boolean;
  canRecord: () => boolean;
}

// ============================================================================
// Component Props
// ============================================================================

/**
 * VoiceRecorder component props
 */
export interface VoiceRecorderProps {
  onTranscriptChange?: (transcript: string) => void;
  onRecordingComplete?: (transcript: string, metadata: RecordingMetadata) => void;
  onError?: (error: SpeechRecognitionError) => void;
  options?: RecordingOptions;
  autoStart?: boolean;
  showControls?: boolean;
  showTranscript?: boolean;
  className?: string;
  maxHeight?: string;
}

/**
 * SpeechControls component props
 */
export interface SpeechControlsProps {
  recordingState: RecordingState;
  isListening: boolean;
  canRecord: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * TranscriptViewer component props
 */
export interface TranscriptViewerProps {
  transcript: TranscriptData;
  recordingState: RecordingState;
  showInterim?: boolean;
  showTimestamps?: boolean;
  showConfidence?: boolean;
  highlightFinal?: boolean;
  maxHeight?: string;
  className?: string;
  emptyMessage?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Speech recognition instance type (extending native browser API)
 */
export interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  grammars: SpeechGrammarList;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

/**
 * Speech Recognition Error Event
 */
export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

/**
 * Window interface extension for browser compatibility
 */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
