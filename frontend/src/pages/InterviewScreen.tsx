import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { InterviewAvatar } from '../components/InterviewAvatar/InterviewAvatar';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { useSpeechInterview } from '../hooks/useSpeechInterview';
import { interviewApi } from '../api/interviewApi';
import { getInterviewPhrase } from '../config/interviewPhrases';

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
    // Sourced from the interview API response (not local Setup-page state) so
    // it's correct however this screen was reached.
    language: interviewData?.interviewLanguage,
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
      
      const lang = interviewData?.interviewLanguage;
      await speak(getInterviewPhrase('welcome', lang, { topic }));
      await speak(getInterviewPhrase('intro', lang));
      await speak(getInterviewPhrase('instructions', lang));
      await speak(getInterviewPhrase('begin', lang));
      
      console.log('Welcome sequence complete. Starting question...');
      // Ask first question
      await askCurrentQuestion(questionText);
    } catch (error) {
      console.error('Error in welcome sequence:', error);
      // Fallback: Just show the question
      setPhase('LISTENING');
      setAvatarState(AvatarState.IDLE);
    }
  }, [speak, setAvatarState, setPhase, interviewData]);

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
      const lang = interviewData?.interviewLanguage;
      await speak(getInterviewPhrase('thankYou', lang));

      // Check if interview is completed
      if (response.data.interview.isCompleted) {
        console.log('Interview completed! Navigating to report...');
        await speak(getInterviewPhrase('congratulations', lang));
        await speak(getInterviewPhrase('reportReady', lang));
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
          await speak(getInterviewPhrase('nextQuestion', lang));
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
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center">
        <div className="text-white text-center">
          <div className="h-12 w-12 rounded-full border-2 border-white/20 border-t-white mx-auto mb-4 animate-spin"></div>
          <div className="text-xl font-semibold mb-1">Loading interview...</div>
          <div className="text-sm text-white/60">Preparing your interview experience</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="w-full px-4 py-4 md:px-8 md:py-5 flex items-center justify-between text-white flex-shrink-0 border-b border-white/10">
        <div>
          <h1 className="text-base md:text-xl font-semibold tracking-tight">{interviewData.topic} Interview</h1>
          <span className="inline-block mt-1 text-[11px] md:text-xs font-medium text-white/70 bg-white/10 rounded-full px-2.5 py-0.5">
            {interviewData.difficulty?.charAt(0).toUpperCase() + interviewData.difficulty?.slice(1)} Level
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs md:text-sm font-medium text-white/80">
            Question {currentQuestionNumber} of {totalQuestions}
          </p>
          <div className="w-28 md:w-44 bg-white/15 rounded-full h-1.5 mt-2">
            <div
              className="bg-primary-400 h-1.5 rounded-full transition-all duration-500"
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
            <div className="bg-slate-900/75 backdrop-blur-xl rounded-2xl p-4 md:p-6 shadow-2xl border border-white/10 transition-all duration-300">
              <div className="text-center mb-2 md:mb-3">
                <span className="inline-block px-3 py-1 md:px-4 md:py-1.5 bg-primary-600 rounded-full text-white text-xs md:text-sm font-semibold tracking-wide">
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
            <div className="max-w-xl w-full">
              <div className="bg-white/[0.07] backdrop-blur-lg rounded-2xl p-6 md:p-10 shadow-2xl border border-white/10 text-center">
                <h2 className="text-white text-2xl md:text-3xl font-bold mb-3 tracking-tight">Ready to begin?</h2>
                <p className="text-white/70 text-sm md:text-base mb-7 leading-relaxed">
                  Click below to start your {interviewData?.topic} interview.
                  The AI interviewer will welcome you and ask {totalQuestions} questions.
                </p>
                <button
                  onClick={handleStartInterview}
                  className="inline-flex items-center justify-center gap-2.5 px-7 py-3.5 md:px-10 md:py-4 bg-emerald-500 hover:bg-emerald-400 text-white text-base md:text-lg font-semibold rounded-full shadow-lg transition-all duration-200 hover:shadow-xl"
                >
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Interview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase Indicator */}
        {phase === 'WELCOME' && (
          <div className="absolute text-white/80 text-center animate-pulse">
            <p className="text-base font-medium">Preparing your interview...</p>
          </div>
        )}
      </div>

      {/* Controls - Fixed at bottom center */}
      <div className="w-full pb-6 md:pb-8 flex items-center justify-center flex-shrink-0">
        {phase === 'LISTENING' && !isListening && !isSpeaking && (
            <button
              onClick={handleStartAnswer}
              disabled={isProcessing}
              className="inline-flex items-center gap-2.5 px-7 py-3 md:px-9 md:py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white text-sm md:text-base font-semibold rounded-full shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Start Answer
          </button>
        )}

        {isListening && (
            <button
              onClick={handleStopAnswer}
              className="inline-flex items-center gap-2.5 px-7 py-3 md:px-9 md:py-3.5 bg-red-500 hover:bg-red-400 text-white text-sm md:text-base font-semibold rounded-full shadow-lg transition-all duration-200"
            >
              <span className="w-2.5 h-2.5 bg-white rounded-sm animate-pulse"></span>
              Stop Answer
          </button>
        )}

        {phase === 'PROCESSING' && (
            <div className="inline-flex items-center gap-2.5 px-7 py-3 md:px-9 md:py-3.5 bg-white/10 border border-white/10 text-white text-sm md:text-base font-medium rounded-full">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
                Processing...
          </div>
        )}
      </div>

      {/* Exit Button */}
      <div className="absolute top-4 right-4 md:top-5 md:right-6 z-50">
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to exit the interview?')) {
              navigate('/setup');
            }
          }}
          className="px-3.5 py-2 md:px-4 md:py-2 bg-white/10 hover:bg-white/15 backdrop-blur-md text-white/90 text-xs md:text-sm font-medium rounded-lg transition-colors border border-white/10"
        >
          Exit Interview
        </button>
      </div>
    </div>
  );
};

export default InterviewScreen;
