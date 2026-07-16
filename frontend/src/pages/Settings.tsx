import { useState, useEffect } from 'react';
import { Moon, Sun, Volume2, VolumeX, Save } from 'lucide-react';
import { useSettingsStore } from '../store';
import toast from 'react-hot-toast';

export default function Settings() {
  const { theme, voiceEnabled, toggleTheme, setVoiceEnabled } = useSettingsStore();
  const [openAIKey, setOpenAIKey] = useState('');

  useEffect(() => {
    // Load saved API key from localStorage (for demo purposes)
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setOpenAIKey(savedKey);
    }
  }, []);

  const handleSaveSettings = () => {
    // Save API key to localStorage (in production, this should be handled more securely)
    if (openAIKey) {
      localStorage.setItem('openai_api_key', openAIKey);
    }
    toast.success('Settings saved successfully!');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Customize your interview coach experience
        </p>
      </div>

      {/* Appearance */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Appearance
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Theme</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose your preferred color scheme
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 hover:border-primary-500 transition-colors"
            >
              {theme === 'light' ? (
                <>
                  <Sun size={20} />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon size={20} />
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Voice Settings */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Voice Settings
        </h2>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">
                Enable Voice Interaction
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use text-to-speech and speech-to-text features
              </p>
            </div>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                voiceEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  voiceEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Note:</strong> Voice features use browser APIs and work best in Chrome, Edge, and Safari.
              Make sure to allow microphone access when prompted.
            </p>
          </div>
        </div>
      </div>

      {/* API Configuration */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          API Configuration
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="label">OpenAI API Key (Optional)</label>
            <input
              type="password"
              value={openAIKey}
              onChange={(e) => setOpenAIKey(e.target.value)}
              placeholder="sk-..."
              className="input"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Your API key is stored locally and never sent to our servers
            </p>
          </div>

          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Note:</strong> The backend should be configured with the OpenAI API key.
              This field is for reference only in this demo.
            </p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">About</h2>
        
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <strong>Version:</strong> 1.0.0
          </p>
          <p>
            <strong>Built with:</strong> React, TypeScript, Tailwind CSS, Node.js, Express, SQLite, OpenAI
          </p>
          <p>
            <strong>Features:</strong> Voice recognition, AI-powered evaluation, detailed feedback, progress tracking
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Save size={20} />
          <span>Save Settings</span>
        </button>
      </div>

      {/* Help Section */}
      <div className="card bg-gradient-to-br from-primary-50 to-blue-50 dark:from-primary-900/20 dark:to-blue-900/20 border-primary-200 dark:border-primary-800">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Need Help?</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Check the README.md file in the project repository for setup instructions,
          troubleshooting tips, and API configuration details.
        </p>
      </div>
    </div>
  );
}
