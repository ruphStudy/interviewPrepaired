import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { interviewApi, POPULAR_TOPICS, DIFFICULTY_LEVELS, INTERVIEW_STYLES, StartInterviewRequest } from '../api/interviewApi';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface FormErrors {
  topic?: string;
  difficulty?: string;
  experienceYears?: string;
  totalQuestions?: string;
}

// ============================================================================
// InterviewSetupPage Component
// ============================================================================

export const InterviewSetupPage: React.FC = () => {
  const navigate = useNavigate();

  // Form State
  const [topic, setTopic] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [interviewStyle, setInterviewStyle] = useState<string>('general');
  const [experienceYears, setExperienceYears] = useState<string>('');
  const [totalQuestions, setTotalQuestions] = useState<string>('5');

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');

  // ============================================================================
  // Validation
  // ============================================================================

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!topic || topic.trim() === '') {
      newErrors.topic = 'Please select a topic';
    } else if (topic === 'Other' && (!customTopic || customTopic.trim() === '')) {
      newErrors.topic = 'Please enter your custom topic';
    }

    if (!difficulty) {
      newErrors.difficulty = 'Please select a difficulty level';
    }

    const expYears = parseInt(experienceYears);
    if (!experienceYears) {
      newErrors.experienceYears = 'Experience years is required';
    } else if (isNaN(expYears) || expYears < 0 || expYears > 50) {
      newErrors.experienceYears = 'Experience years must be between 0 and 50';
    }

    const qCount = parseInt(totalQuestions);
    if (!totalQuestions) {
      newErrors.totalQuestions = 'Question count is required';
    } else if (isNaN(qCount) || qCount < 1 || qCount > 10) {
      newErrors.totalQuestions = 'Question count must be between 1 and 10';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleStartInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) {
      console.log('❌ Validation failed');
      return;
    }

    console.log('✅ Validation passed, starting interview...');
    setIsLoading(true);

    try {
      // Use customTopic if "Other" is selected, otherwise use selected topic
      const finalTopic = topic === 'Other' ? customTopic.trim() : topic;
      
      console.log('📝 Final topic:', finalTopic);
      
      const requestData: StartInterviewRequest = {
        topic: finalTopic,
        difficulty,
        experienceYears: parseInt(experienceYears),
        totalQuestions: parseInt(totalQuestions),
        interviewStyle,
      };

      console.log('📤 Sending request:', requestData);
      const response = await interviewApi.startInterview(requestData);
      console.log('📥 Response received:', response);

      if (response.success) {
        console.log('✅ Success! Navigating to interview...');
        // Navigate to interview page with interview ID and question data
        navigate(`/interview/${response.data.interview.id}`, {
          state: { 
            interview: response.data.interview,
          },
        });
      } else {
        console.error('❌ Response not successful');
        setApiError('Failed to start interview. Please try again.');
        setIsLoading(false);
      }
    } catch (error: any) {
      console.error('❌ Error starting interview:', error);
      setApiError(error.message || 'Failed to start interview. Please try again.');
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setTopic('');
    setCustomTopic('');
    setDifficulty('');
    setExperienceYears('');
    setTotalQuestions('5');
    setErrors({});
    setApiError('');
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8 min-h-screen">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">
              Setup Your Interview
            </h1>
            <p className="text-lg text-gray-600">
              Practice interviews for ANY field with AI-powered feedback
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Technology • Business • Finance • Sales • Marketing • Healthcare • and more!
            </p>
          </div>

        {/* Setup Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Setup Your Interview
          </h2>

          <form onSubmit={handleStartInterview} className="space-y-6">
            {/* Topic Selection */}
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-2">
                Interview Topic / Field *
              </label>
              <select
                id="topic"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  // Clear custom topic if switching away from "Other"
                  if (e.target.value !== 'Other') {
                    setCustomTopic('');
                  }
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.topic ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select a topic...</option>
                {POPULAR_TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {errors.topic && (
                <p className="mt-2 text-sm text-red-600">{errors.topic}</p>
              )}
            </div>

            {/* Custom Topic Input (shown when "Other" is selected) */}
            {topic === 'Other' && (
              <div>
                <label htmlFor="customTopic" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Your Topic *
                </label>
                <input
                  type="text"
                  id="customTopic"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  placeholder="e.g., Nursing, Real Estate, Mechanical Engineering..."
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                    errors.topic ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter any field or domain - the system works for ANY topic!
                </p>
              </div>
            )}

            {/* Difficulty Selection */}
            <div>
              <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-2">
                Difficulty Level *
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.difficulty ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">Select difficulty...</option>
                {DIFFICULTY_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              {errors.difficulty && (
                <p className="mt-2 text-sm text-red-600">{errors.difficulty}</p>
              )}
            </div>

            {/* Interview Style Selection */}
            <div>
              <label htmlFor="interviewStyle" className="block text-sm font-medium text-gray-700 mb-2">
                Interview Style
              </label>
              <select
                id="interviewStyle"
                value={interviewStyle}
                onChange={(e) => setInterviewStyle(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              >
                {INTERVIEW_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm text-gray-500">
                Choose the type of interview you want to practice
              </p>
            </div>

            {/* Experience Years */}
            <div>
              <label htmlFor="experienceYears" className="block text-sm font-medium text-gray-700 mb-2">
                Years of Experience *
              </label>
              <input
                type="number"
                id="experienceYears"
                value={experienceYears}
                onChange={(e) => setExperienceYears(e.target.value)}
                min="0"
                max="50"
                placeholder="e.g., 3"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.experienceYears ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.experienceYears && (
                <p className="mt-2 text-sm text-red-600">{errors.experienceYears}</p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Enter your years of experience in this field (0-50)
              </p>
            </div>

            {/* Question Count */}
            <div>
              <label htmlFor="totalQuestions" className="block text-sm font-medium text-gray-700 mb-2">
                Number of Questions *
              </label>
              <input
                type="number"
                id="totalQuestions"
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(e.target.value)}
                min="1"
                max="10"
                placeholder="5"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.totalQuestions ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.totalQuestions && (
                <p className="mt-2 text-sm text-red-600">{errors.totalQuestions}</p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Choose between 1-10 questions for your practice session
              </p>
            </div>

            {/* API Error */}
            {apiError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-red-500 mt-0.5 mr-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-red-900 mb-1">Error</h4>
                    <p className="text-sm text-red-700">{apiError}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <span>Start Interview</span>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Powered</h3>
            <p className="text-sm text-gray-600">
              Get intelligent feedback using OpenAI GPT-4 technology
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Voice Recording</h3>
            <p className="text-sm text-gray-600">
              Practice with real-time speech recognition and transcription
            </p>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-purple-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Detailed Reports</h3>
            <p className="text-sm text-gray-600">
              Receive comprehensive evaluation with scores and suggestions
            </p>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default InterviewSetupPage;
