import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerCodingQuestionSummary,
  EmployerJob,
  CODING_SUPPORTED_LANGUAGES,
  EmployerCodingQuestionDifficulty,
} from '../../api/employerApi';
import { AlertCircle, Loader2, Code2, Plus, X } from 'lucide-react';

const formatDate = (value: string) => new Date(value).toLocaleDateString();

const STATUS_BADGE: Record<string, string> = { draft: 'badge-neutral', ready: 'badge-success', archived: 'badge-neutral' };
const DIFFICULTY_BADGE: Record<string, string> = { easy: 'badge-success', medium: 'badge-warning', hard: 'badge-warning' };

/**
 * Coding question foundation (30A) — structured problem definitions only.
 * NO code execution, NO AI. Job-level reusable by default; a question may
 * optionally be linked to one exact hiring interview at creation time.
 */
const EmployerCodingQuestionsPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [questions, setQuestions] = useState<EmployerCodingQuestionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<EmployerJob[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [jobId, setJobId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<EmployerCodingQuestionDifficulty>('medium');
  const [languages, setLanguages] = useState<string[]>(['javascript']);
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const fetchQuestions = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listEmployerCodingQuestions(organizationId);
      setQuestions(response.data.questions);
    } catch (err: any) {
      setError(err.message || 'Failed to load coding questions');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchQuestions();
    }
  }, [isSyncing, activeOrganization, canView, fetchQuestions]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canManage) {
      employerApi
        .listJobs(organizationId!, { limit: 100 })
        .then((res) => setJobs(res.data.jobs))
        .catch(() => {});
    }
  }, [isSyncing, activeOrganization, canManage, organizationId]);

  const resetForm = () => {
    setJobId('');
    setTitle('');
    setDescription('');
    setDifficulty('medium');
    setLanguages(['javascript']);
    setTimeLimitMs(2000);
    setMemoryLimitMb(256);
    setSaveError(null);
  };

  const toggleLanguage = (lang: string) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await employerApi.createEmployerCodingQuestion(organizationId, {
        jobId,
        title,
        description,
        difficulty,
        supportedLanguages: languages,
        timeLimitMs,
        memoryLimitMb,
      });
      setShowForm(false);
      resetForm();
      fetchQuestions();
      navigate(`/organizations/${organizationId}/employer/coding-questions/${response.data.id}`);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create coding question');
    } finally {
      setSaving(false);
    }
  };

  if (isSyncing || contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading organization...</p>
          </div>
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
            <h2 className="section-title text-lg mb-2">Couldn't load organization</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">
              {contextError || "You don't have access to this organization, or it no longer exists."}
            </p>
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
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have access to coding assessments.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h1 className="page-title flex items-center gap-2">
            <Code2 size={20} className="text-mentor-text-muted" />
            Coding Assessments
          </h1>
          {canManage && !showForm && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary">
              <Plus size={16} />
              Create
            </button>
          )}
        </div>
        <p className="text-sm text-mentor-text-secondary mb-6">
          Structured coding problems for hiring assessments. No execution yet — problems and test cases only.
        </p>

        {showForm && (
          <form onSubmit={handleSubmit} className="card mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title text-base">Create Coding Question</h2>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-mentor-text-muted hover:text-mentor-text"
              >
                <X size={18} />
              </button>
            </div>
            <div>
              <label className="label">Job</label>
              <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="input">
                <option value="">Select a job...</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" maxLength={200} placeholder="Two Sum" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input"
                rows={4}
                maxLength={8000}
                placeholder="Problem statement..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as EmployerCodingQuestionDifficulty)} className="input">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="label">Time Limit (ms)</label>
                <input
                  type="number"
                  min={500}
                  max={10000}
                  value={timeLimitMs}
                  onChange={(e) => setTimeLimitMs(Number(e.target.value))}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Memory Limit (MB)</label>
                <input
                  type="number"
                  min={16}
                  max={1024}
                  value={memoryLimitMb}
                  onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="label mb-1.5">Supported Languages</label>
              <div className="flex items-center gap-4">
                {CODING_SUPPORTED_LANGUAGES.map((lang) => (
                  <label key={lang} className="flex items-center gap-1.5 text-sm text-mentor-text capitalize">
                    <input type="checkbox" checked={languages.includes(lang)} onChange={() => toggleLanguage(lang)} />
                    {lang}
                  </label>
                ))}
              </div>
            </div>
            {saveError && <p className="text-sm text-mentor-error">{saveError}</p>}
            <button type="submit" disabled={saving || !jobId || !title.trim() || !description.trim() || languages.length === 0} className="btn btn-primary">
              {saving ? 'Creating...' : 'Create Draft'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
            <p className="text-sm text-mentor-text-secondary mb-4">{error}</p>
            <button onClick={fetchQuestions} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : questions.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-mentor-text-secondary">No coding questions yet.</p>
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Difficulty</th>
                  <th className="py-2 pr-3">Languages</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Test Cases</th>
                  <th className="py-2 pr-3">Linked</th>
                  <th className="py-2 pr-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-b border-mentor-border last:border-0">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/organizations/${organizationId}/employer/coding-questions/${q.id}`}
                        className="text-mentor-text font-medium hover:underline"
                      >
                        {q.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`badge ${DIFFICULTY_BADGE[q.difficulty] || 'badge-neutral'}`}>{q.difficulty}</span>
                    </td>
                    <td className="py-2 pr-3 text-mentor-text-secondary">{q.supportedLanguages.join(', ')}</td>
                    <td className="py-2 pr-3">
                      <span className={`badge ${STATUS_BADGE[q.status] || 'badge-neutral'}`}>{q.status}</span>
                    </td>
                    <td className="py-2 pr-3 text-mentor-text-secondary">{q.testCaseCount}</td>
                    <td className="py-2 pr-3 text-mentor-text-muted text-xs">{q.interviewId ? 'Interview-linked' : 'Job-level'}</td>
                    <td className="py-2 pr-3 text-mentor-text-secondary whitespace-nowrap">{formatDate(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerCodingQuestionsPage;
