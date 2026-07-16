import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { InterviewAvatar } from '../components/InterviewAvatar/InterviewAvatar';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { useSpeechInterview } from '../hooks/useSpeechInterview';
import { interviewApi } from '../api/interviewApi';

interface LocationState {
  interview?: any;
}

type InterviewPhase = 'READY' | 'WELCOME' | 'QUESTION' | 'LISTENING' | 'PROCESSING' | 'NEXT_QUESTION' | 'COMPLETED';

export const InterviewScreen: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState;

  // Interview Data
  const [interviewData, setInterviewData] = useState<any>(locationState?.interview || null);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [phase, setPhase] = useState<InterviewPhase>('READY');
  const [isProcessing, setIsProcessing] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>(AvatarState.IDLE);

  // Handle when question finishes speaking
  const handleQuestionSpoken = useCallback(() => {
    console.log('[handleQuestionSpoken] Called');
  }, []);

  // Handle Answer Complete (defined before hook to avoid circular dependency)
  const handleAnswerCompleteRef = React.useRef<(answer: string, duration: number) => Promise<void>>();

  // Speech Interview Hook
  const {
    isSpeaking,
    isListening,
    speak,
    startListening,
    stopListening,
  } = useSpeechInterview({
    onAnswerComplete: (answer, duration) => handleAnswerCompleteRef.current?.(answer, duration),
    onQuestionSpoken: handleQuestionSpoken,
  });

  // Initialize Interview
  useEffect(() => {
    if (!interviewId) {
      navigate('/setup');
      return;
    }

    if (locationState?.interview) {
      const interview = locationState.interview;
      setInterviewData(interview);
      
      const questionText = interview.currentQuestion?.questionText || '';
      const questionNumber = interview.currentQuestion?.questionNumber || 1;
      
      console.log('Interview loaded:', interview);
      console.log('Question:', questionText);
      
      setCurrentQuestion(questionText);
      setCurrentQuestionNumber(questionNumber);
      setTotalQuestions(interview.totalQuestions || 5);
      setPhase('READY'); // Wait for user to click Start
    }
  }, [interviewId, locationState, navigate]);

  // Welcome Sequence
  const startWelcomeSequence = useCallback(async (topic: string, questionText: string) => {
    try {
      console.log('Welcome sequence starting...');
      setPhase('WELCOME');
      setAvatarState(AvatarState.SPEAKING);
      
      await speak(`Welcome to the ${topic} interview.`);
      await speak('I will ask you a series of questions.');
      await speak('Please click Start Answer button after each question to record your response.');
      await speak("Let's begin.");
      
      console.log('Welcome sequence complete. Starting question...');
      // Ask first question
      await askCurrentQuestion(questionText);
    } catch (error) {
      console.error('Error in welcome sequence:', error);
      // Fallback: Just show the question
      setPhase('LISTENING');
      setAvatarState(AvatarState.IDLE);
    }
  }, [speak, setAvatarState, setPhase]);

  // Ask Current Question
  const askCurrentQuestion = useCallback(async (questionText?: string) => {
    const question = questionText || currentQuestion;
    if (!question) {
      console.error('No question to ask!');
      return;
    }
    
    try {
      console.log('Asking question:', question);
      setPhase('QUESTION');
      setAvatarState(AvatarState.SPEAKING);
      
      await speak(question);
      
      // After speaking, move to listening phase
      console.log('Question spoken, waiting for answer...');
      setPhase('LISTENING');
      setAvatarState(AvatarState.IDLE);
    } catch (error) {
      console.error('Error asking question:', error);
      setPhase('LISTENING');
      setAvatarState(AvatarState.IDLE);
    }
  }, [currentQuestion, speak, setAvatarState, setPhase]);

  // Start Interview (triggered by button click - ensures user interaction for speech)
  const handleStartInterview = useCallback(async () => {
    if (interviewStarted || !interviewData || !currentQuestion) {
      console.log('Cannot start - already started or missing data');
      return;
    }
    
    setInterviewStarted(true);
    console.log('Starting interview with user interaction...');
    await startWelcomeSequence(interviewData.topic, currentQuestion);
  }, [interviewStarted, interviewData, currentQuestion, startWelcomeSequence]);

  // Handle Answer Complete implementation
  handleAnswerCompleteRef.current = async (answer: string, duration: number) => {
    if (!interviewId) return;
    
    console.log('Answer complete:', answer);
    console.log('Duration:', duration);
    setIsProcessing(true);
    setAvatarState(AvatarState.THINKING);
    
    try {
      console.log('Submitting answer to API...');
      const response = await interviewApi.submitAnswer({
        interviewId,
        answer,
        duration,
      });

      console.log('Answer submitted successfully!');
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      console.log('Is completed:', response.data.interview.isCompleted);

      // Thank you message
      setPhase('NEXT_QUESTION');
      setAvatarState(AvatarState.SPEAKING);
      await speak('Thank you.');

      // Check if interview is completed
      if (response.data.interview.isCompleted) {
        console.log('Interview completed! Navigating to report...');
        await speak('Congratulations! You have completed the interview.');
        await speak('Your report is now ready.');
        setPhase('COMPLETED');
        setAvatarState(AvatarState.COMPLETED);
        
        // Navigate to report
        setTimeout(() => {
          console.log('Navigating to report page:', `/report/${interviewId}`);
          navigate(`/report/${interviewId}`);
        }, 2000);
      } else {
        // Move to next question with voice
        console.log('More questions remaining...');
        if (response.data.nextQuestion) {
          await speak("Let's move to the next question.");
          const nextQ = response.data.nextQuestion.question;
          const nextNum = response.data.interview.currentQuestion;
          console.log('Next question number:', nextNum);
          console.log('Next question text:', nextQ);
          
          // Update question first
          setCurrentQuestion(nextQ);
          setCurrentQuestionNumber(nextNum);
          
          // Then speak it
          await askCurrentQuestion(nextQ);
        } else {
          console.error('No next question in response but interview not complete!');
          setPhase('LISTENING');
          setAvatarState(AvatarState.IDLE);
        }
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      console.error('Error details:', error);
      setAvatarState(AvatarState.IDLE);
      setPhase('LISTENING');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Start Answer
  const handleStartAnswer = () => {
    startListening();
  };

  // Handle Stop Answer
  const handleStopAnswer = () => {
    stopListening();
    setPhase('PROCESSING');
  };

  // Show Loading
  if (!interviewData || !currentQuestion) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white mx-auto mb-4"></div>
          <div className="text-2xl mb-2">Loading interview...</div>
          <div className="text-sm opacity-75">Preparing your interview experience</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="w-full p-4 md:p-6 flex items-center justify-between text-white flex-shrink-0">
        <div>
          <h1 className="text-lg md:text-2xl font-bold">{interviewData.topic} Interview</h1>
          <p className="text-xs md:text-sm opacity-80">
            {interviewData.difficulty?.charAt(0).toUpperCase() + interviewData.difficulty?.slice(1)} Level
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm md:text-lg font-semibold">
            Question {currentQuestionNumber} of {totalQuestions}
          </p>
          <div className="w-32 md:w-48 bg-white/20 rounded-full h-2 mt-2">
            <div
              className="bg-white h-2 rounded-full transition-all duration-500"
              style={{ width: `${(currentQuestionNumber / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Content - Avatar with Overlaid Question */}
      <div className="flex-1 flex flex-col items-center justify-center relative w-full min-h-0">
        <div className="w-full h-full max-h-[60vh] flex items-center justify-center">
          <InterviewAvatar currentState={avatarState} />
        </div>

        {/* Question Display - OVERLAID on video */}
        {phase !== 'READY' && phase !== 'WELCOME' && phase !== 'COMPLETED' && currentQuestion && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 max-w-5xl w-[95%] md:w-[85%]" key={`question-${currentQuestionNumber}`}>
            <div className="bg-black/70 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 shadow-2xl border-2 border-white/30 transition-all duration-300">
              <div className="text-center mb-2 md:mb-3">
                <span className="inline-block px-3 py-1 md:px-5 md:py-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full text-white text-xs md:text-sm font-bold shadow-lg">
                  Question {currentQuestionNumber}
                </span>
              </div>
              <p className="text-white text-base md:text-xl text-center leading-relaxed font-medium">
                {currentQuestion}
              </p>
            </div>
          </div>
        )}

        {/* Welcome Message during READY phase - Centered overlay */}
        {phase === 'READY' && (
          <div className="absolute inset-0 flex items-center justify-center px-4 md:px-6">
            <div className="max-w-2xl w-full">
              <div className="bg-white/10 backdrop-blur-lg rounded-xl md:rounded-2xl p-6 md:p-12 shadow-2xl border border-white/20">
                <h2 className="text-white text-2xl md:text-3xl font-bold mb-3 md:mb-4">Ready to Begin?</h2>
                <p className="text-white/80 text-sm md:text-lg mb-6 md:mb-8">
                  Click the button below to start your {interviewData?.topic} interview.
                  The AI interviewer will welcome you and ask {totalQuestions} questions.
                </p>
                <button
                  onClick={handleStartInterview}
                  className="px-8 py-3 md:px-16 md:py-5 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white text-lg md:text-xl font-bold rounded-full shadow-2xl transform hover:scale-105 transition-all duration-300"
                >
                  <div className="flex items-center justify-center space-x-3 md:space-x-4">
                    <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Start Interview</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase Indicator */}
        {phase === 'WELCOME' && (
          <div className="absolute text-white text-center animate-pulse">
            <p className="text-lg">Preparing your interview...</p>
          </div>
        )}
      </div>

      {/* Controls - Fixed at bottom center */}
      <div className="w-full pb-4 md:pb-6 flex items-center justify-center flex-shrink-0">
        {phase === 'LISTENING' && !isListening && !isSpeaking && (
            <button
              onClick={handleStartAnswer}
              disabled={isProcessing}
              className="px-8 py-3 md:px-12 md:py-4 bg-green-500 hover:bg-green-600 text-white text-base md:text-lg font-semibold rounded-full shadow-2xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center space-x-2 md:space-x-3">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span>Start Answer</span>
              </div>
          </button>
        )}

        {isListening && (
            <button
              onClick={handleStopAnswer}
              className="px-8 py-3 md:px-12 md:py-4 bg-red-500 hover:bg-red-600 text-white text-base md:text-lg font-semibold rounded-full shadow-2xl transform hover:scale-105 transition-all duration-200 animate-pulse"
            >
              <div className="flex items-center space-x-2 md:space-x-3">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                <span>Stop Answer</span>
              </div>
          </button>
        )}

        {phase === 'PROCESSING' && (
            <div className="px-8 py-3 md:px-12 md:py-4 bg-yellow-500/50 text-white text-base md:text-lg font-semibold rounded-full">
              <div className="flex items-center space-x-2 md:space-x-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>Processing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Exit Button */}
      <div className="absolute top-4 left-4 md:bottom-6 md:top-auto md:left-6 z-50">
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to exit the interview?')) {
              navigate('/setup');
            }
          }}
          className="px-4 py-2 md:px-6 md:py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-sm md:text-base rounded-lg transition-all duration-200 border border-white/20"
        >
          Exit Interview
        </button>
      </div>
    </div>
  );
};

export default InterviewScreen;
