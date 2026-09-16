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
  Keyboard,
  AlertCircle,
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

  const [interviewData, setInterviewData] = useState<any>(locationState?.interview || null);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(0);
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [phase, setPhase] = useState<InterviewPhase>('READY');
  const [isProcessing, setIsProcessing] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [avatarState, setAvatarState] = useState<AvatarState>(AvatarState.IDLE);
  const [loadError, setLoadError] = useState<string>('');
  const [submissionError, setSubmissionError] = useState<string>('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [useTypedAnswer, setUseTypedAnswer] = useState(false);

  const handleQuestionSpoken = useCallback(() => undefined, []);
  const handleAnswerCompleteRef = React.useRef<(answer: string, duration: number) => Promise<void>>();

  const {
    isSpeaking,
    isListening,
    currentAnswer,
    speechSupported,
    speechError,
    clearSpeechError,
    speak,
    startListening,
    stopListening,
  } = useSpeechInterview({
    onAnswerComplete: (answer, duration) => handleAnswerCompleteRef.current?.(answer, duration),
    onQuestionSpoken: handleQuestionSpoken,
    language: interviewData?.interviewLanguage,
  });

  useEffect(() => {
    if (!speechSupported) setUseTypedAnswer(true);
  }, [speechSupported]);

  useEffect(() => {
    if (!interviewId) {
      navigate('/setup');
      return;
    }

    if (locationState?.interview) {
      const interview = locationState.interview;
      setInterviewData(interview);
      setCurrentQuestion(interview.currentQuestion?.questionText || '');
      setCurrentQuestionNumber(interview.currentQuestion?.questionNumber || 1);
      setTotalQuestions(interview.totalQuestions || 5);
      setPhase('READY');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await interviewApi.getInterviewSession(interviewId);
        if (cancelled) return;
        const session = response.data;

        if (session.status === 'completed' || session.status === 'evaluated') {
          navigate(`/report/${interviewId}`, { replace: true });
          return;
        }

        if (!session.resumable || !session.currentQuestion) {
          setLoadError('This interview session cannot be resumed. Please start a new interview.');
          return;
        }

        setInterviewData({
          topic: session.topic,
          difficulty: session.difficulty,
          interviewLanguage: session.interviewLanguage,
        });
        setCurrentQuestion(session.currentQuestion.questionText);
        setCurrentQuestionNumber(session.currentQuestionIndex + 1);
        setTotalQuestions(session.totalQuestions);
        setPhase('READY');
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load interview. Please return to setup and try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [interviewId, locationState?.interview, navigate]);

  const askCurrentQuestion = useCallback(async (questionText?: string) => {
    const question = questionText || currentQuestion;
    if (!question) return;
    try {
      setPhase('QUESTION');
      setAvatarState(AvatarState.SPEAKING);
      await speak(question);
    } catch {
      // TTS is an enhancement; a failure must never block the interview.
    } finally {
      setPhase('LISTENING');
      setAvatarState(AvatarState.IDLE);
    }
  }, [currentQuestion, speak]);

  const startWelcomeSequence = useCallback(async (topic: string, questionText: string) => {
    try {
      setPhase('WELCOME');
      setAvatarState(AvatarState.SPEAKING);
      const lang = interviewData?.interviewLanguage;
      await speak(getInterviewPhrase('welcome', lang, { topic }));
      await speak(getInterviewPhrase('intro', lang));
      await speak(getInterviewPhrase('instructions', lang));
      await speak(getInterviewPhrase('begin', lang));
    } catch {
      // Fall through to the persisted question even when TTS is unavailable.
    }
    await askCurrentQuestion(questionText);
  }, [speak, interviewData, askCurrentQuestion]);

  const handleStartInterview = useCallback(async () => {
    if (interviewStarted || !interviewData || !currentQuestion) return;
    setInterviewStarted(true);
    await startWelcomeSequence(interviewData.topic, currentQuestion);
  }, [interviewStarted, interviewData, currentQuestion, startWelcomeSequence]);

  handleAnswerCompleteRef.current = async (answer: string, duration: number) => {
    if (!interviewId || isProcessing) return;
    const normalizedAnswer = answer.trim();
    if (normalizedAnswer.length < 3) {
      setSubmissionError('Please provide a longer answer before submitting.');
      setPhase('LISTENING');
      return;
    }

    setSubmissionError('');
    setIsProcessing(true);
    setPhase('PROCESSING');
    setAvatarState(AvatarState.THINKING);

    try {
      const response = await interviewApi.submitAnswer({
        interviewId,
        answer: normalizedAnswer,
        duration,
        questionNumber: currentQuestionNumber,
      });

      setTypedAnswer('');
      clearSpeechError();
      setPhase('NEXT_QUESTION');
      setAvatarState(AvatarState.SPEAKING);
      const lang = interviewData?.interviewLanguage;
      try {
        await speak(getInterviewPhrase('thankYou', lang));
      } catch {
        // Keep progressing even if voice output fails.
      }

      if (response.data.interview.isCompleted) {
        try {
          await speak(getInterviewPhrase('congratulations', lang));
          await speak(getInterviewPhrase('reportReady', lang));
        } catch {
          // Navigation to the report is the important part.
        }
        setPhase('COMPLETED');
        setAvatarState(AvatarState.COMPLETED);
        window.setTimeout(() => navigate(`/report/${interviewId}`), 800);
        return;
      }

      if (response.data.nextQuestion) {
        try {
          await speak(getInterviewPhrase('nextQuestion', lang));
        } catch {
          // Non-blocking.
        }
        const nextQ = response.data.nextQuestion.question;
        setCurrentQuestion(nextQ);
        setCurrentQuestionNumber(response.data.interview.currentQuestion);
        await askCurrentQuestion(nextQ);
      } else {
        setSubmissionError('Your answer was saved, but the next question is not ready. Reload this interview to recover safely.');
        setPhase('LISTENING');
      }
    } catch (error: any) {
      setSubmissionError(error?.message || 'We could not process your answer. Please try again.');
      setAvatarState(AvatarState.IDLE);
      setPhase('LISTENING');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartAnswer = () => {
    setSubmissionError('');
    setUseTypedAnswer(false);
    const started = startListening();
    if (!started) setUseTypedAnswer(true);
  };

  const handleStopAnswer = () => {
    const submitted = stopListening();
    if (!submitted) setPhase('LISTENING');
  };

  const handleTypedSubmit = async () => {
    const normalized = typedAnswer.trim();
    if (normalized.length < 3) {
      setSubmissionError('Please type at least a few words before submitting.');
      return;
    }
    await handleAnswerCompleteRef.current?.(normalized, 0);
  };

  const getPhaseLabel = (p: InterviewPhase): string => {
    switch (p) {
      case 'READY': return 'Ready';
      case 'WELCOME': return 'Welcoming you';
      case 'QUESTION': return 'Asking question';
      case 'LISTENING': return useTypedAnswer ? 'Waiting for your answer' : 'Listening';
      case 'PROCESSING': return 'Reviewing your answer';
      case 'NEXT_QUESTION': return 'Preparing next question';
      case 'COMPLETED': return 'Interview complete';
      default: return '';
    }
  };

  const getPhaseChipClass = (p: InterviewPhase): string => {
    if (p === 'LISTENING' || p === 'COMPLETED') return 'badge-success';
    if (p === 'PROCESSING') return 'badge-warning';
    return 'badge-info';
  };

  if (loadError) {
    return (
      <div className="min-h-screen bg-mentor-bg dark:bg-future-bg flex flex-col items-center justify-center px-4 text-center">
        <p className="text-base font-semibold text-mentor-text dark:text-future-text mb-1.5">Unable to load interview</p>
        <p className="text-sm text-mentor-text-muted dark:text-future-muted mb-5 max-w-sm">{loadError}</p>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="btn btn-secondary">Try Again</button>
          <button onClick={() => navigate('/history')} className="btn btn-primary">Interview History</button>
        </div>
      </div>
    );
  }

  if (!interviewData || !currentQuestion) {
    return (
      <div className="min-h-screen bg-mentor-bg dark:bg-future-bg flex flex-col items-center justify-center px-4">
        <Loader2 className="w-10 h-10 text-primary-600 dark:text-future-violet animate-spin mb-4" />
        <p className="text-base font-semibold text-mentor-text dark:text-future-text mb-1">Loading interview...</p>
        <p className="text-sm text-mentor-text-muted dark:text-future-muted">Preparing your interview experience</p>
      </div>
    );
  }

  const showQuestion = phase !== 'READY' && phase !== 'WELCOME' && phase !== 'COMPLETED' && !!currentQuestion;

  return (
    <div className="relative min-h-screen bg-mentor-bg dark:bg-future-bg flex flex-col">
      <header className="w-full bg-white dark:bg-future-header border-b border-mentor-border dark:border-future-border px-4 py-4 md:px-8 md:py-5 flex items-center justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-primary-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">AI</div>
            <span className="text-xs font-semibold text-mentor-text-muted">Interview Prepared Pro</span>
          </div>
          <h1 className="text-base md:text-xl font-semibold text-mentor-text tracking-tight truncate">{interviewData.topic} Interview</h1>
          <span className="badge badge-info mt-1.5">{interviewData.difficulty?.charAt(0).toUpperCase() + interviewData.difficulty?.slice(1)} Level</span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs md:text-sm font-medium text-mentor-text-secondary mb-2">Question {currentQuestionNumber} of {totalQuestions}</p>
          <div className="w-28 md:w-44 bg-mentor-surface rounded-full h-1.5">
            <div className="bg-primary-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${totalQuestions ? (currentQuestionNumber / totalQuestions) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 md:px-7 py-5 md:py-6 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 md:gap-6 min-h-0">
        <div className="card p-0 overflow-hidden flex flex-col min-h-[380px] sm:min-h-[440px] lg:min-h-0">
          <div className="flex-1 min-h-0"><InterviewAvatar currentState={avatarState} /></div>
          <div className="px-5 py-3 border-t border-mentor-border flex items-center justify-center shrink-0"><span className={`badge ${getPhaseChipClass(phase)}`}>{getPhaseLabel(phase)}</span></div>
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="card flex-1 min-h-[220px] lg:min-h-0 overflow-y-auto">
            {phase === 'READY' && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <PlayCircle size={40} className="text-primary-600 mb-3" />
                <h2 className="section-title text-lg mb-2">Ready to begin?</h2>
                <p className="text-sm text-mentor-text-secondary leading-relaxed mb-6">Click Start Interview when you're ready. Your AI interviewer will introduce the session and ask {totalQuestions} questions.</p>
                <button onClick={handleStartInterview} className="btn btn-primary px-6"><PlayCircle size={18} />Start Interview</button>
              </div>
            )}
            {phase === 'WELCOME' && <div className="h-full flex flex-col items-center justify-center text-center p-6"><Loader2 size={28} className="text-primary-600 animate-spin mb-3" /><p className="text-sm font-medium text-mentor-text-secondary">Your interviewer is getting started...</p></div>}
            {phase === 'COMPLETED' && <div className="h-full flex flex-col items-center justify-center text-center p-6"><CheckCircle2 size={40} className="text-mentor-success mb-3" /><h2 className="section-title text-lg mb-2">Interview complete</h2><p className="text-sm text-mentor-text-secondary">Opening your feedback...</p></div>}
            {showQuestion && (
              <div className="p-5 md:p-6 h-full flex flex-col" key={`question-${currentQuestionNumber}`}>
                <div className="flex items-center justify-between gap-3 mb-4"><h2 className="section-title">Current Question</h2><span className="badge badge-info shrink-0">Question {currentQuestionNumber} of {totalQuestions}</span></div>
                <p className="text-[19px] md:text-[21px] font-semibold text-mentor-text leading-relaxed">{currentQuestion}</p>
                {isListening && currentAnswer && <div className="mt-5 surface-muted p-3"><p className="text-xs text-mentor-text-muted mb-1">Captured answer</p><p className="text-sm text-mentor-text-secondary">{currentAnswer}</p></div>}
              </div>
            )}
          </div>

          <div className="surface-muted p-4 shrink-0">
            <div className="flex items-center gap-2 mb-1.5"><Lightbulb size={16} className="text-primary-600" /><p className="text-sm font-semibold text-mentor-text">Take your time</p></div>
            <p className="text-xs text-mentor-text-secondary leading-relaxed">Structure your answer clearly. Use the microphone or type if speech recognition is unavailable.</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[1440px] mx-auto px-4 md:px-7 pb-6 md:pb-8 shrink-0">
        {(speechError || submissionError) && phase === 'LISTENING' && (
          <div className="mb-3 rounded-lg border border-mentor-error/30 bg-mentor-error/10 p-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{submissionError || speechError}</p>
          </div>
        )}

        <div className="card py-5 min-h-[76px]">
          {phase === 'LISTENING' && !isListening && !isSpeaking && !useTypedAnswer && (
            <div className="flex items-center justify-center flex-wrap gap-3">
              <button onClick={handleStartAnswer} disabled={isProcessing} className="btn btn-primary px-7"><Mic size={18} />Start Answer</button>
              <button onClick={() => { setUseTypedAnswer(true); setSubmissionError(''); }} disabled={isProcessing} className="btn btn-secondary px-5"><Keyboard size={17} />Type Answer</button>
            </div>
          )}

          {phase === 'LISTENING' && !isListening && !isSpeaking && useTypedAnswer && (
            <div className="max-w-3xl mx-auto px-4">
              <label htmlFor="typedInterviewAnswer" className="label">Your answer</label>
              <textarea
                id="typedInterviewAnswer"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Type your answer here..."
                className="input w-full resize-y"
                disabled={isProcessing}
              />
              <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                <span className="text-xs text-mentor-text-muted">{typedAnswer.length}/5000</span>
                <div className="flex gap-2">
                  {speechSupported && <button type="button" onClick={() => { setUseTypedAnswer(false); clearSpeechError(); setSubmissionError(''); }} className="btn btn-secondary">Use Microphone</button>}
                  <button type="button" onClick={handleTypedSubmit} disabled={isProcessing || typedAnswer.trim().length < 3} className="btn btn-primary">Submit Answer</button>
                </div>
              </div>
            </div>
          )}

          {isListening && (
            <div className="flex flex-col items-center gap-2">
              <button onClick={handleStopAnswer} className="btn px-7 bg-mentor-error text-white hover:opacity-90 focus-visible:ring-mentor-error"><Square size={16} />Stop Answer</button>
              <span className="text-xs text-mentor-text-muted flex items-center gap-1.5"><Mic size={12} className="text-mentor-error" />Listening...</span>
            </div>
          )}
          {phase === 'PROCESSING' && <div className="flex justify-center"><div className="inline-flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-mentor-surface text-mentor-text-secondary text-sm font-medium"><Loader2 size={16} className="animate-spin" />Reviewing your answer...</div></div>}
          {isSpeaking && !isListening && phase !== 'PROCESSING' && <div className="flex justify-center"><div className="inline-flex items-center gap-2 text-sm font-medium text-primary-600"><Volume2 size={16} />Interviewer is speaking</div></div>}
          {phase === 'READY' && <p className="text-sm text-mentor-text-muted text-center">Click Start Interview above to begin.</p>}
        </div>
      </div>

      <div className="absolute top-4 right-4 md:top-5 md:right-6 z-50">
        <button
          onClick={() => {
            if (window.confirm('Exit this interview? Your saved progress will remain in Interview History so you can resume later.')) navigate('/history');
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
