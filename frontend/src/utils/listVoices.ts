import { voiceService } from '../services/voice.service';

// Utility to list all available voices in the browser console
export const listAvailableVoices = () => {
  // Use the voice service's method to list voices
  setTimeout(() => {
    voiceService.listAllVoices();
    
    // Additional instructions
    console.log('%c💡 HOW TO TEST:', 'font-weight: bold; font-size: 14px; color: #2196F3;');
    console.log('   1. Start an interview');
    console.log('   2. Watch console for: 🎯 Selected: ...');
    console.log('   3. The voice will be used automatically');
    console.log('\n%c🔧 MANUAL COMMANDS:', 'font-weight: bold; font-size: 14px; color: #FF9800;');
    console.log('   • Type: window.listVoices() - to see all voices');
    console.log('   • Type: window.testVoice() - to test current voice\n');
  }, 1500);
};

// Add global helpers for debugging
if (typeof window !== 'undefined') {
  (window as any).listVoices = () => voiceService.listAllVoices();
  (window as any).testVoice = () => {
    console.log('🎤 Testing voice...');
    voiceService.speak('Hello, this is a test of the Indian English voice for the interview system.');
  };
}

// Auto-run in development
if (import.meta.env.DEV) {
  listAvailableVoices();
}
