# Voice Configuration Guide

## Indian English Voice Setup

The interview application now uses **Indian English (en-IN)** voices by default for a more natural Indian interview experience.

## Current Configuration

### Text-to-Speech (TTS)
- **Primary**: Indian English voices (`en-IN`)
- **Fallback**: Generic English voices
- **Voice names**: Looks for voices containing 'India', 'Ravi', 'Neel', etc.

### Speech Recognition
- **Language**: `en-IN` (Indian English accent recognition)
- **Recognition**: Can understand Indian English pronunciations

## Enabling Indian English Voices

### On macOS
1. Open **System Settings** → **Accessibility** → **Spoken Content**
2. Click **System Voice** → **Manage Voices**
3. Find and download **Indian English** voices:
   - Ravi (Male)
   - Lekha (Female)
4. Restart your browser

### On Windows 10/11
1. Open **Settings** → **Time & Language** → **Speech**
2. Click **Manage voices**
3. Click **Add voices**
4. Search and install **English (India)** voices:
   - Microsoft Ravi Online (Natural) - Male
   - Microsoft Neerja Online (Natural) - Female
5. Restart your browser

### On Chrome/Edge (Online Voices)
- Google Chrome and Edge may offer online Google TTS voices
- These voices include Indian English options automatically
- Requires internet connection

### On Ubuntu/Linux
```bash
# Install Indian English voices
sudo apt-get install speech-dispatcher
sudo apt-get install espeak-ng-data

# For better quality, install Festival voices
sudo apt-get install festival festvox-kallpc16k
```

## Checking Available Voices

When you run the frontend in development mode, the app will automatically log all available voices to the browser console:

```
🗣️ Available Voices: 50
────────────────────────────────────────────────────────────────────────────────

🇮🇳 INDIAN ENGLISH VOICES:
  ✓ Ravi (en-IN)
  ✓ Lekha (en-IN)

🌍 OTHER ENGLISH VOICES:
  ...
```

## Testing the Voice

1. Start the frontend: `cd frontend && npm run dev`
2. Open browser console (F12)
3. Check the logged voices
4. Start an interview to hear the voice

## Voice Parameters

The current voice settings in `voice.service.ts`:
- **Rate**: 0.9 (slightly slower for clarity)
- **Pitch**: 1.0 (natural pitch)
- **Volume**: 1.0 (full volume)

You can adjust these in the `speak()` method if needed.

## Troubleshooting

### No Indian voices available?
- Install voices from your OS settings (see above)
- Restart browser after installation
- Check console logs to verify voice availability

### Voice sounds wrong?
- The app will fallback to any available English voice
- Check which voice is being used in console: `🗣️ Using voice: ...`

### Recognition not working well?
- Speak clearly with natural pace
- Make sure microphone permissions are granted
- Check if browser supports `en-IN` recognition

## Manual Voice Selection (Advanced)

To manually test different voices, open browser console and run:

```javascript
// List all voices
window.speechSynthesis.getVoices().forEach(v => 
  console.log(v.name, v.lang)
);

// Test a specific voice
const utterance = new SpeechSynthesisUtterance('Hello, this is a test');
utterance.voice = window.speechSynthesis.getVoices().find(v => v.lang === 'en-IN');
window.speechSynthesis.speak(utterance);
```
