import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { InterviewAvatar } from '../components/InterviewAvatar/InterviewAvatar';
import { useSpeechInterview } from '../hooks/useSpeechInterview';
import { useAudioPlaybackQueue } from '../hooks/useAudioPlaybackQueue';
import { interviewApi, ConversationPresentationPlan } from '../api/interviewApi';
import { getInterviewPhrase } from '../config/interviewPhrases';
import {
  useInterviewPresentationState,
  presentationStateToLegacyPhase,
  type LegacyInterviewPhase as InterviewPhase,
} from '../hooks/useInterviewPresentationState';
import { useAvatarPresentationController } from '../hooks/useAvatarPresentationController';
import {
  derivePredictiveBranches,
  matchPreparedBranch,
  type PredictiveBranch,
  type PredictiveBranchQuestionContext,
} from '../utils/predictiveBranches';
import { buildAudioPlan, splitLeadInAndQuestion } from '../utils/audioPlanBuilder';
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

export const InterviewScreen: React.FC = () => {
  const { interviewId } = useParams<{ interviewId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState;

  const [interviewData, setInterviewData] = useState<any>(locationState?.interview || null);
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState<number>(0);
  const [currentQuestionContext, setCurrentQuestionContext] = useState<PredictiveBranchQuestionContext>({});
  const [totalQuestions, setTotalQuestions] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submissionError, setSubmissionError] = useState<string>('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [useTypedAnswer, setUseTypedAnswer] = useState(false);

  // Phase 7A — single source of truth for "what is the avatar/UI doing
  // right now". `phase` (legacy JSX branching) and `avatarState` (the
  // InterviewAvatar video/chip) below are both PURE derivations of this one
  // state machine — there is no second, independently-mutated copy of
  // either, which is what previously let the avatar's own overlay chip
  // (driven by a separately-managed avatarState) show "Speaking" while the
  // badge below it (driven by a separately-managed phase) simultaneously
  // said "Preparing next question".
  const {
    presentationState,
    sessionGeneration,
    isRequestCurrent,
    startInterview: presentationStartInterview,
    beginAsking,
    questionSpoken: presentationQuestionSpoken,
    beginAnswerFinalizing,
    beginRequest,
    submitSucceededNextQuestion,
    submitSucceededCompleted,
    questionTextAvailable,
    submitFailed,
    resetToPreStart,
    closingSpoken,
  } = useInterviewPresentationState();

  const phase: InterviewPhase = presentationStateToLegacyPhase(presentationState);

  // Phase 7C — bounded, purely local speculative "branch" preparation,
  // derived from Phase 2's existing debounced `detectedConcepts` (see the
  // effect below) — never rendered, never sent anywhere; see
  // utils/predictiveBranches.ts for exactly what this can and cannot do.
  const predictiveBranchesRef = useRef<PredictiveBranch[]>([]);
  const matchedBranchRef = useRef<PredictiveBranch | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleQuestionSpoken = useCallback(() => undefined, []);
  const handleAnswerCompleteRef = React.useRef<(answer: string, duration: number, detectedConcepts?: string[]) => Promise<void>>();

  const {
    isSpeaking,
    isListening,
    currentAnswer,
    detectedConcepts,
    speechSupported,
    speechError,
    clearSpeechError,
    speak,
    startListening,
    stopListening,
  } = useSpeechInterview({
    onAnswerComplete: (answer, duration, concepts) => handleAnswerCompleteRef.current?.(answer, duration, concepts),
    onQuestionSpoken: handleQuestionSpoken,
    language: interviewData?.interviewLanguage,
  });

  // Phase 9C — the single controlled queue that executes a presentation
  // plan's lead-in (ack/pause/transition) items; see speakPresentationSequence.
  const audioPlaybackQueue = useAudioPlaybackQueue();
  // Cancellation on unmount — extends useSpeechInterview's own unmount
  // cleanup (which already calls voiceService.stopSpeaking()) rather than
  // duplicating it: this additionally retires the queue's internal play
  // token immediately, so a pending inter-item pause can never resume and
  // speak after the component is gone.
  useEffect(() => () => audioPlaybackQueue.cancel(), [audioPlaybackQueue.cancel]);

  // Phase 10A — the CURRENT question turn's presentation flavour
  // (`ConversationPresentationPlan.presentationType`), set right before
  // playing that turn's lead-in/question audio (see speakPresentationSequence
  // below) and left in place through the subsequent LISTENING for that same
  // question — purely presentation-only, read only by the micro-behavior
  // scheduler's safety gate (utils/avatarSemanticState.ts) to suppress
  // cosmetic overlays during a probe/challenge/contradiction/closing turn.
  // Never sent anywhere, never read by any decision/scoring logic.
  const [currentPresentationType, setCurrentPresentationType] = useState<string | undefined>(undefined);

  // Phase 7A/10A/10C — the InterviewAvatar's video/chip and the phase badge
  // below it are both pure derivations of the single presentation state
  // machine; `isListening` (Phase 2/pre-existing, actual mic recording)
  // resolves the one genuine ambiguity the coarser 5-value AvatarState
  // can't express on its own (LISTENING presentation state covers both
  // "your turn, not recording yet" and "actively recording"). This is now
  // the ONE place resolving avatar state, extended (additively) to also
  // resolve the purely cosmetic `currentMicroBehavior` overlay — see
  // useAvatarPresentationController.ts's header for why this cannot desync
  // from or delay a real presentationState transition.
  const { avatarState, currentMicroBehavior } = useAvatarPresentationController({
    presentationState,
    isActivelyListening: isListening,
    sessionGeneration,
    currentPresentationType,
  });

  // Phase 7C — recompute bounded speculative branches whenever Phase 2's
  // already-debounced detectedConcepts (or the current question's known
  // expectedPoints/followUpTopics) change. No new debounce/timer is added
  // here — this effect just reacts to state Phase 2 already produces.
  useEffect(() => {
    predictiveBranchesRef.current = derivePredictiveBranches(detectedConcepts, currentQuestionContext, Date.now());
  }, [detectedConcepts, currentQuestionContext]);

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
      setCurrentQuestionContext({});
      setTotalQuestions(interview.totalQuestions || 5);
      resetToPreStart();
      setCurrentPresentationType(undefined);
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
        setCurrentQuestionContext({ expectedPoints: session.currentQuestion.expectedPoints });
        setTotalQuestions(session.totalQuestions);
        resetToPreStart();
        setCurrentPresentationType(undefined);
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load interview. Please return to setup and try again.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [interviewId, locationState?.interview, navigate]);

  // Phase 7D: this always speaks a question that is ALREADY visible in the
  // UI (the caller sets currentQuestion/currentQuestionNumber before ever
  // invoking this) — the text is never gated behind this call. Guarded by
  // a question-generation token so a slow/late-cancelled utterance can
  // never fire a LISTENING transition for a question the candidate has
  // since moved past (retry/exit) — see useInterviewPresentationState.ts.
  const askCurrentQuestion = useCallback(async (questionText?: string) => {
    const question = questionText || currentQuestion;
    if (!question) return;
    const questionGeneration = beginAsking();
    try {
      await speak(question);
    } catch {
      // TTS is an enhancement; a failure must never block the interview.
    } finally {
      if (isMountedRef.current) presentationQuestionSpoken(questionGeneration);
    }
  }, [currentQuestion, speak, beginAsking, presentationQuestionSpoken]);

  // Phase 9C — executes the Conversation Humanizer's presentation plan
  // (acknowledgement -> pause -> transition -> pause -> spoken question)
  // WITHIN the same continuous ASKING_QUESTION span the caller already
  // entered via beginAsking() before this runs, via the typed
  // `buildAudioPlan` (utils/audioPlanBuilder.ts, pure) + the new
  // `useAudioPlaybackQueue` (extracted from Phase 8's inline sequential
  // `await voiceService.speak(...)` calls — same externally observable
  // behavior for en-IN, now a testable module instead of ad hoc inline
  // logic). `askCurrentQuestion` (the ONE place that mints the "final"
  // questionGeneration + calls presentationQuestionSpoken, per Phase 7) is
  // always the last step regardless of how the lead-in played, so the SAME
  // staleness guard Phase 7 already built still protects this too.
  // `presentation` is additive/optional (older cached responses simply omit
  // it): absent -> the exact pre-Phase-8 generic thank-you/transition
  // phrase fallback (unchanged, not part of buildAudioPlan's scope);
  // `silenceOnly` -> no lead-in at all, straight to the question (Phase 7's
  // existing fast path); otherwise -> the humanizer's own short, neutral
  // phrases, never the two combined.
  const speakPresentationSequence = useCallback(
    async (
      presentation: ConversationPresentationPlan | undefined,
      fallbackQuestionText: string,
      lang: string | undefined,
      requestGeneration: number
    ) => {
      const isCurrent = () => isMountedRef.current && isRequestCurrent(requestGeneration);

      if (!presentation) {
        try {
          await speak(getInterviewPhrase('thankYou', lang));
        } catch {
          // Non-blocking — text is already visible.
        }
        if (!isCurrent()) return;
        try {
          await speak(getInterviewPhrase('nextQuestion', lang));
        } catch {
          // Non-blocking.
        }
        if (!isCurrent()) return;
        await askCurrentQuestion(fallbackQuestionText);
        return;
      }

      // Phase 10A — record this turn's flavour for the micro-behavior
      // scheduler's safety gate BEFORE any of its audio plays, and leave it
      // set through the subsequent LISTENING for this same question (only
      // overwritten by the NEXT turn's presentation plan, or cleared on a
      // fresh session below).
      setCurrentPresentationType(presentation.presentationType);

      const plan = buildAudioPlan(presentation, fallbackQuestionText);
      const { leadIn } = splitLeadInAndQuestion(plan);

      if (leadIn.length > 0) {
        const outcome = await audioPlaybackQueue.play(leadIn, { isCurrent, speak, locale: lang });
        if (outcome === 'cancelled') return;
      }
      if (!isCurrent()) return;

      await askCurrentQuestion(presentation.spokenQuestionText || fallbackQuestionText);
    },
    [speak, askCurrentQuestion, isRequestCurrent, audioPlaybackQueue.play]
  );

  const startWelcomeSequence = useCallback(async (topic: string, questionText: string) => {
    presentationStartInterview();
    try {
      const lang = interviewData?.interviewLanguage;
      await speak(getInterviewPhrase('welcome', lang, { topic }));
      await speak(getInterviewPhrase('intro', lang));
      await speak(getInterviewPhrase('instructions', lang));
      await speak(getInterviewPhrase('begin', lang));
    } catch {
      // Fall through to the persisted question even when TTS is unavailable.
    }
    if (isMountedRef.current) await askCurrentQuestion(questionText);
  }, [speak, interviewData, askCurrentQuestion, presentationStartInterview]);

  const handleStartInterview = useCallback(async () => {
    if (interviewStarted || !interviewData || !currentQuestion) return;
    setInterviewStarted(true);
    await startWelcomeSequence(interviewData.topic, currentQuestion);
  }, [interviewStarted, interviewData, currentQuestion, startWelcomeSequence]);

  handleAnswerCompleteRef.current = async (answer: string, duration: number, submittedDetectedConcepts?: string[]) => {
    if (!interviewId || isProcessing) return;
    const normalizedAnswer = answer.trim();
    if (normalizedAnswer.length < 3) {
      // Presentation state never left LISTENING/ERROR_RECOVERY for this
      // path — nothing to transition.
      setSubmissionError('Please provide a longer answer before submitting.');
      return;
    }

    setSubmissionError('');
    setIsProcessing(true);
    // A new submit attempt (first try OR a retry after a failed one) means
    // any still-playing/queued lead-in audio from a prior, now-abandoned
    // turn must stop immediately rather than linger into this one.
    audioPlaybackQueue.cancel();
    beginAnswerFinalizing();
    // requestGeneration is this specific submit attempt's identity — every
    // async continuation below (including the bounded 409 retry loop) must
    // check it's still current before touching component state, so a
    // response for a submission the candidate has since abandoned (exit/
    // retry) can never resurrect stale UI. See useInterviewPresentationState.ts.
    const requestGeneration = beginRequest();

    // A concurrent submission for the same question (double-click, or a retry
    // racing the still-in-flight original) is rejected server-side with a
    // transient 409 ANSWER_PROCESSING_IN_PROGRESS rather than a hard failure.
    // Automatically retry a few times with a short delay so the user sees a
    // brief "still processing" state instead of an alarming error.
    const MAX_PROCESSING_RETRIES = 3;
    const PROCESSING_RETRY_DELAY_MS = 1500;

    const attemptSubmit = async (attempt: number): Promise<void> => {
      try {
        const response = await interviewApi.submitAnswer({
          interviewId,
          answer: normalizedAnswer,
          duration,
          questionNumber: currentQuestionNumber,
          detectedConcepts: submittedDetectedConcepts && submittedDetectedConcepts.length > 0 ? submittedDetectedConcepts : undefined,
        });

        if (!isMountedRef.current || !isRequestCurrent(requestGeneration)) return;

        setTypedAnswer('');
        clearSpeechError();

        const lang = interviewData?.interviewLanguage;
        const isCompleted = response.data.interview.isCompleted;

        if (isCompleted) {
          submitSucceededCompleted(requestGeneration);
        } else if (response.data.nextQuestion) {
          // Phase 7D — the ONLY point real question text ever exists (the
          // HTTP response IS decision+generation combined, per Phase 6).
          // Make it visible immediately: this happens BEFORE any TTS below,
          // not gated behind the "thank you"/transition phrases finishing.
          const nextQ = response.data.nextQuestion.question;
          const nextContext: PredictiveBranchQuestionContext = {
            expectedPoints: response.data.nextQuestion.expectedPoints,
            followUpTopics: response.data.nextQuestion.followUpTopics,
          };

          // 7C — bookkeeping only, see predictiveBranches.ts: comparing the
          // REAL next question against what was speculated while the
          // candidate was still answering. Recomputed once more here from
          // the final (post-stopListening) concept list so the very last
          // debounce window's concepts aren't missed, without adding a
          // second debounce timer.
          const branchesAtSubmit = derivePredictiveBranches(
            submittedDetectedConcepts && submittedDetectedConcepts.length > 0 ? submittedDetectedConcepts : detectedConcepts,
            currentQuestionContext,
            Date.now()
          );
          matchedBranchRef.current = matchPreparedBranch(branchesAtSubmit, {
            question: nextQ,
            expectedPoints: nextContext.expectedPoints,
            followUpTopics: nextContext.followUpTopics,
          });

          setCurrentQuestion(nextQ);
          setCurrentQuestionNumber(response.data.interview.currentQuestion);
          setCurrentQuestionContext(nextContext);

          const nextQuestionGeneration = submitSucceededNextQuestion(requestGeneration);
          questionTextAvailable(requestGeneration, nextQuestionGeneration);
          // Consolidate into one continuous "asking" presentation for the
          // filler phrase below through the real question — audio really is
          // playing back-to-back for this whole span, so this is a more
          // truthful single signal than showing "preparing" while the
          // avatar is already audibly speaking.
          beginAsking();
        } else {
          setSubmissionError('Your answer was saved, but the next question is not ready. Reload this interview to recover safely.');
          submitFailed(requestGeneration);
          return;
        }

        if (isCompleted) {
          // Completion has no next question to present, so Phase 8's
          // presentation plan never applies here (the backend never builds
          // one for this turn either) — unchanged pre-Phase-8 phrasing.
          try {
            await speak(getInterviewPhrase('thankYou', lang));
          } catch {
            // Keep progressing even if voice output fails — text is already visible above.
          }
          try {
            await speak(getInterviewPhrase('congratulations', lang));
            await speak(getInterviewPhrase('reportReady', lang));
          } catch {
            // Navigation to the report is the important part.
          }
          // Phase 10A — the closing narration has now genuinely finished:
          // advance CLOSING -> COMPLETED so the avatar's video/state (which
          // showed SPEAKING throughout the three phrases above, not the
          // static COMPLETED visual) settles back to idle before navigating
          // away. Generation-guarded like every other resumed-after-await
          // action here — a late/stale call is a silent no-op.
          if (isMountedRef.current && isRequestCurrent(requestGeneration)) closingSpoken(requestGeneration);
          if (isMountedRef.current) window.setTimeout(() => navigate(`/report/${interviewId}`), 800);
          return;
        }

        if (response.data.nextQuestion) {
          if (!isMountedRef.current || !isRequestCurrent(requestGeneration)) return;
          // Phase 8 — presentation is additive/optional: absent means an
          // older/degraded response, which falls back to the EXACT
          // pre-Phase-8 generic thank-you + transition phrasing inside
          // speakPresentationSequence itself.
          await speakPresentationSequence(response.data.presentation, response.data.nextQuestion.question, lang, requestGeneration);
        }
      } catch (error: any) {
        if (error?.code === 'ANSWER_PROCESSING_IN_PROGRESS' && attempt < MAX_PROCESSING_RETRIES) {
          // Stay in the ACKNOWLEDGING/THINKING presentation — this is not a
          // failure, just a brief wait for the in-flight submission to
          // finish. The latency-tier tick loop (7B) may naturally escalate
          // the neutral "still thinking" treatment while this loop waits;
          // it never gates this loop's own timing.
          await new Promise((resolve) => window.setTimeout(resolve, PROCESSING_RETRY_DELAY_MS));
          if (!isMountedRef.current || !isRequestCurrent(requestGeneration)) return;
          await attemptSubmit(attempt + 1);
          return;
        }
        if (!isMountedRef.current || !isRequestCurrent(requestGeneration)) return;
        setSubmissionError(error?.message || 'We could not process your answer. Please try again.');
        submitFailed(requestGeneration);
      }
    };

    try {
      await attemptSubmit(1);
    } finally {
      if (isMountedRef.current) setIsProcessing(false);
    }
  };

  const handleStartAnswer = () => {
    setSubmissionError('');
    setUseTypedAnswer(false);
    const started = startListening();
    if (!started) setUseTypedAnswer(true);
  };

  const handleStopAnswer = () => {
    stopListening();
  };

  const handleTypedSubmit = async () => {
    const normalized = typedAnswer.trim();
    if (normalized.length < 3) {
      setSubmissionError('Please type at least a few words before submitting.');
      return;
    }
    await handleAnswerCompleteRef.current?.(normalized, 0, detectedConcepts);
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
          <div className="flex-1 min-h-0"><InterviewAvatar currentState={avatarState} currentMicroBehavior={currentMicroBehavior} /></div>
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
