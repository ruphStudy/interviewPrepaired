export class VoiceService {
  private synthesis: SpeechSynthesis;
  private recognition: any; // SpeechRecognition
  private voices: SpeechSynthesisVoice[] = [];
  private voicesLoaded: boolean = false;

  constructor() {
    this.synthesis = window.speechSynthesis;
    this.initializeVoices();

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN'; // Indian English
      console.log('🎤 Speech Recognition initialized with Indian English (en-IN)');
    }
  }

  private initializeVoices() {
    // Try to load voices immediately
    this.voices = this.synthesis.getVoices();
    
    if (this.voices.length > 0) {
      this.voicesLoaded = true;
      console.log('✅ Voices loaded immediately:', this.voices.length);
      this.logAvailableVoices();
    } else {
      // Wait for voices to be loaded
      console.log('⏳ Waiting for voices to load...');
      this.synthesis.addEventListener('voiceschanged', () => {
        this.voices = this.synthesis.getVoices();
        this.voicesLoaded = true;
        console.log('✅ Voices loaded:', this.voices.length);
        this.logAvailableVoices();
      });
    }
  }

  private logAvailableVoices() {
    const indianVoices = this.voices.filter(v => 
      v.lang === 'en-IN' || v.lang === 'en_IN' || 
      v.name.toLowerCase().includes('ravi') || 
      v.name.toLowerCase().includes('lekha') ||
      v.name.toLowerCase().includes('neerja') ||
      v.name.toLowerCase().includes('india')
    );

    if (indianVoices.length > 0) {
      console.log('🇮🇳 Indian English voices available:');
      indianVoices.forEach(v => console.log(`   ✓ ${v.name} (${v.lang})`));
    } else {
      console.warn('⚠️ No Indian English voices found. Install them from system settings.');
      console.log('📝 Fallback: Will use UK/US English voices');
    }
  }

  private selectBestVoice(): SpeechSynthesisVoice | null {
    // Ensure voices are loaded
    if (this.voices.length === 0) {
      this.voices = this.synthesis.getVoices();
      if (this.voices.length > 0) {
        console.log('🔄 Voices loaded on-demand:', this.voices.length);
      }
    }

    if (this.voices.length === 0) {
      console.warn('⚠️ No voices available yet');
      return null;
    }

    // Priority 1: Indian English voices
    let voice = this.voices.find(v => v.lang === 'en-IN') ||
                this.voices.find(v => v.lang === 'en_IN') ||
                this.voices.find(v => v.name.toLowerCase().includes('ravi')) ||
                this.voices.find(v => v.name.toLowerCase().includes('lekha')) ||
                this.voices.find(v => v.name.toLowerCase().includes('neerja')) ||
                this.voices.find(v => v.name.toLowerCase().includes('india'));
    
    if (voice) {
      console.log('🎯 Selected: 🇮🇳 Indian English -', voice.name, '(' + voice.lang + ')');
      return voice;
    }

    // Priority 2: UK English (closer to Indian accent)
    voice = this.voices.find(v => v.lang === 'en-GB' && v.name.includes('Google')) ||
            this.voices.find(v => v.lang === 'en-GB');
    
    if (voice) {
      console.log('🎯 Selected: 🇬🇧 UK English (fallback) -', voice.name, '(' + voice.lang + ')');
      return voice;
    }

    // Priority 3: Any Google English voice
    voice = this.voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
    
    if (voice) {
      console.log('🎯 Selected: 🌐 Google English -', voice.name, '(' + voice.lang + ')');
      return voice;
    }

    // Priority 4: Any English voice
    voice = this.voices.find(v => v.lang.startsWith('en'));
    
    if (voice) {
      console.log('🎯 Selected: 🗣️ Default English -', voice.name, '(' + voice.lang + ')');
      return voice;
    }

    console.error('❌ No English voices found! Available voices:', this.voices.map(v => `${v.name} (${v.lang})`).slice(0, 5));
    return null;
  }

  // Text to Speech
  speak(text: string, onEnd?: () => void): void {
    // Cancel any ongoing speech
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Log current state
    console.log(`🔊 Speaking (${this.voices.length} voices available)`);
    
    // Select best available voice
    const selectedVoice = this.selectBestVoice();
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      console.warn('⚠️ Using default system voice (no voice selected)');
    }

    // Voice parameters
    utterance.rate = 0.9;   // Slightly slower for clarity
    utterance.pitch = 1.0;  // Natural pitch
    utterance.volume = 1.0; // Full volume

    // Critical fix: Ensure callback is ALWAYS called
    let callbackCalled = false;
    const safeCallback = () => {
      if (!callbackCalled && onEnd) {
        callbackCalled = true;
        console.log('✅ Speech completed');
        onEnd();
      }
    };

    if (onEnd) {
      utterance.onend = safeCallback;
      utterance.onerror = (event) => {
        console.error('❌ Speech error:', event);
        safeCallback(); // Call callback even on error
      };

      // Fallback timeout: Force callback after 5 seconds
      const estimatedDuration = Math.max(text.length * 50, 5000); // ~50ms per character, min 5s
      setTimeout(() => {
        if (!callbackCalled) {
          console.warn('⏰ Speech timeout - forcing callback');
          safeCallback();
        }
      }, estimatedDuration);
    }

    this.synthesis.speak(utterance);
  }

  stopSpeaking(): void {
    this.synthesis.cancel();
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  // Speech to Text
  startListening(
    onResult: (transcript: string, isFinal: boolean) => void,
    onError?: (error: any) => void
  ): void {
    if (!this.recognition) {
      console.error('Speech recognition not supported');
      if (onError) {
        onError(new Error('Speech recognition not supported'));
      }
      return;
    }

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        onResult(finalTranscript.trim(), true);
      } else if (interimTranscript) {
        onResult(interimTranscript, false);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (onError) {
        onError(event.error);
      }
    };

    this.recognition.start();
  }

  stopListening(): void {
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  isListening(): boolean {
    return this.recognition && this.recognition.started;
  }

  isSupported(): { synthesis: boolean; recognition: boolean } {
    return {
      synthesis: 'speechSynthesis' in window,
      recognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
    };
  }

  // Debug: List all available voices
  listAllVoices(): void {
    console.log('\n' + '='.repeat(80));
    console.log('🗣️  ALL AVAILABLE VOICES');
    console.log('='.repeat(80));
    
    if (this.voices.length === 0) {
      this.voices = this.synthesis.getVoices();
    }

    const grouped: { [key: string]: SpeechSynthesisVoice[] } = {};
    this.voices.forEach(voice => {
      if (!grouped[voice.lang]) grouped[voice.lang] = [];
      grouped[voice.lang].push(voice);
    });

    // Indian voices
    const indianLangs = ['en-IN', 'en_IN'];
    const hasIndian = indianLangs.some(lang => grouped[lang]?.length > 0);
    
    if (hasIndian) {
      console.log('\n🇮🇳 INDIAN ENGLISH (Will be used):');
      indianLangs.forEach(lang => {
        grouped[lang]?.forEach(v => console.log(`  ✅ ${v.name} (${v.lang})`));
      });
    } else {
      console.log('\n❌ NO INDIAN ENGLISH VOICES');
      console.log('   Install from:');
      console.log('   • macOS: System Settings → Accessibility → Spoken Content → Manage Voices');
      console.log('   • Windows: Settings → Time & Language → Speech → Manage voices');
    }

    // UK English
    if (grouped['en-GB']) {
      console.log('\n🇬🇧 UK ENGLISH (Good fallback):');
      grouped['en-GB'].forEach(v => console.log(`  • ${v.name}`));
    }

    // US English
    if (grouped['en-US']) {
      console.log('\n🇺🇸 US ENGLISH (Last resort):');
      grouped['en-US'].slice(0, 3).forEach(v => console.log(`  • ${v.name}`));
      if (grouped['en-US'].length > 3) {
        console.log(`  ... and ${grouped['en-US'].length - 3} more`);
      }
    }

    console.log('\n' + '='.repeat(80) + '\n');
  }
}

export const voiceService = new VoiceService();
