import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { VoiceRecorder } from '../components/Interview';
import { interviewApi, SubmitAnswerRequest, EvaluationResult } from '../api/interviewApi';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

interface LocationState {
  interview?: {
    id: string;
    topic: string;
    difficulty: string;
    status: string;
    currentQuestion: {
      questionText: string;
      questionNumber: number;
    };
    totalQuestions: number;
  };
}

interface CurrentQuestion {
  text: string;
  number: number;
}

// ============================================================================
// InterviewPage Component
// ============================================================================

export const InterviewPage: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState;

  // Interview State
  const [interviewData, setInterviewData] = useState<any>(locationState?.interview || null);
  const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Answer State
  const [currentAnswer, setCurrentAnswer] = useState<string>('');
  const [answerDuration, setAnswerDuration] = useState<number>(0);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showEvaluation, setShowEvaluation] = useState<boolean>(false);

  // ============================================================================
  // Initialize
  // ============================================================================

  useEffect(() => {
    if (!interviewId) {
      navigate('/setup');
      return;
    }

    if (locationState?.interview) {
      const interview = locationState.interview;
      setCurrentQuestion({
        text: interview.currentQuestion.questionText,
        number: interview.currentQuestion.questionNumber,
      });
      setTotalQuestions(interview.totalQuestions);
      setInterviewData(interview);
    }
  }, [interviewId, locationState, navigate]);

  // ============================================================================
  // Text-to-Speech
  // ============================================================================

  const speakQuestion = () => {
    if (!currentQuestion || !('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(currentQuestion.text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // ============================================================================
  // Answer Submission
  // ============================================================================

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim()) {
      setError('Please record an answer before submitting');
      return;
    }

    if (!interviewId) {
      setError('Interview ID not found');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setShowEvaluation(false);

    try {
      const requestData: SubmitAnswerRequest = {
        interviewId,
        answer: currentAnswer,
        duration: answerDuration,
      };

      const response = await interviewApi.submitAnswer(requestData);

      if (response.success) {
        // Store evaluation
        setEvaluation(response.data.evaluation);
        setShowEvaluation(true);

        // Check if interview is completed
        if (response.data.interview.isCompleted) {
          setIsCompleted(true);
        } else if (response.data.nextQuestion) {
          // Update to next question
          setCurrentQuestion({
            text: response.data.nextQuestion.question,
            number: response.data.interview.currentQuestion,
          });
          setCurrentAnswer('');
          setAnswerDuration(0);
        }
      } else {
        setError('Failed to submit answer. Please try again.');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to submit answer. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // Voice Recorder Handlers
  // ============================================================================

  const handleTranscriptChange = (transcript: string) => {
    setCurrentAnswer(transcript);
  };

  const handleRecordingComplete = (transcript: string, duration: number) => {
    setCurrentAnswer(transcript);
    setAnswerDuration(duration);
  };

  // ============================================================================
  // Navigation
  // ============================================================================

  const handleContinue = () => {
    setShowEvaluation(false);
    setEvaluation(null);
  };

  const handleViewReport = () => {
    if (interviewId) {
      navigate(`/report/${interviewId}`);
    }
  };

  const handleExitInterview = () => {
    if (window.confirm('Are you sure you want to exit? Your progress will be saved.')) {
      navigate('/setup');
    }
  };

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-green-600';
    if (score >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 8) return 'bg-green-100';
    if (score >= 6) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                className="w-10 h-10 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Interview Completed!
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Congratulations! You've completed all {totalQuestions} questions.
            </p>

            {evaluation && (
              <div className="bg-blue-50 rounded-lg p-6 mb-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Final Question Score
                </h3>
                <div className={`text-5xl font-bold ${getScoreColor(evaluation.overallScore)} mb-2`}>
                  {evaluation.overallScore.toFixed(1)}/10
                </div>
                <p className="text-gray-600">Overall Score</p>
              </div>
            )}

            <div className="flex items-center justify-center space-x-4">
              <button
                onClick={handleViewReport}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
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
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span>View Detailed Report</span>
              </button>

              <button
                onClick={() => navigate('/setup')}
                className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Start New Interview
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleExitInterview}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg
                  className="w-6 h-6 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>

              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {interviewData?.topic} Interview
                </h1>
                <p className="text-sm text-gray-600">
                  {interviewData?.difficulty?.charAt(0).toUpperCase() + interviewData?.difficulty?.slice(1)} Level
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="text-right">
              <p className="text-sm font-medium text-gray-700">
                Question {currentQuestion.number} of {totalQuestions}
              </p>
              <div className="w-48 bg-gray-200 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentQuestion.number / totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
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
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Question Display */}
          <div className="space-y-6">
            {/* Question Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Interview Question</h2>
                <button
                  onClick={isSpeaking ? stopSpeaking : speakQuestion}
                  className={`p-2 rounded-lg transition-colors ${
                    isSpeaking
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                  }`}
                  title={isSpeaking ? 'Stop speaking' : 'Speak question'}
                >
                  {isSpeaking ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                      />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                  )}
                </button>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                <p className="text-lg text-gray-800 leading-relaxed">{currentQuestion.text}</p>
              </div>
            </div>

            {/* Evaluation Card */}
            {showEvaluation && evaluation && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Answer Evaluation</h3>

                {/* Overall Score */}
                <div className={`${getScoreBgColor(evaluation.overallScore)} rounded-lg p-4 mb-4`}>
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${getScoreColor(evaluation.overallScore)}`}>
                      {evaluation.overallScore.toFixed(1)}/10
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Overall Score</p>
                  </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Technical</span>
                    <span className={`font-semibold ${getScoreColor(evaluation.technicalScore)}`}>
                      {evaluation.technicalScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Communication</span>
                    <span className={`font-semibold ${getScoreColor(evaluation.communicationScore)}`}>
                      {evaluation.communicationScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Problem Solving</span>
                    <span className={`font-semibold ${getScoreColor(evaluation.problemSolvingScore)}`}>
                      {evaluation.problemSolvingScore.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Strengths */}
                {evaluation.strengths.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-green-900 mb-2">✓ Strengths</h4>
                    <ul className="space-y-1">
                      {evaluation.strengths.map((strength, index) => (
                        <li key={index} className="text-sm text-green-700">
                          • {strength}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Weaknesses */}
                {evaluation.weaknesses.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-red-900 mb-2">⚠ Areas to Improve</h4>
                    <ul className="space-y-1">
                      {evaluation.weaknesses.map((weakness, index) => (
                        <li key={index} className="text-sm text-red-700">
                          • {weakness}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Continue Button */}
                <button
                  onClick={handleContinue}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue to Next Question
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Voice Recorder & Transcript */}
          <div className="space-y-6">
            {/* Voice Recorder */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Record Your Answer</h3>
              <VoiceRecorder
                onTranscriptChange={handleTranscriptChange}
                onRecordingComplete={handleRecordingComplete}
                maxDuration={300}
                className="shadow-none border-0"
              />
            </div>

            {/* Submit Button */}
            {currentAnswer && !showEvaluation && (
              <button
                onClick={handleSubmitAnswer}
                disabled={isSubmitting || !currentAnswer.trim()}
                className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-lg font-semibold"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Answer</span>
                    <svg
                      className="w-6 h-6"
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewPage;
