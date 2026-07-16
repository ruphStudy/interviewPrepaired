/**
 * Voice Recorder Module
 * 
 * Complete voice recording implementation with Browser Speech Recognition API
 * 
 * Features:
 * - Start/Stop/Pause/Resume recording
 * - Re-record functionality
 * - Live speech-to-text transcription
 * - Real-time confidence scoring
 * - Error handling with auto-retry
 * - Responsive UI components
 * - TypeScript support
 */

export { VoiceRecorder } from './VoiceRecorder';
export { SpeechControls } from './SpeechControls';
export { TranscriptViewer } from './TranscriptViewer';
export { useSpeechRecognition } from './hooks/useSpeechRecognition';

export type {
  VoiceRecorderProps,
} from './VoiceRecorder';

export type {
  SpeechControlsProps,
} from './SpeechControls';

export type {
  TranscriptViewerProps,
} from './TranscriptViewer';

export type {
  SpeechRecognitionResult,
  UseSpeechRecognitionOptions,
  UseSpeechRecognitionReturn,
} from './hooks/useSpeechRecognition';
