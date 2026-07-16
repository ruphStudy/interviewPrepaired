# Voice Recorder - Quick Start Guide

## 🚀 Get Started in 2 Minutes

### Step 1: Import the Component

```tsx
import { VoiceRecorder } from './components/Interview';
```

### Step 2: Add to Your App

```tsx
function App() {
  return (
    <div className="container mx-auto p-8">
      <VoiceRecorder />
    </div>
  );
}
```

### Step 3: Start Recording!

Click the **Start** button and begin speaking. Your speech will be transcribed in real-time!

---

## 🎯 Common Use Cases

### 1. Interview Question Answering

```tsx
function InterviewQuestion() {
  const handleComplete = (transcript: string, duration: number) => {
    console.log('Answer:', transcript);
    console.log('Duration:', duration, 'seconds');
    // Save to backend
  };

  return (
    <div>
      <h2>Question: Tell me about yourself</h2>
      <VoiceRecorder
        onRecordingComplete={handleComplete}
        maxDuration={180}
      />
    </div>
  );
}
```

### 2. Meeting Notes

```tsx
function MeetingNotes() {
  const [notes, setNotes] = useState('');

  return (
    <VoiceRecorder
      onTranscriptChange={setNotes}
      maxDuration={3600} // 1 hour
    />
  );
}
```

### 3. Voice Commands

```tsx
function VoiceCommands() {
  const handleComplete = (transcript: string) => {
    if (transcript.toLowerCase().includes('open menu')) {
      openMenu();
    }
  };

  return (
    <VoiceRecorder
      onRecordingComplete={handleComplete}
      maxDuration={10}
    />
  );
}
```

---

## 🛠️ Customization

### Change Language

```tsx
import { useSpeechRecognition } from './components/Interview';

const {
  transcript,
  isListening,
  startListening,
  stopListening,
} = useSpeechRecognition({
  lang: 'es-ES', // Spanish
});
```

### Set Max Duration

```tsx
<VoiceRecorder
  maxDuration={120} // 2 minutes
  autoStop={true}
/>
```

### Add Custom Styling

```tsx
<VoiceRecorder
  className="shadow-2xl border-2 border-blue-500"
/>
```

---

## 🎨 Control Buttons

| Button | Action | Keyboard |
|--------|--------|----------|
| Start | Begin recording | `Space` |
| Stop | End recording | - |
| Pause | Pause recording | - |
| Resume | Continue recording | - |
| Re-record | Clear and restart | `R` |
| Clear | Delete transcript | `C` |

---

## ⚡ Key Features

✅ **Real-time Transcription** - See your words as you speak  
✅ **Pause/Resume** - Take breaks without losing progress  
✅ **Re-record** - Start over anytime  
✅ **Confidence Score** - See recognition accuracy  
✅ **Auto-save** - Never lose your transcript  
✅ **Export** - Copy or download as text  

---

## 🔧 Requirements

- HTTPS connection (for microphone access)
- Chrome, Edge, or Safari browser
- Microphone permissions

---

## 📱 Mobile Support

Works perfectly on mobile devices:
- iOS Safari 14.5+
- Chrome Mobile
- Edge Mobile

---

## 🐛 Troubleshooting

### Microphone not working?

1. Check browser permissions
2. Ensure HTTPS connection
3. Try reloading the page

### No transcript appearing?

1. Speak clearly and at moderate pace
2. Reduce background noise
3. Check microphone volume

### Browser not supported?

Use Chrome, Edge, or Safari for best results.

---

## 📚 Next Steps

- Read the [Full Documentation](./README.md)
- Check out [Examples](./examples.tsx)
- Explore [API Reference](./README.md#api-reference)
- Review [Best Practices](./README.md#best-practices)

---

## 💡 Pro Tips

1. **Speak clearly** - Moderate pace works best
2. **Reduce noise** - Quiet environment improves accuracy
3. **Use HTTPS** - Required for microphone access
4. **Test first** - Try on your target browsers
5. **Save often** - Don't rely on memory

---

## 📞 Support

Need help? Check the documentation or examples for detailed guidance.

---

**Happy Recording! 🎤**
