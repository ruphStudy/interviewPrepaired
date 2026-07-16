# Voice Recorder - Quick Start Guide

## ⚡ 30-Second Setup

```bash
# The module is already in your project!
# Import and use:
```

```tsx
import { VoiceRecorder } from '@/components/VoiceRecorder';

function MyInterview() {
  return (
    <VoiceRecorder
      onRecordingComplete={(transcript) => {
        console.log('Answer:', transcript);
      }}
    />
  );
}
```

**That's it!** You now have a fully functional voice recorder with real-time transcription.

---

## 📋 Common Use Cases

### 1. Interview Answer Recording

```tsx
<VoiceRecorder
  onRecordingComplete={(transcript, metadata) => {
    submitAnswer({
      text: transcript,
      duration: metadata.duration,
      confidence: metadata.averageConfidence,
    });
  }}
  options={{
    maxDuration: 5 * 60 * 1000, // 5 minutes
  }}
/>
```

### 2. Voice Notes

```tsx
const [notes, setNotes] = useState<string[]>([]);

<VoiceRecorder
  onRecordingComplete={(transcript) => {
    setNotes([...notes, transcript]);
  }}
/>
```

### 3. Live Transcription

```tsx
const [text, setText] = useState('');

<VoiceRecorder
  onTranscriptChange={(transcript) => {
    setText(transcript);
  }}
  showTranscript={false}
/>
<textarea value={text} />
```

---

## 🎮 Controls

### UI Buttons

- **Start Recording** - Begin recording
- **Stop** - End recording and finalize transcript
- **Pause** - Temporarily pause recording
- **Resume** - Continue recording
- **Re-record** - Clear and start over

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` or `R` | Start/Stop |
| `P` | Pause/Resume |
| `Esc` | Reset |

---

## 🎨 Customization

### Hide Controls

```tsx
<VoiceRecorder showControls={false} />
```

### Hide Transcript

```tsx
<VoiceRecorder showTranscript={false} />
```

### Change Language

```tsx
<VoiceRecorder
  options={{
    speechRecognitionConfig: {
      language: 'es-ES', // Spanish
    },
  }}
/>
```

### Custom Height

```tsx
<VoiceRecorder maxHeight="600px" />
```

### Auto-start

```tsx
<VoiceRecorder autoStart={true} />
```

---

## 🔧 Using the Hook Directly

```tsx
import { useSpeechRecognition } from '@/components/VoiceRecorder';

function CustomRecorder() {
  const {
    recordingState,
    transcript,
    startRecording,
    stopRecording,
  } = useSpeechRecognition();

  return (
    <div>
      <button onClick={startRecording}>Start</button>
      <button onClick={stopRecording}>Stop</button>
      <p>{transcript.fullTranscript}</p>
    </div>
  );
}
```

---

## 📊 Getting Data

### Full Transcript

```tsx
const { transcript } = useSpeechRecognition();

// Final + interim
transcript.fullTranscript

// Only final (confirmed)
transcript.finalTranscript

// Only interim (in progress)
transcript.interimTranscript

// Stats
transcript.wordCount
transcript.characterCount
transcript.duration
```

### Metadata

```tsx
const { metadata } = useSpeechRecognition();

metadata.startTime
metadata.endTime
metadata.duration
metadata.pausedDuration
metadata.state
metadata.language
metadata.segmentCount
metadata.averageConfidence
```

---

## ⚠️ Error Handling

```tsx
<VoiceRecorder
  onError={(error) => {
    if (error.code === 'not-allowed') {
      alert('Please enable microphone permissions');
    } else if (error.code === 'audio-capture') {
      alert('No microphone detected');
    } else if (!error.recoverable) {
      alert(error.message);
    }
    // Recoverable errors auto-retry
  }}
/>
```

---

## 🌐 Browser Support

✅ Chrome 33+  
✅ Edge 79+  
✅ Safari 14.5+  
❌ Firefox (not supported)

The component automatically detects support and shows a helpful message if unavailable.

---

## 🎯 Props Reference

### VoiceRecorder Component

```typescript
interface VoiceRecorderProps {
  // Callbacks
  onTranscriptChange?: (transcript: string) => void;
  onRecordingComplete?: (transcript: string, metadata: RecordingMetadata) => void;
  onError?: (error: SpeechRecognitionError) => void;

  // Options
  options?: {
    maxDuration?: number;
    speechRecognitionConfig?: {
      language?: string;
      continuous?: boolean;
      interimResults?: boolean;
      autoRestart?: boolean;
    };
  };

  // Display
  autoStart?: boolean;
  showControls?: boolean;
  showTranscript?: boolean;
  maxHeight?: string;
  className?: string;
}
```

### useSpeechRecognition Hook

```typescript
const {
  // State
  recordingState,     // 'idle' | 'recording' | 'paused' | 'stopped' | 'error'
  isListening,        // boolean
  transcript,         // TranscriptData object
  error,              // SpeechRecognitionError | null
  metadata,           // RecordingMetadata

  // Actions
  startRecording,     // () => Promise<void>
  stopRecording,      // () => Promise<void>
  pauseRecording,     // () => void
  resumeRecording,    // () => void
  resetRecording,     // () => void
  
  // Utilities
  getFullTranscript,  // () => string
  canRecord,          // () => boolean
} = useSpeechRecognition(options);
```

---

## 🚨 Common Issues

### Microphone Permission Denied

```
Error: "not-allowed"
Solution: Enable microphone in browser settings
Chrome: Settings > Privacy > Microphone
Safari: Preferences > Websites > Microphone
```

### No Microphone Detected

```
Error: "audio-capture"
Solution: Connect a microphone and refresh
```

### Browser Not Supported

```
Error: "not-supported"
Solution: Use Chrome, Edge, or Safari
```

### HTTPS Required

```
getUserMedia requires HTTPS in production
Solution: Deploy with SSL certificate
```

---

## 💡 Pro Tips

### 1. Debounce Updates

```tsx
const [debouncedText, setDebouncedText] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedText(transcript.fullTranscript);
  }, 500);
  return () => clearTimeout(timer);
}, [transcript]);
```

### 2. Save on Pause

```tsx
useEffect(() => {
  if (recordingState === RecordingState.PAUSED) {
    autosave(transcript.fullTranscript);
  }
}, [recordingState]);
```

### 3. Track Analytics

```tsx
<VoiceRecorder
  onRecordingComplete={(transcript, metadata) => {
    analytics.track('recording_completed', {
      duration: metadata.duration,
      wordCount: transcript.split(' ').length,
      language: metadata.language,
    });
  }}
/>
```

### 4. Validate Before Submit

```tsx
const handleComplete = (transcript: string) => {
  if (transcript.split(' ').length < 10) {
    alert('Answer too short. Please speak more.');
    return;
  }
  submitAnswer(transcript);
};
```

---

## 📱 Mobile Considerations

```tsx
// Larger touch targets on mobile
<style>
  @media (max-width: 768px) {
    .speech-controls button {
      min-height: 48px; /* Apple HIG recommendation */
      min-width: 48px;
    }
  }
</style>

// Prevent zoom on input focus
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
```

---

## 🔗 Links

- **Full Documentation**: [README.md](./README.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Examples**: [examples.tsx](./examples.tsx)
- **Types**: [types.ts](./types.ts)

---

## 🆘 Need Help?

1. Check [README.md](./README.md) for full API docs
2. See [examples.tsx](./examples.tsx) for more use cases
3. Review [ARCHITECTURE.md](./ARCHITECTURE.md) for deep dive

---

**Version**: 1.0.0  
**Last Updated**: June 9, 2026
