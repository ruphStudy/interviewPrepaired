import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerCodingQuestion,
  EmployerCodingTestCase,
  EmployerCodingExample,
  EmployerCodingFunctionParameter,
  CODING_SUPPORTED_LANGUAGES,
  EmployerCodingQuestionDifficulty,
  EmployerCodingTestCaseType,
} from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, Plus, Trash2 } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = { draft: 'badge-neutral', ready: 'badge-success', archived: 'badge-neutral' };

const linesToArray = (value: string): string[] =>
  value
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * Coding question editor + test case management (30A). Only mutable while
 * `status === 'draft'`. No Monaco/code-editor package — plain textareas.
 */
const EmployerCodingQuestionDetailPage: React.FC = () => {
  const { organizationId, codingQuestionId } = useParams<{ organizationId: string; codingQuestionId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [question, setQuestion] = useState<EmployerCodingQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable draft fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<EmployerCodingQuestionDifficulty>('medium');
  const [languages, setLanguages] = useState<string[]>([]);
  const [competencyNames, setCompetencyNames] = useState('');
  const [skills, setSkills] = useState('');
  const [constraints, setConstraints] = useState('');
  const [examples, setExamples] = useState<EmployerCodingExample[]>([]);
  const [starterCode, setStarterCode] = useState<Record<string, string>>({});
  const [functionName, setFunctionName] = useState('');
  const [returnType, setReturnType] = useState('');
  const [parameters, setParameters] = useState<EmployerCodingFunctionParameter[]>([]);
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [markingReady, setMarkingReady] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<EmployerCodingTestCase[]>([]);
  const [testCasesLoading, setTestCasesLoading] = useState(true);
  const [testCasesError, setTestCasesError] = useState<string | null>(null);
  const [tcType, setTcType] = useState<EmployerCodingTestCaseType>('sample');
  const [tcInput, setTcInput] = useState('');
  const [tcOutput, setTcOutput] = useState('');
  const [tcWeight, setTcWeight] = useState(1);
  const [tcExplanation, setTcExplanation] = useState('');
  const [addingTestCase, setAddingTestCase] = useState(false);
  const [addTestCaseError, setAddTestCaseError] = useState<string | null>(null);
  const [archivingTestCaseId, setArchivingTestCaseId] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const hydrateForm = (q: EmployerCodingQuestion) => {
    setTitle(q.title);
    setDescription(q.description);
    setDifficulty(q.difficulty);
    setLanguages(q.supportedLanguages);
    setCompetencyNames(q.competencyNames.join('\n'));
    setSkills(q.skills.join('\n'));
    setConstraints(q.constraints.join('\n'));
    setExamples(q.examples.length > 0 ? q.examples : []);
    setStarterCode(q.starterCode ? { ...q.starterCode } : {});
    setFunctionName(q.functionSignature?.name || '');
    setReturnType(q.functionSignature?.returnType || '');
    setParameters(q.functionSignature?.parameters || []);
    setTimeLimitMs(q.timeLimitMs);
    setMemoryLimitMb(q.memoryLimitMb);
  };

  const fetchQuestion = useCallback(async () => {
    if (!organizationId || !codingQuestionId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.getEmployerCodingQuestion(organizationId, codingQuestionId);
      setQuestion(response.data);
      hydrateForm(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load coding question');
    } finally {
      setLoading(false);
    }
  }, [organizationId, codingQuestionId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchQuestion();
    }
  }, [isSyncing, activeOrganization, canView, fetchQuestion]);

  const fetchTestCases = useCallback(async () => {
    if (!organizationId || !codingQuestionId) return;
    setTestCasesLoading(true);
    setTestCasesError(null);
    try {
      const response = await employerApi.listEmployerCodingTestCases(organizationId, codingQuestionId);
      setTestCases(response.data.testCases);
    } catch (err: any) {
      setTestCasesError(err.message || 'Failed to load test cases');
    } finally {
      setTestCasesLoading(false);
    }
  }, [organizationId, codingQuestionId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchTestCases();
    }
  }, [isSyncing, activeOrganization, canView, fetchTestCases]);

  const isDraft = question?.status === 'draft';

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const handleSave = async () => {
    if (!organizationId || !codingQuestionId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await employerApi.updateEmployerCodingQuestion(organizationId, codingQuestionId, {
        title,
        description,
        difficulty,
        supportedLanguages: languages,
        competencyNames: linesToArray(competencyNames),
        skills: linesToArray(skills),
        constraints: linesToArray(constraints),
        examples: examples.filter((e) => e.input.trim() || e.output.trim()),
        starterCode,
        functionSignature: functionName.trim() ? { name: functionName.trim(), returnType: returnType.trim() || undefined, parameters } : undefined,
        timeLimitMs,
        memoryLimitMb,
      });
      setQuestion(response.data);
      hydrateForm(response.data);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save coding question');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReady = async () => {
    if (!organizationId || !codingQuestionId) return;
    setMarkingReady(true);
    setReadyError(null);
    try {
      const response = await employerApi.markEmployerCodingQuestionReady(organizationId, codingQuestionId);
      setQuestion(response.data);
    } catch (err: any) {
      setReadyError(err.message || 'Failed to mark ready');
    } finally {
      setMarkingReady(false);
    }
  };

  const handleArchive = async () => {
    if (!organizationId || !codingQuestionId) return;
    if (!window.confirm('Archive this coding question? It will become read-only.')) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await employerApi.archiveEmployerCodingQuestion(organizationId, codingQuestionId);
      setQuestion(response.data);
    } catch (err: any) {
      setArchiveError(err.message || 'Failed to archive');
    } finally {
      setArchiving(false);
    }
  };

  const handleAddTestCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !codingQuestionId) return;
    setAddingTestCase(true);
    setAddTestCaseError(null);
    try {
      await employerApi.addEmployerCodingTestCase(organizationId, codingQuestionId, {
        type: tcType,
        input: tcInput,
        expectedOutput: tcOutput,
        weight: tcWeight,
        explanation: tcExplanation || undefined,
      });
      setTcInput('');
      setTcOutput('');
      setTcExplanation('');
      setTcWeight(1);
      fetchTestCases();
    } catch (err: any) {
      setAddTestCaseError(err.message || 'Failed to add test case');
    } finally {
      setAddingTestCase(false);
    }
  };

  const handleArchiveTestCase = async (testCaseId: string) => {
    if (!organizationId || !codingQuestionId) return;
    setArchivingTestCaseId(testCaseId);
    try {
      await employerApi.archiveEmployerCodingTestCase(organizationId, codingQuestionId, testCaseId);
      fetchTestCases();
    } catch (err: any) {
      setTestCasesError(err.message || 'Failed to remove test case');
    } finally {
      setArchivingTestCaseId(null);
    }
  };

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <Loader2 className="w-9 h-9 text-primary-600 animate-spin" />
        </div>
      </AuthenticatedLayout>
    );
  }

  if (contextError || !activeOrganization) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <p className="text-sm text-mentor-text-secondary mb-6">{contextError || "You don't have access to this organization."}</p>
            <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
              Back to Dashboard
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (activeOrganization.type !== 'company' || !canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <p className="text-sm text-mentor-text-secondary">You don't have access to this coding question.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <Link
          to={`/organizations/${organizationId}/employer/coding-questions`}
          className="inline-flex items-center gap-1 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Coding Assessments
        </Link>

        {loading ? (
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        ) : error || !question ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-mentor-error mb-2">{error || 'Coding question not found'}</p>
            <button onClick={fetchQuestion} className="btn btn-secondary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-6">
              <h1 className="page-title">{question.title}</h1>
              <span className={`badge ${STATUS_BADGE[question.status] || 'badge-neutral'}`}>{question.status}</span>
              {!isDraft && <span className="text-xs text-mentor-text-muted">This question is {question.status} and read-only except archive.</span>}
            </div>

            <div className="card mb-6 space-y-4">
              <h2 className="section-title mb-1">Problem Definition</h2>
              <div>
                <label className="label">Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isDraft} className="input" maxLength={200} />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={!isDraft} className="input" rows={6} maxLength={8000} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as EmployerCodingQuestionDifficulty)} disabled={!isDraft} className="input">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div>
                  <label className="label">Time Limit (ms)</label>
                  <input type="number" min={500} max={10000} value={timeLimitMs} onChange={(e) => setTimeLimitMs(Number(e.target.value))} disabled={!isDraft} className="input" />
                </div>
                <div>
                  <label className="label">Memory Limit (MB)</label>
                  <input type="number" min={16} max={1024} value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(Number(e.target.value))} disabled={!isDraft} className="input" />
                </div>
              </div>
              <div>
                <label className="label mb-1.5">Supported Languages</label>
                <div className="flex items-center gap-4">
                  {CODING_SUPPORTED_LANGUAGES.map((lang) => (
                    <label key={lang} className="flex items-center gap-1.5 text-sm text-mentor-text capitalize">
                      <input type="checkbox" checked={languages.includes(lang)} onChange={() => toggleLanguage(lang)} disabled={!isDraft} />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Competency Names (one per line)</label>
                  <textarea value={competencyNames} onChange={(e) => setCompetencyNames(e.target.value)} disabled={!isDraft} className="input" rows={3} />
                </div>
                <div>
                  <label className="label">Skills (one per line)</label>
                  <textarea value={skills} onChange={(e) => setSkills(e.target.value)} disabled={!isDraft} className="input" rows={3} />
                </div>
              </div>
              <div>
                <label className="label">Constraints (one per line)</label>
                <textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} disabled={!isDraft} className="input" rows={3} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Examples</label>
                  {isDraft && (
                    <button
                      type="button"
                      onClick={() => setExamples((prev) => [...prev, { input: '', output: '', explanation: '' }])}
                      className="btn btn-secondary px-2 py-1 text-xs"
                    >
                      <Plus size={12} /> Add Example
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {examples.map((ex, i) => (
                    <div key={i} className="surface-muted p-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <textarea
                        value={ex.input}
                        onChange={(e) => setExamples((prev) => prev.map((p, idx) => (idx === i ? { ...p, input: e.target.value } : p)))}
                        disabled={!isDraft}
                        placeholder="Input"
                        className="input"
                        rows={2}
                      />
                      <textarea
                        value={ex.output}
                        onChange={(e) => setExamples((prev) => prev.map((p, idx) => (idx === i ? { ...p, output: e.target.value } : p)))}
                        disabled={!isDraft}
                        placeholder="Output"
                        className="input"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <textarea
                          value={ex.explanation || ''}
                          onChange={(e) => setExamples((prev) => prev.map((p, idx) => (idx === i ? { ...p, explanation: e.target.value } : p)))}
                          disabled={!isDraft}
                          placeholder="Explanation (optional)"
                          className="input flex-1"
                          rows={2}
                        />
                        {isDraft && (
                          <button type="button" onClick={() => setExamples((prev) => prev.filter((_, idx) => idx !== i))} className="text-mentor-error shrink-0">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label mb-1.5">Starter Code</label>
                <div className="space-y-2">
                  {languages.map((lang) => (
                    <div key={lang}>
                      <p className="text-xs text-mentor-text-muted mb-1 capitalize">{lang}</p>
                      <textarea
                        value={starterCode[lang] || ''}
                        onChange={(e) => setStarterCode((prev) => ({ ...prev, [lang]: e.target.value }))}
                        disabled={!isDraft}
                        className="input font-mono text-xs"
                        rows={4}
                        maxLength={10000}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label mb-1.5">Function Signature (optional)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <input value={functionName} onChange={(e) => setFunctionName(e.target.value)} disabled={!isDraft} placeholder="Function name" className="input" />
                  <input value={returnType} onChange={(e) => setReturnType(e.target.value)} disabled={!isDraft} placeholder="Return type (optional)" className="input" />
                </div>
                <div className="space-y-1.5">
                  {parameters.map((p, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={p.name}
                        onChange={(e) => setParameters((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                        disabled={!isDraft}
                        placeholder="Parameter name"
                        className="input"
                      />
                      <input
                        value={p.type || ''}
                        onChange={(e) => setParameters((prev) => prev.map((x, idx) => (idx === i ? { ...x, type: e.target.value } : x)))}
                        disabled={!isDraft}
                        placeholder="Type (optional)"
                        className="input"
                      />
                      {isDraft && (
                        <button type="button" onClick={() => setParameters((prev) => prev.filter((_, idx) => idx !== i))} className="text-mentor-error shrink-0">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  {isDraft && (
                    <button type="button" onClick={() => setParameters((prev) => [...prev, { name: '', type: '' }])} className="btn btn-secondary px-2 py-1 text-xs">
                      <Plus size={12} /> Add Parameter
                    </button>
                  )}
                </div>
              </div>

              {isDraft && (
                <div className="pt-2 border-t border-mentor-border flex items-center gap-3 flex-wrap">
                  {saveError && <p className="text-sm text-mentor-error">{saveError}</p>}
                  <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            <div className="card mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Test Cases</h2>
              </div>

              {testCasesLoading ? (
                <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
              ) : testCasesError ? (
                <p className="text-sm text-mentor-error">{testCasesError}</p>
              ) : (
                <>
                  {testCases.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary mb-4">No test cases yet.</p>
                  ) : (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                            <th className="py-2 pr-3">Order</th>
                            <th className="py-2 pr-3">Type</th>
                            <th className="py-2 pr-3">Input</th>
                            <th className="py-2 pr-3">Expected Output</th>
                            <th className="py-2 pr-3">Weight</th>
                            {isDraft && <th className="py-2 pr-3" />}
                          </tr>
                        </thead>
                        <tbody>
                          {testCases.map((t) => (
                            <tr key={t.id} className="border-b border-mentor-border last:border-0 align-top">
                              <td className="py-2 pr-3 text-mentor-text-secondary">{t.order}</td>
                              <td className="py-2 pr-3">
                                <span className={`badge ${t.type === 'hidden' ? 'badge-warning' : 'badge-neutral'}`}>
                                  {t.type === 'hidden' ? 'Hidden' : 'Sample'}
                                </span>
                              </td>
                              <td className="py-2 pr-3 text-mentor-text font-mono text-xs max-w-[200px] whitespace-pre-wrap">{t.input}</td>
                              <td className="py-2 pr-3 text-mentor-text font-mono text-xs max-w-[200px] whitespace-pre-wrap">{t.expectedOutput}</td>
                              <td className="py-2 pr-3 text-mentor-text-secondary">{t.weight}</td>
                              {isDraft && (
                                <td className="py-2 pr-3">
                                  <button
                                    onClick={() => handleArchiveTestCase(t.id)}
                                    disabled={archivingTestCaseId === t.id}
                                    className="btn btn-secondary px-2 py-1 text-xs"
                                  >
                                    Remove
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {isDraft && (
                    <form onSubmit={handleAddTestCase} className="surface-muted p-4 space-y-2">
                      <p className="text-sm font-medium text-mentor-text">Add Test Case</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select value={tcType} onChange={(e) => setTcType(e.target.value as EmployerCodingTestCaseType)} className="input">
                          <option value="sample">Sample (candidate-visible)</option>
                          <option value="hidden">Hidden (employer-only)</option>
                        </select>
                        <input type="number" min={0} max={100} value={tcWeight} onChange={(e) => setTcWeight(Number(e.target.value))} className="input" placeholder="Weight" />
                      </div>
                      <textarea value={tcInput} onChange={(e) => setTcInput(e.target.value)} placeholder="Input" className="input font-mono text-xs" rows={2} maxLength={4000} />
                      <textarea
                        value={tcOutput}
                        onChange={(e) => setTcOutput(e.target.value)}
                        placeholder="Expected Output"
                        className="input font-mono text-xs"
                        rows={2}
                        maxLength={4000}
                      />
                      <input value={tcExplanation} onChange={(e) => setTcExplanation(e.target.value)} placeholder="Explanation (optional)" className="input" maxLength={500} />
                      {addTestCaseError && <p className="text-sm text-mentor-error">{addTestCaseError}</p>}
                      <button type="submit" disabled={addingTestCase || !tcInput.trim() || !tcOutput.trim()} className="btn btn-primary px-3 py-1.5 text-xs">
                        {addingTestCase ? 'Adding...' : 'Add Test Case'}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>

            {canManage && question.status !== 'archived' && (
              <div className="card flex items-center gap-3 flex-wrap">
                {isDraft && (
                  <>
                    {readyError && <p className="text-sm text-mentor-error">{readyError}</p>}
                    <button onClick={handleMarkReady} disabled={markingReady} className="btn btn-primary">
                      {markingReady ? 'Marking Ready...' : 'Mark Ready'}
                    </button>
                  </>
                )}
                {archiveError && <p className="text-sm text-mentor-error">{archiveError}</p>}
                <button onClick={handleArchive} disabled={archiving} className="btn btn-secondary">
                  {archiving ? 'Archiving...' : 'Archive'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerCodingQuestionDetailPage;
