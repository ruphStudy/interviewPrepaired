import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { InterviewAvatar } from '../components/InterviewAvatar/InterviewAvatar';
import { AvatarState } from '../components/InterviewAvatar/AvatarState';
import { useSpeechInterview } from '../hooks/useSpeechInterview';
import { interviewApi } from '../api/interviewApi';
import { getInterviewPhrase } from '../config/interviewPhrases';
import {
  PlayCircle,
  Mic,
  Square,
  Loader2,
  Volume2,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';

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

  // Presentation-only: maps the existing `phase` to a small status chip label
  // shown over the interviewer panel. Adds no new application state.
  const getPhaseLabel = (p: InterviewPhase): string => {
    switch (p) {
      case 'READY':
        return 'Ready';
      case 'WELCOME':
        return 'Welcoming you';
      case 'QUESTION':
        return 'Asking question';
      case 'LISTENING':
        return 'Listening';
      case 'PROCESSING':
        return 'Reviewing your answer';
      case 'NEXT_QUESTION':
        return 'Preparing next question';
      case 'COMPLETED':
        return 'Interview complete';
      default:
        return '';
    }
  };

  const getPhaseChipClass = (p: InterviewPhase): string => {
    switch (p) {
      case 'LISTENING':
        return 'badge-success';
      case 'PROCESSING':
        return 'badge-warning';
      case 'COMPLETED':
        return 'badge-success';
      default:
        return 'badge-info';
    }
  };

  // Show Loading
  if (!interviewData || !currentQuestion) {
    return (
      <div className="min-h-screen bg-mentor-bg flex flex-col items-center justify-center px-4">
        <Loader2 className="w-10 h-10 text-primary-600 animate-spin mb-4" />
        <p className="text-base font-semibold text-mentor-text mb-1">Loading interview...</p>
        <p className="text-sm text-mentor-text-muted">Preparing your interview experience</p>
      </div>
    );
  }

  const showQuestion = phase !== 'READY' && phase !== 'WELCOME' && phase !== 'COMPLETED' && !!currentQuestion;

  return (
    <div className="relative min-h-screen bg-mentor-bg flex flex-col">
      {/* Header */}
      <header className="w-full bg-white border-b border-mentor-border px-4 py-4 md:px-8 md:py-5 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-primary-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
              AI
            </div>
            <span className="text-xs font-semibold text-mentor-text-muted">Interview Prepared Pro</span>
          </div>
          <h1 className="text-base md:text-xl font-semibold text-mentor-text tracking-tight truncate">
            {interviewData.topic} Interview
          </h1>
          <span className="badge badge-info mt-1.5">
            {interviewData.difficulty?.charAt(0).toUpperCase() + interviewData.difficulty?.slice(1)} Level
          </span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs md:text-sm font-medium text-mentor-text-secondary mb-2">
            Question {currentQuestionNumber} of {totalQuestions}
          </p>
          <div className="w-28 md:w-44 bg-mentor-surface rounded-full h-1.5">
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(currentQuestionNumber / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-7 py-5 md:py-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 md:gap-6 min-h-0">
        {/* Interviewer Panel */}
        <div className="card p-0 overflow-hidden flex flex-col min-h-[320px] lg:min-h-0">
          <div className="flex-1 flex items-center justify-center bg-mentor-surface min-h-0">
            <InterviewAvatar currentState={avatarState} />
          </div>
          <div className="px-5 py-3 border-t border-mentor-border flex items-center justify-center shrink-0">
            <span className={`badge ${getPhaseChipClass(phase)}`}>{getPhaseLabel(phase)}</span>
          </div>
        </div>

        {/* Question / Status Panel */}
        <div className="flex flex-col gap-4 min-h-0">
          <div className="card flex-1 min-h-[220px] lg:min-h-0 overflow-y-auto">
            {phase === 'READY' && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <PlayCircle size={40} className="text-primary-600 mb-3" />
                <h2 className="section-title text-lg mb-2">Ready to begin?</h2>
                <p className="text-sm text-mentor-text-secondary leading-relaxed mb-6">
                  Click Start Interview when you're ready. Your AI interviewer will introduce the session and ask{' '}
                  {totalQuestions} questions.
                </p>
                <button onClick={handleStartInterview} className="btn btn-primary px-6">
                  <PlayCircle size={18} />
                  Start Interview
                </button>
              </div>
            )}

            {phase === 'WELCOME' && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <Loader2 size={28} className="text-primary-600 animate-spin mb-3" />
                <p className="text-sm font-medium text-mentor-text-secondary">Your interviewer is getting started...</p>
              </div>
            )}

            {phase === 'COMPLETED' && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <CheckCircle2 size={40} className="text-mentor-success mb-3" />
                <h2 className="section-title text-lg mb-2">Interview complete</h2>
                <p className="text-sm text-mentor-text-secondary">Your feedback is being prepared.</p>
              </div>
            )}

            {showQuestion && (
              <div className="p-5 md:p-6 h-full flex flex-col" key={`question-${currentQuestionNumber}`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="section-title">Current Question</h2>
                  <span className="badge badge-info shrink-0">
                    Question {currentQuestionNumber} of {totalQuestions}
                  </span>
                </div>
                <p className="text-[19px] md:text-[21px] font-semibold text-mentor-text leading-relaxed">
                  {currentQuestion}
                </p>
              </div>
            )}
          </div>

          {/* Guidance */}
          <div className="surface-muted p-4 shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Lightbulb size={16} className="text-primary-600" />
              <p className="text-sm font-semibold text-mentor-text">Take your time</p>
            </div>
            <p className="text-xs text-mentor-text-secondary leading-relaxed">
              Structure your answer clearly and speak naturally.
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full max-w-[1440px] mx-auto px-4 md:px-7 pb-6 md:pb-8 shrink-0">
        <div className="card flex items-center justify-center py-5 min-h-[76px]">
          {phase === 'LISTENING' && !isListening && !isSpeaking && (
            <button onClick={handleStartAnswer} disabled={isProcessing} className="btn btn-primary px-7">
              <Mic size={18} />
              Start Answer
            </button>
          )}

          {isListening && (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleStopAnswer}
                className="btn px-7 bg-mentor-error text-white hover:opacity-90 focus-visible:ring-mentor-error"
              >
                <Square size={16} />
                Stop Answer
              </button>
              <span className="text-xs text-mentor-text-muted flex items-center gap-1.5">
                <Mic size={12} className="text-mentor-error" />
                Listening...
              </span>
            </div>
          )}

          {phase === 'PROCESSING' && (
            <div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-mentor-surface text-mentor-text-secondary text-sm font-medium">
              <Loader2 size={16} className="animate-spin" />
              Reviewing your answer...
            </div>
          )}

          {isSpeaking && !isListening && phase !== 'PROCESSING' && (
            <div className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
              <Volume2 size={16} />
              Interviewer is speaking
            </div>
          )}

          {phase === 'READY' && (
            <p className="text-sm text-mentor-text-muted">Click Start Interview above to begin.</p>
          )}
        </div>
      </div>

      {/* Exit Button */}
      <div className="absolute top-4 right-4 md:top-5 md:right-6 z-50">
        <button
          onClick={() => {
            if (window.confirm('Are you sure you want to exit the interview?')) {
              navigate('/setup');
            }
          }}
          className="btn btn-secondary px-3.5 py-2 text-xs md:text-sm"
        >
          Exit Interview
        </button>
      </div>
    </div>
  );
};

export default InterviewScreen;
