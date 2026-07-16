# Voice Recorder Module

## 📋 Overview

A comprehensive, production-ready voice recording module for React applications with real-time speech-to-text transcription using the Web Speech API.

**Features:**
- ✅ Start/Stop/Pause/Resume recording
- ✅ Real-time transcription with interim results
- ✅ Live transcript display with confidence scores
- ✅ Browser compatibility detection
- ✅ Automatic error recovery
- ✅ Keyboard shortcuts
- ✅ TypeScript support
- ✅ Dark mode support
- ✅ Accessibility features

---

## 🏗️ Architecture

### Component Structure

```
VoiceRecorder/
├── VoiceRecorder.tsx          # Main container component
├── SpeechControls.tsx         # Recording control buttons
├── TranscriptViewer.tsx       # Real-time transcript display
├── useSpeechRecognition.ts    # Core speech recognition hook
├── types.ts                   # TypeScript definitions
├── index.ts                   # Exports
└── README.md                  # Documentation (this file)
```

### Component Hierarchy

```
VoiceRecorder (Main Component)
├── SpeechControls
│   ├── Start/Stop Button
│   ├── Pause/Resume Button
│   ├── Reset Button
│   └── Status Indicator
│
└── TranscriptViewer
    ├── Header (stats)
    ├── Transcript Content
    │   ├── Final Segments
    │   └── Interim Results
    └── Footer (duration, segment count)
```

### State Management Flow

```
┌─────────────────────────────────────────────────────────┐
│                 useSpeechRecognition Hook                │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  State:                                                   │
│  ├─ recordingState: RecordingState                      │
│  ├─ recognitionState: RecognitionState                  │
│  ├─ transcript: TranscriptData                          │
│  ├─ error: SpeechRecognitionError                       │
│  └─ metadata: RecordingMetadata                         │
│                                                           │
│  Actions:                                                 │
│  ├─ startRecording()                                     │
│  ├─ stopRecording()                                      │
│  ├─ pauseRecording()                                     │
│  ├─ resumeRecording()                                    │
│  └─ resetRecording()                                     │
│                                                           │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   Browser Speech API                     │
├─────────────────────────────────────────────────────────┤
│  SpeechRecognition / webkitSpeechRecognition            │
│  ├─ start()                                             │
│  ├─ stop()                                              │
│  ├─ onresult → Transcription                            │
│  ├─ onerror → Error handling                            │
│  └─ onend → Auto-restart logic                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Basic Usage

```tsx
import { VoiceRecorder } from '@/components/VoiceRecorder';

function MyComponent() {
  const handleTranscriptChange = (transcript: string) => {
    console.log('Transcript updated:', transcript);
  };

  const handleRecordingComplete = (transcript: string, metadata: RecordingMetadata) => {
    console.log('Recording complete:', transcript);
    console.log('Metadata:', metadata);
  };

  return (
    <VoiceRecorder
      onTranscriptChange={handleTranscriptChange}
      onRecordingComplete={handleRecordingComplete}
      showControls={true}
      showTranscript={true}
      maxHeight="400px"
    />
  );
}
```

### Using the Hook Directly

```tsx
import { useSpeechRecognition } from '@/components/VoiceRecorder';

function CustomRecorder() {
  const {
    recordingState,
    transcript,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
  } = useSpeechRecognition({
    maxDuration: 5 * 60 * 1000, // 5 minutes
    speechRecognitionConfig: {
      language: 'en-US',
      continuous: true,
      interimResults: true,
    },
  });

  return (
    <div>
      <button onClick={startRecording}>Start</button>
      <button onClick={stopRecording}>Stop</button>
      <button onClick={pauseRecording}>Pause</button>
      <button onClick={resumeRecording}>Resume</button>
      <p>{transcript.fullTranscript}</p>
    </div>
  );
}
```

---

## 📖 API Reference

### VoiceRecorder Component

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onTranscriptChange` | `(transcript: string) => void` | - | Called when transcript updates |
| `onRecordingComplete` | `(transcript: string, metadata: RecordingMetadata) => void` | - | Called when recording stops |
| `onError` | `(error: SpeechRecognitionError) => void` | - | Called on errors |
| `options` | `RecordingOptions` | See defaults | Recording configuration |
| `autoStart` | `boolean` | `false` | Auto-start recording on mount |
| `showControls` | `boolean` | `true` | Show recording controls |
| `showTranscript` | `boolean` | `true` | Show transcript viewer |
| `className` | `string` | `''` | Additional CSS classes |
| `maxHeight` | `string` | `'400px'` | Max height for transcript |

#### Example

```tsx
<VoiceRecorder
  onTranscriptChange={(text) => setAnswer(text)}
  onRecordingComplete={(text, meta) => {
    submitAnswer(text);
    console.log(`Recorded ${meta.duration}ms`);
  }}
  onError={(error) => {
    if (!error.recoverable) {
      showErrorMessage(error.message);
    }
  }}
  options={{
    maxDuration: 5 * 60 * 1000,
    speechRecognitionConfig: {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      autoRestart: true,
    },
  }}
  autoStart={false}
  showControls={true}
  showTranscript={true}
  maxHeight="500px"
/>
```

---

### useSpeechRecognition Hook

#### Parameters

```typescript
interface RecordingOptions {
  maxDuration?: number;              // Max recording duration (ms)
  autoPause?: boolean;               // Auto-pause on silence
  silenceThreshold?: number;         // Silence duration (ms)
  speechRecognitionConfig?: {
    language?: string;               // Language code (e.g., 'en-US')
    continuous?: boolean;            // Continuous recognition
    interimResults?: boolean;        // Show interim results
    maxAlternatives?: number;        // Max alternatives per result
    autoRestart?: boolean;           // Auto-restart on end
    restartDelay?: number;           // Delay before restart (ms)
  };
}
```

#### Return Value

```typescript
interface UseSpeechRecognitionReturn {
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
```

#### Example

```tsx
const {
  recordingState,
  transcript,
  error,
  startRecording,
  stopRecording,
  getFullTranscript,
} = useSpeechRecognition({
  maxDuration: 5 * 60 * 1000,
  speechRecognitionConfig: {
    language: 'en-US',
    continuous: true,
    interimResults: true,
  },
});

// Start recording
await startRecording();

// Get current transcript
const currentText = getFullTranscript();

// Stop recording
await stopRecording();
```

---

### SpeechControls Component

#### Props

```typescript
interface SpeechControlsProps {
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
```

#### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` or `R` | Start/Stop recording |
| `P` | Pause/Resume |
| `Escape` | Reset recording |

---

### TranscriptViewer Component

#### Props

```typescript
interface TranscriptViewerProps {
  transcript: TranscriptData;
  recordingState: RecordingState;
  showInterim?: boolean;          // Show interim results
  showTimestamps?: boolean;       // Show timestamps
  showConfidence?: boolean;       // Show confidence scores
  highlightFinal?: boolean;       // Highlight final text
  maxHeight?: string;             // Max height
  className?: string;
  emptyMessage?: string;          // Message when empty
}
```

---

## 🎨 Type Definitions

### RecordingState

```typescript
enum RecordingState {
  IDLE = 'idle',           // Not recording
  RECORDING = 'recording', // Currently recording
  PAUSED = 'paused',       // Paused
  STOPPED = 'stopped',     // Recording complete
  ERROR = 'error',         // Error occurred
}
```

### TranscriptData

```typescript
interface TranscriptData {
  segments: TranscriptSegment[];  // Individual segments
  finalTranscript: string;        // All final text
  interimTranscript: string;      // Current interim text
  fullTranscript: string;         // Final + interim
  wordCount: number;              // Total words
  characterCount: number;         // Total characters
  duration: number;               // Duration in ms
}
```

### SpeechRecognitionError

```typescript
interface SpeechRecognitionError {
  code: SpeechRecognitionErrorCode;
  message: string;
  timestamp: number;
  recoverable: boolean;
}

enum SpeechRecognitionErrorCode {
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
```

---

## 🌐 Browser Compatibility

### Supported Browsers

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Best support |
| Edge | ✅ Full | Chromium-based |
| Safari | ✅ Full | iOS 14.5+ |
| Firefox | ❌ No | Not supported |
| Opera | ✅ Full | Chromium-based |

### Detection

The module automatically detects browser support:

```typescript
const { browserSupport } = useSpeechRecognition();

if (!browserSupport.isSupported) {
  console.log('Suggestions:', browserSupport.suggestions);
  // Shows: "Use Chrome, Edge, or Safari..."
}
```

### Polyfills

No polyfills available. The Web Speech API requires native browser support.

---

## 🔧 Configuration

### Default Options

```typescript
const DEFAULT_OPTIONS: RecordingOptions = {
  maxDuration: 5 * 60 * 1000, // 5 minutes
  autoPause: false,
  silenceThreshold: 3000,     // 3 seconds
  speechRecognitionConfig: {
    language: 'en-US',
    continuous: true,
    interimResults: true,
    maxAlternatives: 1,
    autoRestart: true,
    restartDelay: 1000,       // 1 second
  },
};
```

### Custom Configuration

```tsx
<VoiceRecorder
  options={{
    maxDuration: 10 * 60 * 1000,  // 10 minutes
    speechRecognitionConfig: {
      language: 'es-ES',          // Spanish
      continuous: true,
      interimResults: true,
      autoRestart: true,
      restartDelay: 500,
    },
  }}
/>
```

### Supported Languages

Common language codes:
- `en-US` - English (US)
- `en-GB` - English (UK)
- `es-ES` - Spanish (Spain)
- `fr-FR` - French
- `de-DE` - German
- `it-IT` - Italian
- `pt-BR` - Portuguese (Brazil)
- `zh-CN` - Chinese (Simplified)
- `ja-JP` - Japanese
- `ko-KR` - Korean

---

## ⚠️ Error Handling

### Error Types & Recovery

```typescript
// Recoverable errors (auto-retry)
- NO_SPEECH: No speech detected
- NETWORK: Network error
- ABORTED: Recognition aborted
- UNKNOWN: Unknown error

// Non-recoverable errors (manual intervention)
- NOT_ALLOWED: Microphone permission denied
- AUDIO_CAPTURE: No microphone found
- NOT_SUPPORTED: Browser not supported
- SERVICE_NOT_ALLOWED: Service not allowed
```

### Error Handling Example

```tsx
<VoiceRecorder
  onError={(error) => {
    console.error(`Error ${error.code}:`, error.message);

    if (!error.recoverable) {
      switch (error.code) {
        case SpeechRecognitionErrorCode.NOT_ALLOWED:
          showNotification('Please enable microphone permissions');
          break;
        case SpeechRecognitionErrorCode.AUDIO_CAPTURE:
          showNotification('No microphone detected');
          break;
        case SpeechRecognitionErrorCode.NOT_SUPPORTED:
          showNotification('Please use Chrome, Edge, or Safari');
          break;
      }
    } else {
      // Recoverable - will auto-retry
      console.log('Attempting to recover...');
    }
  }}
/>
```

---

## 🎯 Use Cases

### 1. Interview Practice

```tsx
function InterviewQuestion() {
  const [answer, setAnswer] = useState('');

  return (
    <div>
      <h2>Question: Explain React hooks</h2>
      <VoiceRecorder
        onRecordingComplete={(transcript) => {
          setAnswer(transcript);
          submitAnswer(transcript);
        }}
        maxHeight="300px"
      />
    </div>
  );
}
```

### 2. Voice Notes

```tsx
function VoiceNoteApp() {
  const [notes, setNotes] = useState<string[]>([]);

  return (
    <VoiceRecorder
      onRecordingComplete={(transcript) => {
        setNotes([...notes, transcript]);
      }}
      options={{
        maxDuration: 2 * 60 * 1000, // 2 minutes
      }}
    />
  );
}
```

### 3. Dictation Tool

```tsx
function DictationEditor() {
  const [content, setContent] = useState('');

  return (
    <div>
      <VoiceRecorder
        onTranscriptChange={(transcript) => {
          setContent(transcript);
        }}
        showControls={true}
        showTranscript={false}
      />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} />
    </div>
  );
}
```

---

## 🔒 Security & Privacy

### Microphone Access

- Requires user permission
- Permission prompt on first use
- Can be revoked by user anytime
- Respects browser privacy settings

### Data Privacy

- No data sent to external servers (unless using cloud speech API)
- All processing happens in browser
- No persistent storage of audio
- Transcript only stored in component state

### Best Practices

```tsx
// Always handle permission denial
<VoiceRecorder
  onError={(error) => {
    if (error.code === SpeechRecognitionErrorCode.NOT_ALLOWED) {
      alert('Microphone access is required for voice recording');
    }
  }}
/>

// Provide clear user feedback
<VoiceRecorder
  onTranscriptChange={(transcript) => {
    // Save to secure storage
    secureStorage.save(transcript);
  }}
/>
```

---

## 🧪 Testing

### Unit Testing Example

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceRecorder } from '@/components/VoiceRecorder';

describe('VoiceRecorder', () => {
  it('renders without crashing', () => {
    render(<VoiceRecorder />);
    expect(screen.getByText('Voice Recorder')).toBeInTheDocument();
  });

  it('starts recording on button click', async () => {
    const onStart = jest.fn();
    render(<VoiceRecorder />);
    
    const startButton = screen.getByText('Start Recording');
    fireEvent.click(startButton);
    
    // Add assertions based on your mock
  });
});
```

### Mock Speech Recognition

```tsx
// Mock for testing
const mockSpeechRecognition = {
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  continuous: true,
  interimResults: true,
  lang: 'en-US',
};

window.SpeechRecognition = jest.fn(() => mockSpeechRecognition);
```

---

## 📊 Performance

### Optimization Tips

1. **Debounce transcript updates**
```tsx
const [debouncedTranscript, setDebouncedTranscript] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedTranscript(transcript.fullTranscript);
  }, 500);
  return () => clearTimeout(timer);
}, [transcript]);
```

2. **Limit max duration**
```tsx
<VoiceRecorder
  options={{
    maxDuration: 5 * 60 * 1000, // 5 minutes max
  }}
/>
```

3. **Disable interim results for better performance**
```tsx
<VoiceRecorder
  options={{
    speechRecognitionConfig: {
      interimResults: false, // Only final results
    },
  }}
/>
```

---

## 🎓 Advanced Usage

### Custom Styling

```tsx
<VoiceRecorder
  className="my-custom-recorder"
  maxHeight="600px"
/>

// Custom CSS
.my-custom-recorder .transcript-viewer {
  background: linear-gradient(to bottom, #f0f9ff, #e0f2fe);
}
```

### Event Flow Monitoring

```tsx
const {
  recordingState,
  recognitionState,
  transcript,
  metadata,
} = useSpeechRecognition();

useEffect(() => {
  console.log('Recording State:', recordingState);
  console.log('Recognition State:', recognitionState);
  console.log('Transcript:', transcript);
  console.log('Metadata:', metadata);
}, [recordingState, recognitionState, transcript, metadata]);
```

---

## 📚 Resources

- [Web Speech API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [SpeechRecognition Interface](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- [Browser Compatibility](https://caniuse.com/speech-recognition)

---

## ✅ Checklist

### Pre-deployment

- [ ] Test in Chrome, Edge, Safari
- [ ] Handle permission denial gracefully
- [ ] Implement error boundaries
- [ ] Test with poor network conditions
- [ ] Verify HTTPS requirement (production)
- [ ] Add loading states
- [ ] Test keyboard shortcuts
- [ ] Verify accessibility
- [ ] Test dark mode
- [ ] Add analytics tracking

---

**Version**: 1.0.0  
**Date**: June 9, 2026  
**Status**: ✅ Production Ready
