import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import {
  interviewApi,
  POPULAR_TOPICS,
  DIFFICULTY_LEVELS,
  INTERVIEW_STYLES,
  StartInterviewRequest,
  ParsedUploadedQuestion,
} from '../api/interviewApi';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE_CODE } from '../config/languages';

// ============================================================================
// TypeScript Interfaces
// ============================================================================

type InterviewMode = 'ai-generated' | 'uploaded';

interface FormErrors {
  topic?: string;
  difficulty?: string;
  experienceYears?: string;
  totalQuestions?: string;
  uploadFile?: string;
}

// ============================================================================
// InterviewSetupPage Component
// ============================================================================

export const InterviewSetupPage: React.FC = () => {
  const navigate = useNavigate();

  // Form State
  const [mode, setMode] = useState<InterviewMode>('ai-generated');
  const [topic, setTopic] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [interviewStyle, setInterviewStyle] = useState<string>('general');
  const [experienceYears, setExperienceYears] = useState<string>('');
  const [totalQuestions, setTotalQuestions] = useState<string>('5');
  const [interviewLanguage, setInterviewLanguage] = useState<string>(DEFAULT_LANGUAGE_CODE);

  // Uploaded-mode State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string>('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedUploadedQuestion[]>([]);
  const [parseSummary, setParseSummary] = useState<{
    totalQuestions: number;
    questionsWithAnswers: number;
    questionsWithoutAnswers: number;
  } | null>(null);
  const [useAllQuestions, setUseAllQuestions] = useState<boolean>(true);
  const [uploadedQuestionCount, setUploadedQuestionCount] = useState<string>('');
  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(false);

  const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — matches backend multer limit

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string>('');

  // ============================================================================
  // Validation
  // ============================================================================

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (mode === 'ai-generated') {
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
    } else {
      if (parsedQuestions.length === 0) {
        newErrors.uploadFile = 'Please upload a question file';
      } else if (!useAllQuestions) {
        const qCount = parseInt(uploadedQuestionCount);
        if (!uploadedQuestionCount) {
          newErrors.totalQuestions = 'Question count is required';
        } else if (isNaN(qCount) || qCount < 1 || qCount > parsedQuestions.length) {
          newErrors.totalQuestions = `Question count must be between 1 and ${parsedQuestions.length}`;
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setParseError('');
    setParsedQuestions([]);
    setParseSummary(null);
    setUseAllQuestions(true);
    setUploadedQuestionCount('');
    setErrors((prev) => ({ ...prev, uploadFile: undefined }));

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setParseError('File is too large. Maximum upload size is 5MB.');
      return;
    }

    setIsParsing(true);
    try {
      const response = await interviewApi.parseQuestionFile(file);
      if (response.success) {
        setParsedQuestions(response.data.questions);
        setParseSummary(response.data.summary);
      } else {
        setParseError('Failed to parse the uploaded file. Please try again.');
      }
    } catch (error: any) {
      setParseError(error.message || 'Failed to parse the uploaded file.');
    } finally {
      setIsParsing(false);
    }
  };

  // Start button stays disabled until settings are valid — and, in uploaded
  // mode, until the file has been parsed into at least 1 usable question.
  const hasValidTopic = !!topic && (topic !== 'Other' || !!customTopic.trim());
  const hasBaseSettings = hasValidTopic && !!difficulty && !!experienceYears;
  const canSubmit =
    mode === 'ai-generated'
      ? hasBaseSettings && !!totalQuestions
      : parsedQuestions.length > 0 &&
        (useAllQuestions ||
          (!!uploadedQuestionCount &&
            Number(uploadedQuestionCount) >= 1 &&
            Number(uploadedQuestionCount) <= parsedQuestions.length));

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

      const requestData: StartInterviewRequest =
        mode === 'uploaded'
          ? {
              // Uploaded mode has no topic/difficulty/experience/style inputs
              // in the UI — the uploaded questions are the actual content;
              // these are safe backend-required defaults only, matching the
              // existing schema/validator constraints.
              topic: 'Uploaded Question Set',
              difficulty: 'intermediate',
              experienceYears: 0,
              interviewStyle: 'general',
              interviewMode: 'uploaded',
              questions: parsedQuestions.map((q) => ({
                questionText: q.questionText,
                referenceAnswer: q.referenceAnswer,
              })),
              totalQuestions: useAllQuestions ? undefined : parseInt(uploadedQuestionCount),
              shuffleQuestions,
              interviewLanguage,
            }
          : {
              topic: finalTopic,
              difficulty,
              experienceYears: parseInt(experienceYears),
              totalQuestions: parseInt(totalQuestions),
              interviewStyle,
              interviewLanguage,
            };

      console.log('[StartInterviewPayload]', {
        interviewMode: requestData.interviewMode,
        topic: requestData.topic,
        difficulty: requestData.difficulty,
        experienceYears: requestData.experienceYears,
        interviewStyle: requestData.interviewStyle,
        questionCount: requestData.questions?.length,
        totalQuestions: requestData.totalQuestions,
        shuffleQuestions: requestData.shuffleQuestions,
        interviewLanguage: requestData.interviewLanguage,
      });
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
    setInterviewLanguage(DEFAULT_LANGUAGE_CODE);
    setUploadFile(null);
    setParseError('');
    setParsedQuestions([]);
    setParseSummary(null);
    setUseAllQuestions(true);
    setUploadedQuestionCount('');
    setShuffleQuestions(false);
    setErrors({});
    setApiError('');
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <AuthenticatedLayout>
      <div className="page-container py-10 sm:py-14">
        {/* Hero */}
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h1 className="page-title text-3xl sm:text-4xl">Set up your interview</h1>
          <p className="page-subtitle text-base">
            Practice for any field with AI-powered feedback, or bring your own question bank.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          {/* Setup Form */}
          <div className="card sm:p-8">
            <form onSubmit={handleStartInterview} className="space-y-7">
              {/* Interview Mode Toggle */}
              <div>
                <label className="label">Interview Mode</label>
                <div className="segmented grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setMode('ai-generated')}
                    className={`segmented-option ${
                      mode === 'ai-generated' ? 'segmented-option-active' : 'segmented-option-inactive'
                    }`}
                  >
                    AI Generated Interview
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('uploaded')}
                    className={`segmented-option ${
                      mode === 'uploaded' ? 'segmented-option-active' : 'segmented-option-inactive'
                    }`}
                  >
                    Practice From My Questions
                  </button>
                </div>
              </div>

              {/* Interview Language — applies to both modes: it drives speech
                  recognition, evaluation, expected-answer, and report language. */}
              <div>
                <label htmlFor="interviewLanguage" className="label">
                  Interview Language *
                </label>
                <select
                  id="interviewLanguage"
                  value={interviewLanguage}
                  onChange={(e) => setInterviewLanguage(e.target.value)}
                  className="input"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeLabel}
                    </option>
                  ))}
                </select>
              </div>

              {mode === 'ai-generated' && (
                <>
                  {/* Topic Selection */}
                  <div>
                    <label htmlFor="topic" className="label">
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
                      className={`input ${errors.topic ? 'input-error' : ''}`}
                    >
                      <option value="">Select a topic...</option>
                      {POPULAR_TOPICS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    {errors.topic && <p className="field-error">{errors.topic}</p>}
                  </div>

                  {/* Custom Topic Input (shown when "Other" is selected) */}
                  {topic === 'Other' && (
                    <div>
                      <label htmlFor="customTopic" className="label">
                        Enter Your Topic *
                      </label>
                      <input
                        type="text"
                        id="customTopic"
                        value={customTopic}
                        onChange={(e) => setCustomTopic(e.target.value)}
                        placeholder="e.g., Nursing, Real Estate, Mechanical Engineering..."
                        className={`input ${errors.topic ? 'input-error' : ''}`}
                      />
                      <p className="helper-text mt-1.5">
                        Enter any field or domain - the system works for ANY topic!
                      </p>
                    </div>
                  )}

                  {/* Difficulty + Style: two-up on larger screens */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="difficulty" className="label">
                        Difficulty Level *
                      </label>
                      <select
                        id="difficulty"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className={`input ${errors.difficulty ? 'input-error' : ''}`}
                      >
                        <option value="">Select difficulty...</option>
                        {DIFFICULTY_LEVELS.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      {errors.difficulty && <p className="field-error">{errors.difficulty}</p>}
                    </div>

                    <div>
                      <label htmlFor="interviewStyle" className="label">
                        Interview Style
                      </label>
                      <select
                        id="interviewStyle"
                        value={interviewStyle}
                        onChange={(e) => setInterviewStyle(e.target.value)}
                        className="input"
                      >
                        {INTERVIEW_STYLES.map((style) => (
                          <option key={style.value} value={style.value}>
                            {style.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Experience Years */}
                  <div>
                    <label htmlFor="experienceYears" className="label">
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
                      className={`input ${errors.experienceYears ? 'input-error' : ''}`}
                    />
                    {errors.experienceYears && <p className="field-error">{errors.experienceYears}</p>}
                    <p className="helper-text mt-1.5">Enter your years of experience in this field (0-50)</p>
                  </div>
                </>
              )}

              {mode === 'ai-generated' ? (
                /* Question Count (AI mode) */
                <div>
                  <label htmlFor="totalQuestions" className="label">
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
                    className={`input ${errors.totalQuestions ? 'input-error' : ''}`}
                  />
                  {errors.totalQuestions && <p className="field-error">{errors.totalQuestions}</p>}
                  <p className="helper-text mt-1.5">Choose between 1-10 questions for your practice session</p>
                </div>
              ) : (
                /* Upload Question File (uploaded mode) */
                <div className="space-y-5">
                  <div>
                    <label htmlFor="uploadFile" className="label">
                      Upload Question File *
                    </label>
                    <div
                      className={`surface-muted flex flex-col items-center justify-center text-center px-6 py-8 transition-colors ${
                        errors.uploadFile ? 'border-red-400' : 'hover:border-primary-300'
                      }`}
                    >
                      <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                      <p className="text-sm font-medium text-gray-700">
                        {uploadFile ? uploadFile.name : 'Choose a question file to upload'}
                      </p>
                      <p className="helper-text mt-1">.txt, .csv, .docx, .pdf — text-based only, max 5MB</p>
                      <input
                        type="file"
                        id="uploadFile"
                        accept=".txt,.csv,.docx,.pdf"
                        onChange={handleFileChange}
                        className="mt-4 text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                      />
                    </div>
                    {errors.uploadFile && <p className="field-error">{errors.uploadFile}</p>}
                    {isParsing && (
                      <p className="mt-2 text-sm text-primary-600 flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-300 border-t-primary-600 animate-spin" />
                        Parsing {uploadFile?.name}...
                      </p>
                    )}
                    {parseError && <p className="field-error">{parseError}</p>}
                  </div>

                  {parsedQuestions.length > 0 && parseSummary && (
                    <div className="card-flat space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="stat-tile">
                          <p className="stat-tile-value">{parseSummary.totalQuestions}</p>
                          <p className="stat-tile-label">Questions detected</p>
                        </div>
                        <div className="stat-tile">
                          <p className="stat-tile-value text-emerald-600">{parseSummary.questionsWithAnswers}</p>
                          <p className="stat-tile-label">Answers detected</p>
                        </div>
                        <div className="stat-tile">
                          <p className="stat-tile-value text-amber-600">{parseSummary.questionsWithoutAnswers}</p>
                          <p className="stat-tile-label">AI answers needed</p>
                        </div>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 bg-white rounded-lg border border-gray-200 p-3">
                        {parsedQuestions.map((q, i) => (
                          <div key={i} className="text-sm text-gray-700 flex items-start gap-2.5 py-1">
                            <span
                              className={`shrink-0 mt-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                                q.hasAnswer ? 'bg-emerald-500' : 'bg-amber-400'
                              }`}
                            />
                            <span className="leading-snug">
                              <span className="text-gray-400 font-medium">{i + 1}.</span> {q.questionText}
                            </span>
                          </div>
                        ))}
                      </div>

                      <label htmlFor="useAllQuestions" className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          id="useAllQuestions"
                          checked={useAllQuestions}
                          onChange={(e) => setUseAllQuestions(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Use all {parsedQuestions.length} questions</span>
                      </label>

                      {!useAllQuestions && (
                        <div>
                          <label htmlFor="uploadedQuestionCount" className="label">
                            Number of Questions to Practice *
                          </label>
                          <input
                            type="number"
                            id="uploadedQuestionCount"
                            value={uploadedQuestionCount}
                            onChange={(e) => setUploadedQuestionCount(e.target.value)}
                            min="1"
                            max={parsedQuestions.length}
                            placeholder={`1-${parsedQuestions.length}`}
                            className={`input ${errors.totalQuestions ? 'input-error' : ''}`}
                          />
                          {errors.totalQuestions && <p className="field-error">{errors.totalQuestions}</p>}
                        </div>
                      )}

                      <label htmlFor="shuffleQuestions" className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          id="shuffleQuestions"
                          checked={shuffleQuestions}
                          onChange={(e) => setShuffleQuestions(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Shuffle question order</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* API Error */}
              {apiError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                  <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <h4 className="text-sm font-semibold text-red-900">Error</h4>
                    <p className="text-sm text-red-700 mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading}
                  className="btn btn-secondary mt-6"
                >
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={isLoading || isParsing || !canSubmit}
                  className="btn btn-primary mt-6 px-6"
                >
                  {isLoading ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      Start Interview
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
            <div className="card-flat">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h3 className="section-title text-sm mb-1">AI-Powered</h3>
              <p className="text-sm text-gray-500">Get intelligent feedback using OpenAI GPT-4 technology</p>
            </div>

            <div className="card-flat">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>
              <h3 className="section-title text-sm mb-1">Voice Recording</h3>
              <p className="text-sm text-gray-500">Practice with real-time speech recognition and transcription</p>
            </div>

            <div className="card-flat">
              <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="section-title text-sm mb-1">Detailed Reports</h3>
              <p className="text-sm text-gray-500">Receive comprehensive evaluation with scores and suggestions</p>
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

export default InterviewSetupPage;
