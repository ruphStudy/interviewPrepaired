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
import {
  Sparkles,
  FileText,
  UploadCloud,
  Languages,
  ListChecks,
  CheckCircle2,
  Shuffle,
  RotateCcw,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';

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

  const startLabel = mode === 'uploaded' ? 'Start Practice' : 'Start Interview';

  return (
    <AuthenticatedLayout>
      <div className="page-container py-8 sm:py-10">
        {/* Intro */}
        <div className="page-header max-w-4xl">
          <h1 className="page-title">Set up your mock interview</h1>
          <p className="page-subtitle">Choose how you want to practice and tailor the session to your goals.</p>
        </div>

        <div className="max-w-4xl">
          {/* Setup Card */}
          <div className="card p-5 sm:p-8">
            <form onSubmit={handleStartInterview} className="space-y-7">
              {/* Interview Mode Selector */}
              <div>
                <label className="label">Interview Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('ai-generated')}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      mode === 'ai-generated'
                        ? 'border-primary-600 bg-mentor-soft shadow-soft dark:border-future-violet dark:bg-future-violet/10 dark:shadow-none'
                        : 'border-mentor-border bg-white hover:bg-mentor-surface dark:border-future-border dark:bg-future-surface dark:hover:bg-future-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <Sparkles size={18} className={mode === 'ai-generated' ? 'text-primary-700 dark:text-future-violet' : 'text-mentor-text-secondary dark:text-future-muted'} />
                      <span className={`text-sm font-semibold ${mode === 'ai-generated' ? 'text-primary-700 dark:text-future-violet' : 'text-mentor-text dark:text-future-text'}`}>
                        AI Generated
                      </span>
                    </div>
                    <p className={`text-xs leading-snug ${mode === 'ai-generated' ? 'text-primary-700/80 dark:text-future-secondary' : 'text-mentor-text-muted dark:text-future-muted'}`}>
                      AI creates questions based on your role and level.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('uploaded')}
                    className={`text-left rounded-xl border p-4 transition-colors ${
                      mode === 'uploaded'
                        ? 'border-primary-600 bg-mentor-soft shadow-soft dark:border-future-violet dark:bg-future-violet/10 dark:shadow-none'
                        : 'border-mentor-border bg-white hover:bg-mentor-surface dark:border-future-border dark:bg-future-surface dark:hover:bg-future-elevated'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <FileText size={18} className={mode === 'uploaded' ? 'text-primary-700 dark:text-future-violet' : 'text-mentor-text-secondary dark:text-future-muted'} />
                      <span className={`text-sm font-semibold ${mode === 'uploaded' ? 'text-primary-700 dark:text-future-violet' : 'text-mentor-text dark:text-future-text'}`}>
                        Practice From My Questions
                      </span>
                    </div>
                    <p className={`text-xs leading-snug ${mode === 'uploaded' ? 'text-primary-700/80 dark:text-future-secondary' : 'text-mentor-text-muted dark:text-future-muted'}`}>
                      Upload your own question set and practice it.
                    </p>
                  </button>
                </div>
              </div>

              {/* Interview Language — applies to both modes: it drives speech
                  recognition, evaluation, expected-answer, and report language. */}
              <div>
                <label htmlFor="interviewLanguage" className="label flex items-center gap-1.5">
                  <Languages size={14} className="text-mentor-text-muted" />
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
                <p className="helper-text mt-1.5">Used for questions, speech recognition, evaluation and feedback.</p>
              </div>

              {mode === 'ai-generated' && (
                <>
                  {/* Topic + Difficulty */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                      {!errors.topic && (
                        <p className="helper-text mt-1.5">Choose the role, technology or field you want to practice.</p>
                      )}
                    </div>

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
                      <p className="helper-text mt-1.5">Enter any role, domain or specialization.</p>
                    </div>
                  )}

                  {/* Interview Style + Experience */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                    </div>
                  </div>

                  {/* Question Count + Tip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                      {!errors.totalQuestions && <p className="helper-text mt-1.5">Choose 1–10 questions for this session.</p>}
                    </div>

                    <div className="surface-muted p-4 self-start">
                      <p className="text-xs font-semibold text-mentor-text mb-1">Tip</p>
                      <p className="text-xs text-mentor-text-secondary leading-relaxed">
                        Choose a focused topic to get more relevant interview questions.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {mode === 'uploaded' && (
                /* Upload Question File (uploaded mode) */
                <div className="space-y-5">
                  <div>
                    <label htmlFor="uploadFile" className="label">
                      Upload Question File *
                    </label>
                    <div
                      className={`surface-muted border-dashed flex flex-col items-center justify-center text-center px-6 py-8 transition-colors ${
                        errors.uploadFile ? 'border-mentor-error' : 'hover:border-primary-300'
                      }`}
                    >
                      <UploadCloud size={28} className="text-primary-600 mb-2" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-mentor-text">
                        {uploadFile ? uploadFile.name : 'Upload your question set'}
                      </p>
                      <p className="helper-text mt-1">TXT, CSV, DOCX or PDF · max 5 MB</p>
                      <input
                        type="file"
                        id="uploadFile"
                        accept=".txt,.csv,.docx,.pdf"
                        onChange={handleFileChange}
                        className="mt-4 text-sm text-mentor-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                      />
                    </div>
                    {errors.uploadFile && <p className="field-error">{errors.uploadFile}</p>}
                    {isParsing && (
                      <p className="mt-2 text-sm text-primary-600 flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Parsing {uploadFile?.name}...
                      </p>
                    )}
                    {parseError && <p className="field-error">{parseError}</p>}
                  </div>

                  {parsedQuestions.length > 0 && parseSummary && (
                    <div className="card-flat space-y-4">
                      {/* Parsed Summary */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="stat-tile">
                          <div className="flex items-center justify-center gap-1.5">
                            <ListChecks size={14} className="text-primary-600" />
                            <p className="stat-tile-value">{parseSummary.totalQuestions}</p>
                          </div>
                          <p className="stat-tile-label">Questions</p>
                        </div>
                        <div className="stat-tile">
                          <div className="flex items-center justify-center gap-1.5">
                            <CheckCircle2 size={14} className="text-mentor-success" />
                            <p className="stat-tile-value text-mentor-success">{parseSummary.questionsWithAnswers}</p>
                          </div>
                          <p className="stat-tile-label">Answers Included</p>
                        </div>
                        <div className="stat-tile">
                          <div className="flex items-center justify-center gap-1.5">
                            <Sparkles size={14} className="text-mentor-warning" />
                            <p className="stat-tile-value text-mentor-warning">{parseSummary.questionsWithoutAnswers}</p>
                          </div>
                          <p className="stat-tile-label">AI Answers Needed</p>
                        </div>
                      </div>

                      {/* Question Preview */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-mentor-text">Question Preview</p>
                          <span className="text-xs text-mentor-text-muted">{parsedQuestions.length} questions</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2 bg-white dark:bg-future-surface rounded-lg border border-mentor-border dark:border-future-border p-3">
                          {parsedQuestions.map((q, i) => (
                            <div key={i} className="flex items-start justify-between gap-3 py-1">
                              <span className="text-sm text-mentor-text-secondary leading-snug">
                                <span className="text-mentor-text-muted font-medium">{i + 1}.</span> {q.questionText}
                              </span>
                              <span
                                className={`shrink-0 badge ${q.hasAnswer ? 'badge-success' : 'badge-warning'}`}
                              >
                                {q.hasAnswer ? 'Answer included' : 'AI answer needed'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <label htmlFor="useAllQuestions" className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          id="useAllQuestions"
                          checked={useAllQuestions}
                          onChange={(e) => setUseAllQuestions(e.target.checked)}
                          className="h-4 w-4 rounded border-mentor-border text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-mentor-text">Use all {parsedQuestions.length} questions</span>
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
                          className="h-4 w-4 rounded border-mentor-border text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-mentor-text flex items-center gap-1.5">
                          <Shuffle size={14} className="text-mentor-text-muted" />
                          Shuffle question order
                        </span>
                      </label>
                      <p className="helper-text -mt-3">Practice questions in a random sequence.</p>
                    </div>
                  )}
                </div>
              )}

              {/* API Error */}
              {apiError && (
                <div className="flex items-start gap-3 rounded-lg border border-mentor-error/30 bg-mentor-error/10 p-4">
                  <AlertCircle size={20} className="text-mentor-error mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-mentor-error">Error</h4>
                    <p className="text-sm text-mentor-error mt-0.5">{apiError}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-mentor-border">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading}
                  className="btn btn-secondary mt-6"
                >
                  <RotateCcw size={16} />
                  Reset
                </button>

                <button
                  type="submit"
                  disabled={isLoading || isParsing || !canSubmit}
                  className="btn btn-primary mt-6 px-6"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      {startLabel}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
};

export default InterviewSetupPage;
