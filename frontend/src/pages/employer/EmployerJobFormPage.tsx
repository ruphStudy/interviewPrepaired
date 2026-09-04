import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EMPLOYER_JOB_WORKPLACE_TYPES, EMPLOYER_JOB_EMPLOYMENT_TYPES } from '../../api/employerApi';
import { EMPTY_JOB_FORM, JobFormState, jobFormToPayload } from './jobFormUtils';
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react';

/**
 * Create a new job posting (16B). Always requires INTERVIEWS_MANAGE and an
 * active (non-archived) organization — creation has no read-only fallback,
 * unlike the job detail page.
 */
const EmployerJobFormPage: React.FC = () => {
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

  const [form, setForm] = useState<JobFormState>(EMPTY_JOB_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const field = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.title.trim()) {
      setSubmitError('Title is required');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await employerApi.createJob(organizationId, jobFormToPayload(form));
      navigate(`/organizations/${organizationId}/employer/jobs/${response.data.job.id}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create job');
    } finally {
      setSubmitting(false);
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

  if (activeOrganization.type !== 'company') {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Not available</h2>
            <p className="text-sm text-mentor-text-secondary">Jobs are only available for company organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!canManage) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">
              {activeOrganization.status === 'archived'
                ? 'This organization is archived — creating jobs is disabled.'
                : "You don't have permission to create jobs."}
            </p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 max-w-3xl">
        <Link
          to={`/organizations/${organizationId}/employer/jobs`}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Jobs
        </Link>

        <div className="page-header">
          <h1 className="page-title">New Job</h1>
          <p className="page-subtitle">Create a new job posting for {activeOrganization.name}.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
              <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
              <p className="text-sm text-mentor-error">{submitError}</p>
            </div>
          )}

          <div>
            <label className="label">Title</label>
            <input type="text" value={form.title} onChange={(e) => field('title', e.target.value)} className="input" maxLength={200} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Job Code (optional)</label>
              <input type="text" value={form.jobCode} onChange={(e) => field('jobCode', e.target.value)} className="input" maxLength={50} />
            </div>
            <div>
              <label className="label">Department (optional)</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => field('department', e.target.value)}
                className="input"
                maxLength={150}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Location (optional)</label>
              <input type="text" value={form.location} onChange={(e) => field('location', e.target.value)} className="input" maxLength={200} />
            </div>
            <div>
              <label className="label">Workplace Type</label>
              <select value={form.workplaceType} onChange={(e) => field('workplaceType', e.target.value as JobFormState['workplaceType'])} className="input">
                <option value="">Select</option>
                {EMPLOYER_JOB_WORKPLACE_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Employment Type</label>
              <select
                value={form.employmentType}
                onChange={(e) => field('employmentType', e.target.value as JobFormState['employmentType'])}
                className="input"
              >
                <option value="">Select</option>
                {EMPLOYER_JOB_EMPLOYMENT_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>
                    {et.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Min Experience (years)</label>
              <input
                type="number"
                min={0}
                value={form.experienceMinYears}
                onChange={(e) => field('experienceMinYears', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Max Experience (years)</label>
              <input
                type="number"
                min={0}
                value={form.experienceMaxYears}
                onChange={(e) => field('experienceMaxYears', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Openings</label>
              <input type="number" min={1} value={form.openings} onChange={(e) => field('openings', e.target.value)} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => field('description', e.target.value)}
              className="input"
              rows={4}
              maxLength={5000}
            />
          </div>

          <div>
            <label className="label">Responsibilities (one per line, or comma-separated)</label>
            <textarea
              value={form.responsibilitiesText}
              onChange={(e) => field('responsibilitiesText', e.target.value)}
              className="input"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Required Skills (one per line, or comma-separated)</label>
              <textarea
                value={form.requiredSkillsText}
                onChange={(e) => field('requiredSkillsText', e.target.value)}
                className="input"
                rows={3}
              />
            </div>
            <div>
              <label className="label">Preferred Skills (one per line, or comma-separated)</label>
              <textarea
                value={form.preferredSkillsText}
                onChange={(e) => field('preferredSkillsText', e.target.value)}
                className="input"
                rows={3}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Salary Min (optional)</label>
              <input type="number" min={0} value={form.salaryMin} onChange={(e) => field('salaryMin', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Salary Max (optional)</label>
              <input type="number" min={0} value={form.salaryMax} onChange={(e) => field('salaryMax', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Currency (optional)</label>
              <input
                type="text"
                value={form.salaryCurrency}
                onChange={(e) => field('salaryCurrency', e.target.value)}
                className="input"
                maxLength={10}
                placeholder="e.g. INR"
              />
            </div>
          </div>

          <div className="sm:w-1/3">
            <label className="label">Application Deadline (optional)</label>
            <input
              type="date"
              value={form.applicationDeadline}
              onChange={(e) => field('applicationDeadline', e.target.value)}
              className="input"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Creating...' : 'Create Job'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/organizations/${organizationId}/employer/jobs`)}
              disabled={submitting}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerJobFormPage;
