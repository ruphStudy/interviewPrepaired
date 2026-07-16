/**
 * VoiceRecorder Module - Main Exports
 * 
 * Centralized exports for all voice recording components and utilities
 */

// Main component
export { VoiceRecorder } from './VoiceRecorder';
export { default } from './VoiceRecorder';

// Sub-components
export { SpeechControls } from './SpeechControls';
export { TranscriptViewer } from './TranscriptViewer';

// Hooks
export { useSpeechRecognition } from './useSpeechRecognition';

// Types
export * from './types';
export type {
  VoiceRecorderProps,
  SpeechControlsProps,
  TranscriptViewerProps,
  UseSpeechRecognitionReturn,
  RecordingState,
  RecognitionState,
  SpeechRecognitionConfig,
  RecordingOptions,
  TranscriptData,
  TranscriptSegment,
  SpeechRecognitionError,
  RecordingMetadata,
  BrowserSupport,
} from './types';
