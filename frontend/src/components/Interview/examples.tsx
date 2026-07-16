import React, { useState } from 'react';
import { VoiceRecorder } from './VoiceRecorder';

/**
 * Example 1: Basic Usage
 */
export const BasicExample: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Basic Voice Recorder</h1>
      <VoiceRecorder />
    </div>
  );
};

/**
 * Example 2: With Callbacks
 */
export const CallbackExample: React.FC = () => {
  const [savedTranscript, setSavedTranscript] = useState<string>('');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  const handleTranscriptChange = (transcript: string) => {
    console.log('Transcript updated:', transcript);
  };

  const handleRecordingComplete = (transcript: string, duration: number) => {
    console.log('Recording complete!');
    console.log('Final transcript:', transcript);
    console.log('Duration:', duration, 'seconds');
    setSavedTranscript(transcript);
    setRecordingDuration(duration);
  };

  const handleError = (error: Error) => {
    console.error('Recording error:', error);
    alert(`Error: ${error.message}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Voice Recorder with Callbacks</h1>
      
      <VoiceRecorder
        onTranscriptChange={handleTranscriptChange}
        onRecordingComplete={handleRecordingComplete}
        onError={handleError}
        maxDuration={180} // 3 minutes
        autoStop={true}
      />

      {savedTranscript && (
        <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-900 mb-2">
            Saved Recording
          </h3>
          <p className="text-sm text-green-700 mb-4">
            Duration: {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
          </p>
          <p className="text-gray-800 whitespace-pre-wrap">{savedTranscript}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Example 3: Interview Question Answering
 */
export const InterviewExample: React.FC = () => {
  const [currentQuestion, setCurrentQuestion] = useState<number>(0);
  const [answers, setAnswers] = useState<Array<{ question: string; answer: string; duration: number }>>([]);

  const questions = [
    'Tell me about yourself and your background.',
    'What are your key strengths as a developer?',
    'Describe a challenging project you worked on.',
    'Where do you see yourself in 5 years?',
  ];

  const handleRecordingComplete = (transcript: string, duration: number) => {
    setAnswers([
      ...answers,
      {
        question: questions[currentQuestion],
        answer: transcript,
        duration,
      },
    ]);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Mock Interview</h1>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Question {currentQuestion + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(((currentQuestion + 1) / questions.length) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current Question */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Question {currentQuestion + 1}</h3>
        <p className="text-xl text-blue-800">{questions[currentQuestion]}</p>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePreviousQuestion}
          disabled={currentQuestion === 0}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50"
        >
          Previous Question
        </button>
        <button
          onClick={handleNextQuestion}
          disabled={currentQuestion === questions.length - 1}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          Next Question
        </button>
      </div>

      {/* Voice Recorder */}
      <VoiceRecorder
        key={currentQuestion} // Re-mount for each question
        onRecordingComplete={handleRecordingComplete}
        maxDuration={180}
        autoStop={true}
      />

      {/* Answers Summary */}
      {answers.length > 0 && (
        <div className="mt-8">
          <h3 className="text-2xl font-bold mb-4">Your Answers</h3>
          <div className="space-y-4">
            {answers.map((answer, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-lg font-semibold text-gray-900">
                    Question {index + 1}
                  </h4>
                  <span className="text-sm text-gray-500">
                    {Math.floor(answer.duration / 60)}:{(answer.duration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <p className="text-gray-700 mb-3">{answer.question}</p>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-800 whitespace-pre-wrap">{answer.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Example 4: Custom Styling
 */
export const CustomStyledExample: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 py-12">
      <div className="container mx-auto px-4">
        <h1 className="text-4xl font-bold text-white text-center mb-8">
          Custom Styled Recorder
        </h1>
        <div className="max-w-4xl mx-auto">
          <VoiceRecorder className="shadow-2xl" />
        </div>
      </div>
    </div>
  );
};

/**
 * Example 5: With API Integration
 */
export const ApiIntegrationExample: React.FC = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleRecordingComplete = async (transcript: string, duration: number) => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      // Simulate API call
      const response = await fetch('/api/interview/answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          interviewId: 'interview-123',
          answer: transcript,
          duration,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save answer');
      }

      const data = await response.json();
      console.log('Answer saved:', data);
      setSaveStatus('success');
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">API Integration Example</h1>

      <VoiceRecorder
        onRecordingComplete={handleRecordingComplete}
        maxDuration={300}
      />

      {/* Save Status */}
      {isSaving && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            <span className="text-blue-800">Saving your answer...</span>
          </div>
        </div>
      )}

      {saveStatus === 'success' && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-800">Answer saved successfully!</span>
          </div>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-red-800">Failed to save answer. Please try again.</span>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Main Example App
 */
export const ExampleApp: React.FC = () => {
  const [activeExample, setActiveExample] = useState<string>('basic');

  const examples = [
    { id: 'basic', name: 'Basic Usage', component: BasicExample },
    { id: 'callback', name: 'With Callbacks', component: CallbackExample },
    { id: 'interview', name: 'Interview Q&A', component: InterviewExample },
    { id: 'styled', name: 'Custom Styling', component: CustomStyledExample },
    { id: 'api', name: 'API Integration', component: ApiIntegrationExample },
  ];

  const ActiveComponent = examples.find((ex) => ex.id === activeExample)?.component || BasicExample;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-4 overflow-x-auto">
            {examples.map((example) => (
              <button
                key={example.id}
                onClick={() => setActiveExample(example.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  activeExample === example.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {example.name}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main>
        <ActiveComponent />
      </main>
    </div>
  );
};

export default ExampleApp;
