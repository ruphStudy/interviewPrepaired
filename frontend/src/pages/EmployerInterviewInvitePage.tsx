import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import publicEmployerInterviewInvitationApi, {
  PublicEmployerInterviewInvitation,
  PublicInterviewSession,
  PublicInterviewQuestionsSession,
  PublicAssessmentDetail,
  PublicScenarioListItem,
  PublicScenarioStepDetail,
  PublicCodingSessionDetail,
  PublicCodingExecutionDetail,
} from '../api/publicEmployerInterviewInvitationApi';
import { Briefcase, AlertCircle, Loader2, CheckCircle2, Clock3 } from 'lucide-react';

/**
 * Fully PUBLIC page (not wrapped in ProtectedRoute, no login required at
 * all) — 20D/20E. The raw token lives only in this route's URL param and
 * in local component state for the duration of this page; it is never
 * written to localStorage/sessionStorage/cookies/global app state, and
 * never logged. Establishes secure candidate access, explicit acceptance,
 * and (once accepted) preparation of exactly one hiring-assessment
 * interview session, then (21A) materialization of its final candidate-
 * facing questions — it does NOT open any interview-taking UI yet, so
 * there is deliberately no "Start Interview" action here.
 */
const EmployerInterviewInvitePage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [invitation, setInvitation] = useState<PublicEmployerInterviewInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const [session, setSession] = useState<PublicInterviewSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const [questionsSession, setQuestionsSession] = useState<PublicInterviewQuestionsSession | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [preparingQuestions, setPreparingQuestions] = useState(false);
  const [prepareQuestionsError, setPrepareQuestionsError] = useState<string | null>(null);

  const [assessment, setAssessment] = useState<PublicAssessmentDetail | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState(0);
  const [answerDraft, setAnswerDraft] = useState('');
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [saveAnswerError, setSaveAnswerError] = useState<string | null>(null);

  const [submittingAssessment, setSubmittingAssessment] = useState(false);
  const [submitAssessmentError, setSubmitAssessmentError] = useState<string | null>(null);

  const [readyScenarios, setReadyScenarios] = useState<PublicScenarioListItem[]>([]);
  const [readyScenariosLoading, setReadyScenariosLoading] = useState(false);
  const [readyScenariosError, setReadyScenariosError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioStep, setScenarioStep] = useState<PublicScenarioStepDetail | null>(null);
  const [scenarioStepLoading, setScenarioStepLoading] = useState(false);
  const [scenarioStepError, setScenarioStepError] = useState<string | null>(null);
  const [scenarioAnswerDraft, setScenarioAnswerDraft] = useState('');
  const [submittingScenarioResponse, setSubmittingScenarioResponse] = useState(false);
  const [submitScenarioResponseError, setSubmitScenarioResponseError] = useState<string | null>(null);

  const [codingSession, setCodingSession] = useState<PublicCodingSessionDetail | null>(null);
  const [codingSessionLoading, setCodingSessionLoading] = useState(false);
  const [codingSessionError, setCodingSessionError] = useState<string | null>(null);
  const [codingViewIndex, setCodingViewIndex] = useState(0);
  const [codingLanguage, setCodingLanguage] = useState('');
  const [codingSourceCode, setCodingSourceCode] = useState('');
  const [savingCodingDraft, setSavingCodingDraft] = useState(false);
  const [saveCodingDraftError, setSaveCodingDraftError] = useState<string | null>(null);
  const [submittingCode, setSubmittingCode] = useState(false);
  const [submitCodeError, setSubmitCodeError] = useState<string | null>(null);
  const [codingExecutionByQuestion, setCodingExecutionByQuestion] = useState<Record<string, PublicCodingExecutionDetail>>({});
  const [runningTestsByQuestion, setRunningTestsByQuestion] = useState<Record<string, boolean>>({});
  const [runTestsErrorByQuestion, setRunTestsErrorByQuestion] = useState<Record<string, string>>({});

  const fetchInvitation = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setIsExpired(false);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicEmployerInterviewInvitation(token);
      setInvitation(response.data.invitation);
    } catch (err: any) {
      const message = err.message || 'This invitation link is invalid or no longer available.';
      setIsExpired(/expired/i.test(message));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchInvitation();
  }, [fetchInvitation]);

  const fetchSession = useCallback(async () => {
    if (!token) return;
    setSessionLoading(true);
    setSessionError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicInterviewSession(token);
      setSession(response.data.session);
    } catch (err: any) {
      setSessionError(err.message || 'Failed to load interview session');
    } finally {
      setSessionLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (invitation?.status === 'accepted') {
      fetchSession();
    }
  }, [invitation?.status, fetchSession]);

  const fetchQuestions = useCallback(async () => {
    if (!token) return;
    setQuestionsLoading(true);
    setQuestionsError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicInterviewQuestions(token);
      setQuestionsSession(response.data.session);
    } catch (err: any) {
      setQuestionsError(err.message || 'Failed to load interview questions');
    } finally {
      setQuestionsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (session?.sessionId) {
      fetchQuestions();
    }
  }, [session?.sessionId, fetchQuestions]);

  const fetchAssessment = useCallback(async () => {
    if (!token) return;
    setAssessmentLoading(true);
    setAssessmentError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicAssessment(token);
      const data = response.data.session;
      setAssessment(data);
      if (data) {
        setViewIndex(data.currentQuestion);
        setAnswerDraft(data.questions[data.currentQuestion]?.answerText || '');
      }
    } catch (err: any) {
      setAssessmentError(err.message || 'Failed to load assessment');
    } finally {
      setAssessmentLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (questionsSession && questionsSession.totalQuestions > 0) {
      fetchAssessment();
    }
  }, [questionsSession?.totalQuestions, fetchAssessment]);

  const fetchReadyScenarios = useCallback(async () => {
    if (!token) return;
    setReadyScenariosLoading(true);
    setReadyScenariosError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicReadyScenarios(token);
      setReadyScenarios(response.data.scenarios);
    } catch (err: any) {
      setReadyScenariosError(err.message || 'Failed to load scenarios');
    } finally {
      setReadyScenariosLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (invitation?.status === 'accepted') {
      fetchReadyScenarios();
    }
  }, [invitation?.status, fetchReadyScenarios]);

  const fetchScenarioStep = useCallback(
    async (scenarioId: string) => {
      if (!token) return;
      setScenarioStepLoading(true);
      setScenarioStepError(null);
      try {
        const response = await publicEmployerInterviewInvitationApi.getPublicScenarioStep(token, scenarioId);
        setScenarioStep(response.data);
        setScenarioAnswerDraft('');
      } catch (err: any) {
        setScenarioStepError(err.message || 'Failed to load scenario step');
      } finally {
        setScenarioStepLoading(false);
      }
    },
    [token]
  );

  const handleOpenScenario = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    setScenarioStep(null);
    setSubmitScenarioResponseError(null);
    fetchScenarioStep(scenarioId);
  };

  const handleSubmitScenarioResponse = async () => {
    if (!token || !selectedScenarioId) return;
    const trimmed = scenarioAnswerDraft.trim();
    if (!trimmed) return;
    setSubmittingScenarioResponse(true);
    setSubmitScenarioResponseError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.submitPublicScenarioResponse(token, selectedScenarioId, trimmed);
      setScenarioStep(response.data);
      setScenarioAnswerDraft('');
    } catch (err: any) {
      setSubmitScenarioResponseError(err.message || 'Failed to submit scenario response');
    } finally {
      setSubmittingScenarioResponse(false);
    }
  };

  const fetchCodingSession = useCallback(async () => {
    if (!token) return;
    setCodingSessionLoading(true);
    setCodingSessionError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.getPublicCodingSession(token);
      setCodingSession(response.data);
    } catch (err: any) {
      setCodingSessionError(err.message || 'Failed to load coding assessment');
    } finally {
      setCodingSessionLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (invitation?.status === 'accepted') {
      fetchCodingSession();
    }
  }, [invitation?.status, fetchCodingSession]);

  const goToCodingQuestion = (index: number) => {
    if (!codingSession?.questions) return;
    const clamped = Math.max(0, Math.min(index, codingSession.questions.length - 1));
    setCodingViewIndex(clamped);
    const q = codingSession.questions[clamped];
    setCodingLanguage(q?.draft?.language || q?.supportedLanguages[0] || '');
    setCodingSourceCode(q?.draft?.sourceCode || (q?.starterCode as any)?.[q?.draft?.language || q?.supportedLanguages[0] || ''] || '');
    setSaveCodingDraftError(null);
    setSubmitCodeError(null);
  };

  useEffect(() => {
    if (codingSession?.questions && codingSession.questions.length > 0 && !codingLanguage) {
      goToCodingQuestion(codingSession.currentQuestionIndex ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codingSession?.questions?.length]);

  const currentCodingQuestion = codingSession?.questions?.[codingViewIndex];

  const handleSaveCodingDraft = async () => {
    if (!token || !currentCodingQuestion || !codingLanguage.trim() || !codingSourceCode.trim()) return;
    setSavingCodingDraft(true);
    setSaveCodingDraftError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.savePublicCodingDraft(
        token,
        currentCodingQuestion.id,
        codingLanguage,
        codingSourceCode
      );
      setCodingSession(response.data);
    } catch (err: any) {
      setSaveCodingDraftError(err.message || 'Failed to save draft');
    } finally {
      setSavingCodingDraft(false);
    }
  };

  const handleSubmitCode = async () => {
    if (!token || !currentCodingQuestion || !codingLanguage.trim() || !codingSourceCode.trim()) return;
    if (!window.confirm('Submit this code? You will have a limited number of attempts.')) return;
    setSubmittingCode(true);
    setSubmitCodeError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.submitPublicCodingSubmission(
        token,
        currentCodingQuestion.id,
        codingLanguage,
        codingSourceCode
      );
      setCodingSession(response.data);
    } catch (err: any) {
      setSubmitCodeError(err.message || 'Failed to submit code');
    } finally {
      setSubmittingCode(false);
    }
  };

  const handleRunTests = async () => {
    if (!token || !currentCodingQuestion) return;
    const latestSubmission = currentCodingQuestion.submissions[currentCodingQuestion.submissions.length - 1];
    if (!latestSubmission) return;
    setRunningTestsByQuestion((prev) => ({ ...prev, [currentCodingQuestion.id]: true }));
    setRunTestsErrorByQuestion((prev) => ({ ...prev, [currentCodingQuestion.id]: '' }));
    try {
      const response = await publicEmployerInterviewInvitationApi.runPublicCodingSubmission(token, currentCodingQuestion.id, latestSubmission.id);
      setCodingExecutionByQuestion((prev) => ({ ...prev, [currentCodingQuestion.id]: response.data }));
    } catch (err: any) {
      setRunTestsErrorByQuestion((prev) => ({ ...prev, [currentCodingQuestion.id]: err.message || 'Failed to run tests' }));
    } finally {
      setRunningTestsByQuestion((prev) => ({ ...prev, [currentCodingQuestion.id]: false }));
    }
  };

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.acceptPublicEmployerInterviewInvitation(token);
      setInvitation(response.data.invitation);
    } catch (err: any) {
      setAcceptError(err.message || 'Failed to accept this invitation.');
    } finally {
      setAccepting(false);
    }
  };

  const handlePrepareSession = async () => {
    if (!token) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.createPublicInterviewSession(token);
      setSession(response.data.session);
    } catch (err: any) {
      setPrepareError(err.message || 'Failed to prepare interview session');
    } finally {
      setPreparing(false);
    }
  };

  const goToQuestion = (index: number) => {
    if (!assessment) return;
    const clamped = Math.max(0, Math.min(index, assessment.totalQuestions - 1));
    setViewIndex(clamped);
    setAnswerDraft(assessment.questions[clamped]?.answerText || '');
    setSaveAnswerError(null);
  };

  const handleSaveAndNext = async () => {
    if (!token || !assessment) return;
    const trimmed = answerDraft.trim();
    if (!trimmed) return;
    setSavingAnswer(true);
    setSaveAnswerError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.submitPublicAnswer(token, {
        questionIndex: viewIndex,
        answerText: trimmed,
      });
      const data = response.data.session;
      setAssessment(data);
      const nextIndex = Math.min(data.currentQuestion, data.totalQuestions - 1);
      setViewIndex(nextIndex);
      setAnswerDraft(data.questions[nextIndex]?.answerText || '');
    } catch (err: any) {
      setSaveAnswerError(err.message || 'Failed to save answer');
    } finally {
      setSavingAnswer(false);
    }
  };

  const handleSubmitAssessment = async () => {
    if (!token) return;
    if (!window.confirm('After submission, answers cannot be changed.')) return;
    setSubmittingAssessment(true);
    setSubmitAssessmentError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.completePublicSession(token);
      const completion = response.data.session;
      setAssessment((prev) => (prev ? { ...prev, status: completion.status } : prev));
    } catch (err: any) {
      setSubmitAssessmentError(err.message || 'Failed to submit assessment');
    } finally {
      setSubmittingAssessment(false);
    }
  };

  const handlePrepareQuestions = async () => {
    if (!token) return;
    setPreparingQuestions(true);
    setPrepareQuestionsError(null);
    try {
      const response = await publicEmployerInterviewInvitationApi.createPublicInterviewQuestions(token);
      setQuestionsSession(response.data.session);
    } catch (err: any) {
      setPrepareQuestionsError(err.message || 'Failed to prepare interview questions');
    } finally {
      setPreparingQuestions(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-mentor-bg dark:bg-future-bg p-4">
      <div className="card max-w-md w-full text-center">
        {loading ? (
          <>
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading invitation...</p>
          </>
        ) : error || !invitation ? (
          <>
            {isExpired ? (
              <Clock3 className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            ) : (
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            )}
            <h2 className="section-title text-lg mb-2">{isExpired ? 'Invitation expired' : 'Invitation unavailable'}</h2>
            <p className="text-sm text-mentor-text-secondary">{error || 'This invitation link is invalid or no longer available.'}</p>
          </>
        ) : invitation.status === 'accepted' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-mentor-success mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Invitation accepted</h2>
            <p className="text-sm text-mentor-text-secondary mb-4">Your interview is ready for the next step.</p>

            {sessionLoading ? (
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            ) : sessionError ? (
              <p className="text-sm text-mentor-error">{sessionError}</p>
            ) : session ? (
              <>
                <div className="surface-muted p-4 text-left space-y-1.5">
                  <p className="text-sm font-medium text-mentor-text">Interview session prepared</p>
                  <p className="text-sm text-mentor-text-secondary">
                    {session.jobTitle} at {session.organizationName}
                  </p>
                  <p className="text-xs text-mentor-text-muted">
                    ~{session.estimatedDurationMinutes} min &middot; status: {session.status}
                  </p>
                  <p className="text-sm text-mentor-success pt-1">Your interview session is ready.</p>
                </div>

                <div className="mt-4">
                  {questionsLoading ? (
                    <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                  ) : questionsError ? (
                    <p className="text-sm text-mentor-error">{questionsError}</p>
                  ) : questionsSession && questionsSession.totalQuestions > 0 ? (
                    <>
                      {assessmentLoading ? (
                        <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                      ) : assessmentError ? (
                        <p className="text-sm text-mentor-error">{assessmentError}</p>
                      ) : assessment && (assessment.status === 'completed' || assessment.status === 'evaluated') ? (
                        <div className="surface-muted p-4 text-center">
                          <CheckCircle2 className="w-8 h-8 text-mentor-success mx-auto mb-2" />
                          <p className="text-sm font-medium text-mentor-text">Assessment submitted successfully.</p>
                        </div>
                      ) : assessment ? (
                        <div className="text-left space-y-3">
                          <p className="text-xs text-mentor-text-muted">
                            Question {viewIndex + 1} / {assessment.totalQuestions} &middot; {assessment.answeredQuestions} answered
                          </p>
                          <div className="surface-muted p-4">
                            <p className="text-sm text-mentor-text">{assessment.questions[viewIndex]?.question}</p>
                          </div>

                          {assessment.questions[viewIndex]?.answerText ? (
                            <div className="surface-muted p-3">
                              <p className="text-xs text-mentor-text-muted mb-1">Your answer</p>
                              <p className="text-sm text-mentor-text whitespace-pre-wrap">{assessment.questions[viewIndex]?.answerText}</p>
                            </div>
                          ) : (
                            <>
                              <textarea
                                value={answerDraft}
                                onChange={(e) => setAnswerDraft(e.target.value)}
                                rows={5}
                                maxLength={5000}
                                placeholder="Type your answer..."
                                className="input w-full"
                              />
                              {saveAnswerError && <p className="text-sm text-mentor-error">{saveAnswerError}</p>}
                              <button
                                onClick={handleSaveAndNext}
                                disabled={savingAnswer || !answerDraft.trim()}
                                className="btn btn-primary w-full justify-center"
                              >
                                {savingAnswer ? 'Saving...' : 'Save & Next'}
                              </button>
                            </>
                          )}

                          <div className="flex justify-between pt-1">
                            <button onClick={() => goToQuestion(viewIndex - 1)} disabled={viewIndex === 0} className="btn btn-secondary">
                              Previous
                            </button>
                            <button
                              onClick={() => goToQuestion(viewIndex + 1)}
                              disabled={viewIndex >= assessment.totalQuestions - 1}
                              className="btn btn-secondary"
                            >
                              Next
                            </button>
                          </div>

                          {assessment.completed && (
                            <div className="pt-2 space-y-2">
                              <p className="text-sm text-mentor-success text-center">All answers saved.</p>
                              {submitAssessmentError && <p className="text-sm text-mentor-error text-center">{submitAssessmentError}</p>}
                              <button
                                onClick={handleSubmitAssessment}
                                disabled={submittingAssessment}
                                className="btn btn-primary w-full justify-center"
                              >
                                {submittingAssessment ? 'Submitting...' : 'Submit Assessment'}
                              </button>
                              <p className="text-xs text-mentor-text-muted text-center">After submission, answers cannot be changed.</p>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {prepareQuestionsError && (
                        <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4 text-left">
                          <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                          <p className="text-sm text-mentor-error">{prepareQuestionsError}</p>
                        </div>
                      )}
                      <button onClick={handlePrepareQuestions} disabled={preparingQuestions} className="btn btn-primary w-full justify-center">
                        {preparingQuestions ? 'Preparing...' : 'Prepare Assessment Questions'}
                      </button>
                    </>
                  )}
                </div>

                {!readyScenariosLoading && !readyScenariosError && readyScenarios.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-mentor-border text-left">
                    <h3 className="section-title text-base mb-3">Scenario Assessment</h3>

                    {!selectedScenarioId ? (
                      <div className="space-y-2">
                        {readyScenarios.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleOpenScenario(s.id)}
                            className="w-full surface-muted p-3 text-left hover:border-primary-300 border border-transparent transition-colors"
                          >
                            <p className="text-sm font-medium text-mentor-text">{s.title}</p>
                            <p className="text-xs text-mentor-text-muted capitalize">
                              {s.category.replace(/_/g, ' ')} &middot; {s.difficulty}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : scenarioStepLoading ? (
                      <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
                    ) : scenarioStepError ? (
                      <div>
                        <p className="text-sm text-mentor-error mb-2">{scenarioStepError}</p>
                        <button onClick={() => fetchScenarioStep(selectedScenarioId)} className="btn btn-secondary">
                          Try Again
                        </button>
                      </div>
                    ) : scenarioStep ? (
                      <div className="space-y-3">
                        <div className="surface-muted p-3">
                          <p className="text-sm font-semibold text-mentor-text">{scenarioStep.scenario.title}</p>
                          <p className="text-xs text-mentor-text-muted mt-1">
                            Situation: {scenarioStep.scenario.situation}
                          </p>
                          <p className="text-xs text-mentor-text-muted mt-1">Your role: {scenarioStep.scenario.candidateRole}</p>
                          {scenarioStep.scenario.constraints.length > 0 && (
                            <p className="text-xs text-mentor-text-muted mt-1">
                              Constraints: {scenarioStep.scenario.constraints.join('; ')}
                            </p>
                          )}
                          {scenarioStep.scenario.availableInformation.length > 0 && (
                            <p className="text-xs text-mentor-text-muted mt-1">
                              Available information: {scenarioStep.scenario.availableInformation.join('; ')}
                            </p>
                          )}
                        </div>

                        {scenarioStep.completed ? (
                          <div className="surface-muted p-4 text-center">
                            <CheckCircle2 className="w-8 h-8 text-mentor-success mx-auto mb-2" />
                            <p className="text-sm font-medium text-mentor-text">Scenario completed.</p>
                          </div>
                        ) : (
                          scenarioStep.step && (
                            <>
                              <p className="text-xs text-mentor-text-muted">
                                Step {scenarioStep.progress.current} of {scenarioStep.progress.total}
                              </p>
                              {scenarioStep.step.scenarioUpdate && (
                                <div className="surface-muted p-3">
                                  <p className="text-xs font-semibold text-mentor-warning mb-1">New information</p>
                                  <p className="text-sm text-mentor-text">{scenarioStep.step.scenarioUpdate}</p>
                                </div>
                              )}
                              <div className="surface-muted p-3">
                                <p className="text-sm text-mentor-text">{scenarioStep.step.questionText}</p>
                              </div>
                              <textarea
                                value={scenarioAnswerDraft}
                                onChange={(e) => setScenarioAnswerDraft(e.target.value)}
                                rows={5}
                                maxLength={5000}
                                placeholder="Type your response..."
                                className="input w-full"
                              />
                              {submitScenarioResponseError && <p className="text-sm text-mentor-error">{submitScenarioResponseError}</p>}
                              <button
                                onClick={handleSubmitScenarioResponse}
                                disabled={submittingScenarioResponse || !scenarioAnswerDraft.trim()}
                                className="btn btn-primary w-full justify-center"
                              >
                                {submittingScenarioResponse ? 'Submitting...' : 'Submit Response'}
                              </button>
                            </>
                          )
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {!codingSessionLoading && !codingSessionError && codingSession?.configured !== false && (codingSession?.questions?.length ?? 0) > 0 && (
                  <div className="mt-6 pt-4 border-t border-mentor-border text-left">
                    <h3 className="section-title text-base mb-1">Coding Assessment</h3>
                    <p className="text-xs text-mentor-text-muted mb-3">
                      Execution is not available yet — your code is saved for review. No fake "Run" button.
                    </p>

                    {currentCodingQuestion && (
                      <div className="space-y-3">
                        <p className="text-xs text-mentor-text-muted">
                          Question {codingViewIndex + 1} of {codingSession!.questions!.length}
                        </p>
                        <div className="surface-muted p-3">
                          <p className="text-sm font-semibold text-mentor-text">{currentCodingQuestion.title}</p>
                          <p className="text-xs text-mentor-text-muted capitalize mt-1">{currentCodingQuestion.difficulty}</p>
                          <p className="text-sm text-mentor-text mt-2 whitespace-pre-wrap">{currentCodingQuestion.description}</p>
                          {currentCodingQuestion.constraints.length > 0 && (
                            <p className="text-xs text-mentor-text-muted mt-2">Constraints: {currentCodingQuestion.constraints.join('; ')}</p>
                          )}
                          {currentCodingQuestion.examples.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {currentCodingQuestion.examples.map((ex, i) => (
                                <div key={i} className="text-xs text-mentor-text-secondary font-mono">
                                  <p>Input: {ex.input}</p>
                                  <p>Output: {ex.output}</p>
                                  {ex.explanation && <p className="text-mentor-text-muted">{ex.explanation}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={codingLanguage}
                            onChange={(e) => {
                              setCodingLanguage(e.target.value);
                              const starter = (currentCodingQuestion.starterCode as any)?.[e.target.value];
                              if (!codingSourceCode.trim() && starter) setCodingSourceCode(starter);
                            }}
                            className="input"
                          >
                            {currentCodingQuestion.supportedLanguages.map((lang) => (
                              <option key={lang} value={lang}>
                                {lang}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-mentor-text-muted">
                            Attempts used: {currentCodingQuestion.progress.submittedAttemptCount} / {currentCodingQuestion.progress.maxAttempts}
                          </span>
                        </div>

                        <textarea
                          value={codingSourceCode}
                          onChange={(e) => setCodingSourceCode(e.target.value)}
                          rows={12}
                          maxLength={50000}
                          placeholder="Write your code here..."
                          className="input w-full font-mono text-xs"
                          spellCheck={false}
                        />

                        {saveCodingDraftError && <p className="text-sm text-mentor-error">{saveCodingDraftError}</p>}
                        {submitCodeError && <p className="text-sm text-mentor-error">{submitCodeError}</p>}
                        <div className="flex items-center gap-2">
                          <button onClick={handleSaveCodingDraft} disabled={savingCodingDraft} className="btn btn-secondary">
                            {savingCodingDraft ? 'Saving...' : 'Save Draft'}
                          </button>
                          <button
                            onClick={handleSubmitCode}
                            disabled={submittingCode || currentCodingQuestion.progress.submittedAttemptCount >= currentCodingQuestion.progress.maxAttempts}
                            className="btn btn-primary"
                          >
                            {submittingCode ? 'Submitting...' : 'Submit Code'}
                          </button>
                        </div>

                        {currentCodingQuestion.submissions.length > 0 && (
                          <div className="pt-2 border-t border-mentor-border">
                            <p className="text-xs font-medium text-mentor-text mb-1">Submission History</p>
                            {currentCodingQuestion.submissions.map((s) => (
                              <p key={s.id} className="text-xs text-mentor-text-secondary">
                                Attempt {s.attemptNumber} &middot; {s.language} &middot; {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : ''}
                              </p>
                            ))}

                            <div className="mt-2">
                              <button
                                onClick={handleRunTests}
                                disabled={runningTestsByQuestion[currentCodingQuestion.id]}
                                className="btn btn-secondary"
                              >
                                {runningTestsByQuestion[currentCodingQuestion.id] ? 'Running...' : 'Run Tests'}
                              </button>
                              {runTestsErrorByQuestion[currentCodingQuestion.id] && (
                                <p className="text-sm text-mentor-error mt-1">{runTestsErrorByQuestion[currentCodingQuestion.id]}</p>
                              )}

                              {(() => {
                                const execution = codingExecutionByQuestion[currentCodingQuestion.id];
                                if (!execution || !execution.executed) return null;
                                if (execution.status === 'executor_unavailable') {
                                  return <p className="text-sm text-mentor-warning mt-2">Execution unavailable right now — please try again later.</p>;
                                }
                                if (execution.status === 'running' || execution.status === 'pending') {
                                  return <p className="text-sm text-mentor-text-secondary mt-2">Running...</p>;
                                }
                                if (execution.status === 'timeout') {
                                  return <p className="text-sm text-mentor-warning mt-2">Execution timed out.</p>;
                                }
                                if (execution.status === 'failed') {
                                  return <p className="text-sm text-mentor-error mt-2">Execution could not complete. You may try again.</p>;
                                }
                                return (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-sm font-medium text-mentor-text">
                                      {execution.summary?.passedTests} / {execution.summary?.totalTests} tests passed
                                    </p>
                                    {(execution.results ?? []).map((r, i) =>
                                      'label' in r ? (
                                        <p key={i} className="text-xs text-mentor-text-secondary">
                                          {r.label} — {r.status === 'passed' ? 'Passed' : r.status === 'timeout' ? 'Timed out' : r.status === 'runtime_error' ? 'Runtime Error' : 'Failed'}
                                        </p>
                                      ) : (
                                        <div key={i} className="surface-muted p-2 text-xs">
                                          <p className="font-medium text-mentor-text">
                                            {r.status === 'passed' ? 'Passed' : r.status === 'timeout' ? 'Timed out' : r.status === 'runtime_error' ? 'Runtime Error' : 'Failed'}
                                          </p>
                                          {r.input !== undefined && <p className="text-mentor-text-muted">Input: {r.input}</p>}
                                          {r.expectedOutput !== undefined && <p className="text-mentor-text-muted">Expected: {r.expectedOutput}</p>}
                                          {r.actualOutput !== undefined && <p className="text-mentor-text-muted">Actual: {r.actualOutput}</p>}
                                        </div>
                                      )
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <button onClick={() => goToCodingQuestion(codingViewIndex - 1)} disabled={codingViewIndex === 0} className="btn btn-secondary">
                            Previous
                          </button>
                          <button
                            onClick={() => goToCodingQuestion(codingViewIndex + 1)}
                            disabled={codingViewIndex >= (codingSession!.questions!.length - 1)}
                            className="btn btn-secondary"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                {prepareError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4 text-left">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{prepareError}</p>
                  </div>
                )}
                <button onClick={handlePrepareSession} disabled={preparing} className="btn btn-primary w-full justify-center">
                  {preparing ? 'Preparing...' : 'Prepare Interview'}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <Briefcase size={22} className="text-primary-600" />
            </div>
            <h2 className="section-title text-lg mb-1">
              {invitation.invitedName ? `Hi ${invitation.invitedName.split(' ')[0]}, you` : "You"}'ve been invited to interview
            </h2>
            <p className="text-sm text-mentor-text-secondary mb-1">
              <strong className="text-mentor-text">{invitation.organization.name}</strong> invites you to interview for{' '}
              <strong className="text-mentor-text">{invitation.job.title}</strong>
              {invitation.job.jobCode ? ` (${invitation.job.jobCode})` : ''}.
            </p>

            <div className="surface-muted p-4 my-4 text-left space-y-1.5">
              <p className="text-sm text-mentor-text">{invitation.interview.blueprintTitle}</p>
              <p className="text-xs text-mentor-text-muted">
                ~{invitation.interview.estimatedDurationMinutes} min &middot; {invitation.interview.totalSections} sections &middot;{' '}
                {invitation.interview.totalPlannedQuestions} questions planned
              </p>
            </div>

            {invitation.message && <p className="text-sm text-mentor-text-secondary mb-4 italic">&ldquo;{invitation.message}&rdquo;</p>}

            <p className="text-xs text-mentor-text-muted mb-6">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>

            {acceptError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4 text-left">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{acceptError}</p>
              </div>
            )}

            <button onClick={handleAccept} disabled={accepting} className="btn btn-primary w-full justify-center">
              {accepting ? 'Accepting...' : 'Accept Interview Invitation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default EmployerInterviewInvitePage;
