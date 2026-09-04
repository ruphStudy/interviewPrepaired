import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, {
  InstituteInterviewTemplate,
  InstituteCourse,
  InstituteBatch,
  InstituteEntityStatus,
  TemplatePayload,
  OrgQuestionSetSummary,
  OrgQuestionSetRow,
} from '../../api/instituteApi';
import { DIFFICULTY_LEVELS, INTERVIEW_STYLES } from '../../api/interviewApi';
import { SUPPORTED_LANGUAGES } from '../../config/languages';
import { AlertCircle, Loader2, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react';

const PAGE_LIMIT = 20;

const EMPTY_FORM: TemplatePayload = {
  name: '',
  description: '',
  questionSetId: '',
  courseId: '',
  batchId: '',
  interviewConfig: { difficulty: '', style: '', language: '', questionLimit: undefined as unknown as number },
};

const EMPTY_QS_ROW: OrgQuestionSetRow = { questionText: '', referenceAnswer: '' };

const InstituteTemplatesPage: React.FC = () => {
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

  const [templates, setTemplates] = useState<InstituteInterviewTemplate[]>([]);
  const [courses, setCourses] = useState<InstituteCourse[]>([]);
  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [questionSets, setQuestionSets] = useState<OrgQuestionSetSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<InstituteEntityStatus | ''>('');
  const [courseFilter, setCourseFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<'closed' | 'create' | string>('closed');
  const [form, setForm] = useState<TemplatePayload>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showCreateQs, setShowCreateQs] = useState(false);
  const [qsName, setQsName] = useState('');
  const [qsDescription, setQsDescription] = useState('');
  const [qsRows, setQsRows] = useState<OrgQuestionSetRow[]>([{ ...EMPTY_QS_ROW }]);
  const [qsSubmitting, setQsSubmitting] = useState(false);
  const [qsError, setQsError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('question-sets:view');
  const canManage = hasPermission('question-sets:manage') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const courseName = (id?: string) => courses.find((c) => c.id === id)?.name;
  const batchName = (id?: string) => batches.find((b) => b.id === id)?.name;
  const selectedBatch = batches.find((b) => b.id === form.batchId);

  const fetchOptions = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [coursesResponse, batchesResponse, qsResponse] = await Promise.all([
        instituteApi.listCourses(organizationId, { limit: 100 }),
        instituteApi.listBatches(organizationId, { limit: 100 }),
        instituteApi.listOrgQuestionSets(organizationId, { limit: 100 }),
      ]);
      setCourses(coursesResponse.data.courses);
      setBatches(batchesResponse.data.batches);
      setQuestionSets(qsResponse.data.questionSets);
    } catch {
      // Non-fatal — filter/form option labels just won't populate.
    }
  }, [organizationId]);

  const fetchTemplates = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.listTemplates(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        courseId: courseFilter || undefined,
        batchId: batchFilter || undefined,
      });
      setTemplates(response.data.templates);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load interview templates');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, courseFilter, batchFilter]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && canView) {
      fetchOptions();
      fetchTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSyncing, activeOrganization, canView, fetchOptions, fetchTemplates]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormMode('create');
  };

  const openEdit = (template: InstituteInterviewTemplate) => {
    setForm({
      name: template.name,
      description: template.description || '',
      questionSetId: template.questionSetId,
      courseId: template.courseId || '',
      batchId: template.batchId || '',
      interviewConfig: {
        difficulty: template.interviewConfig?.difficulty || '',
        style: template.interviewConfig?.style || '',
        language: template.interviewConfig?.language || '',
        questionLimit: template.interviewConfig?.questionLimit,
      },
    });
    setFormError(null);
    setFormMode(template.id);
  };

  const closeForm = () => setFormMode('closed');

  const handleBatchChange = (batchId: string) => {
    const batch = batches.find((b) => b.id === batchId);
    setForm((f) => ({ ...f, batchId, courseId: batch ? batch.courseId : f.courseId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.name?.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!form.questionSetId) {
      setFormError('Question set is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);

    const cfg = form.interviewConfig;
    const interviewConfig =
      cfg && (cfg.difficulty || cfg.style || cfg.language || cfg.questionLimit)
        ? {
            difficulty: cfg.difficulty || undefined,
            style: cfg.style || undefined,
            language: cfg.language || undefined,
            questionLimit: cfg.questionLimit || undefined,
          }
        : null;

    const payload: TemplatePayload = {
      name: form.name,
      description: form.description || null,
      questionSetId: form.questionSetId,
      courseId: form.courseId || null,
      batchId: form.batchId || null,
      interviewConfig,
    };

    try {
      if (formMode === 'create') {
        await instituteApi.createTemplate(organizationId, payload);
      } else {
        await instituteApi.updateTemplate(organizationId, formMode, payload);
      }
      setFormMode('closed');
      fetchTemplates();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save interview template');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (template: InstituteInterviewTemplate) => {
    if (!organizationId) return;
    if (!window.confirm(`Deactivate template "${template.name}"?`)) return;
    setActionError(null);
    try {
      await instituteApi.deactivateTemplate(organizationId, template.id);
      fetchTemplates();
    } catch (err: any) {
      setActionError(err.message || 'Failed to deactivate template');
    }
  };

  // ---- Simple "Create Question Set" flow (not a rich editor) ----

  const addQsRow = () => setQsRows((rows) => [...rows, { ...EMPTY_QS_ROW }]);
  const removeQsRow = (index: number) => setQsRows((rows) => rows.filter((_, i) => i !== index));
  const updateQsRow = (index: number, field: keyof OrgQuestionSetRow, value: string) => {
    setQsRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleCreateQuestionSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!qsName.trim()) {
      setQsError('Name is required');
      return;
    }
    const validRows = qsRows.filter((r) => r.questionText.trim());
    if (validRows.length === 0) {
      setQsError('At least one question is required');
      return;
    }
    setQsSubmitting(true);
    setQsError(null);
    try {
      const response = await instituteApi.createOrgQuestionSet(organizationId, {
        name: qsName.trim(),
        description: qsDescription.trim() || undefined,
        questions: validRows.map((r) => ({
          questionText: r.questionText.trim(),
          referenceAnswer: r.referenceAnswer?.trim() || undefined,
        })),
      });
      const created = response.data.questionSet;
      setQuestionSets((prev) => [
        {
          id: created.id,
          name: created.name,
          description: created.description,
          source: created.source,
          totalQuestions: created.totalQuestions,
          questionsWithAnswers: created.questionsWithAnswers,
          questionsWithoutAnswers: created.questionsWithoutAnswers,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
        ...prev,
      ]);
      setForm((f) => ({ ...f, questionSetId: created.id }));
      setShowCreateQs(false);
      setQsName('');
      setQsDescription('');
      setQsRows([{ ...EMPTY_QS_ROW }]);
    } catch (err: any) {
      setQsError(err.message || 'Failed to create question set');
    } finally {
      setQsSubmitting(false);
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

  if (activeOrganization.type !== 'institute') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">
              Interview templates are only available for institute organizations.
            </p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view interview templates.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Interview Templates</h1>
          <p className="page-subtitle">Reusable interview configurations for {activeOrganization.name}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={batchFilter}
            onChange={(e) => {
              setBatchFilter(e.target.value);
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as InstituteEntityStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {canManage && (
            <button onClick={openCreate} className="btn btn-primary ml-auto">
              <Plus size={16} />
              Add Template
            </button>
          )}
        </div>

        {formMode !== 'closed' && (
          <form onSubmit={handleSubmit} className="card mb-4 space-y-4">
            {formError && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                <p className="text-sm text-mentor-error">{formError}</p>
              </div>
            )}
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input"
                maxLength={150}
              />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input"
                rows={2}
                maxLength={1000}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Question Set</label>
                <button
                  type="button"
                  onClick={() => setShowCreateQs((v) => !v)}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  + Create Question Set
                </button>
              </div>
              <select
                value={form.questionSetId || ''}
                onChange={(e) => setForm((f) => ({ ...f, questionSetId: e.target.value }))}
                className="input"
              >
                <option value="">Select a question set</option>
                {questionSets.map((qs) => (
                  <option key={qs.id} value={qs.id}>
                    {qs.name} ({qs.totalQuestions} questions)
                  </option>
                ))}
              </select>
              {questionSets.length === 0 && (
                <p className="helper-text mt-1">No question sets yet — create one above.</p>
              )}
            </div>

            {showCreateQs && (
              <div className="surface-muted p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-mentor-text">New Question Set</h4>
                  <button type="button" onClick={() => setShowCreateQs(false)} aria-label="Close">
                    <X size={16} className="text-mentor-text-muted" />
                  </button>
                </div>
                {qsError && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
                    <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
                    <p className="text-sm text-mentor-error">{qsError}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={qsName}
                    onChange={(e) => setQsName(e.target.value)}
                    placeholder="Question set name"
                    className="input"
                    maxLength={100}
                  />
                  <input
                    type="text"
                    value={qsDescription}
                    onChange={(e) => setQsDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="input"
                    maxLength={500}
                  />
                </div>
                <div className="space-y-2">
                  {qsRows.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <textarea
                        value={row.questionText}
                        onChange={(e) => updateQsRow(index, 'questionText', e.target.value)}
                        placeholder={`Question ${index + 1}`}
                        className="input flex-1"
                        rows={1}
                      />
                      <input
                        type="text"
                        value={row.referenceAnswer || ''}
                        onChange={(e) => updateQsRow(index, 'referenceAnswer', e.target.value)}
                        placeholder="Reference answer (optional)"
                        className="input flex-1"
                      />
                      {qsRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQsRow(index)}
                          className="btn btn-secondary px-2.5 py-2.5 shrink-0"
                          aria-label="Remove question"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={addQsRow} className="btn btn-secondary">
                    <Plus size={14} />
                    Add Question
                  </button>
                  <button type="button" onClick={handleCreateQuestionSet} disabled={qsSubmitting} className="btn btn-primary">
                    {qsSubmitting ? 'Creating...' : 'Create Question Set'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Course {selectedBatch ? '(set by batch)' : '(optional)'}</label>
                <select
                  value={form.courseId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
                  disabled={!!selectedBatch}
                  className="input"
                >
                  <option value="">No course</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Batch (optional)</label>
                <select value={form.batchId || ''} onChange={(e) => handleBatchChange(e.target.value)} className="input">
                  <option value="">No batch</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Difficulty (optional)</label>
                <select
                  value={form.interviewConfig?.difficulty || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interviewConfig: { ...f.interviewConfig, difficulty: e.target.value } }))
                  }
                  className="input"
                >
                  <option value="">Default</option>
                  {DIFFICULTY_LEVELS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Style (optional)</label>
                <select
                  value={form.interviewConfig?.style || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interviewConfig: { ...f.interviewConfig, style: e.target.value } }))
                  }
                  className="input"
                >
                  <option value="">Default</option>
                  {INTERVIEW_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Language (optional)</label>
                <select
                  value={form.interviewConfig?.language || ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, interviewConfig: { ...f.interviewConfig, language: e.target.value } }))
                  }
                  className="input"
                >
                  <option value="">Default</option>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:w-1/3">
              <label className="label">Question Limit (optional, 1-50)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.interviewConfig?.questionLimit ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    interviewConfig: {
                      ...f.interviewConfig,
                      questionLimit: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  }))
                }
                className="input"
              />
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving...' : formMode === 'create' ? 'Create Template' : 'Save Changes'}
              </button>
              <button type="button" onClick={closeForm} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        )}

        {actionError && (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3 mb-4">
            <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
            <p className="text-sm text-mentor-error">{actionError}</p>
          </div>
        )}

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading templates...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load templates</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchTemplates} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-16 text-center">
              <p className="text-sm text-mentor-text-secondary">No templates match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Template
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Question Set
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Scope
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Config
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Status
                    </th>
                    {canManage && (
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {templates.map((template) => (
                    <tr key={template.id}>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{template.name}</div>
                        <div className="text-xs text-mentor-text-muted">{template.description || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {template.questionSet
                          ? `${template.questionSet.name} (${template.questionSet.questionCount})`
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {courseName(template.courseId) || batchName(template.batchId) || 'Org-wide'}
                      </td>
                      <td className="px-6 py-3 text-xs text-mentor-text-secondary">
                        {template.interviewConfig?.difficulty && (
                          <span className="capitalize">{template.interviewConfig.difficulty}</span>
                        )}
                        {template.interviewConfig?.language && ` · ${template.interviewConfig.language}`}
                        {template.interviewConfig?.questionLimit && ` · limit ${template.interviewConfig.questionLimit}`}
                        {!template.interviewConfig && '—'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`badge ${template.status === 'active' ? 'badge-success' : 'badge-neutral'} capitalize`}
                        >
                          {template.status}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(template)}
                              className="btn btn-secondary px-3 py-1.5 text-xs"
                              aria-label="Edit template"
                            >
                              <Pencil size={14} />
                            </button>
                            {template.status === 'active' && (
                              <button
                                onClick={() => handleDeactivate(template)}
                                className="btn btn-secondary px-3 py-1.5 text-xs"
                                aria-label="Deactivate template"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && total > 0 && (
            <div className="px-4 sm:px-6 py-4 border-t border-mentor-border flex items-center justify-between gap-4">
              <p className="text-xs text-mentor-text-muted">
                Page {page} of {totalPages} &middot; {total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="btn btn-secondary px-3 py-2"
                  aria-label="Next page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteTemplatesPage;
