import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EMPLOYER_CANDIDATE_SOURCES } from '../../api/employerApi';
import { EMPTY_CANDIDATE_FORM, CandidateFormState, candidateFormToPayload } from './candidateFormUtils';
import { AlertCircle, Loader2, ChevronLeft } from 'lucide-react';

/**
 * Create a new candidate (18A). Always requires INTERVIEWS_MANAGE and an
 * active (non-archived) organization — creation has no read-only fallback,
 * unlike the candidate detail page. No resume upload/parsing here (18B/18C).
 */
const EmployerCandidateFormPage: React.FC = () => {
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

  const [form, setForm] = useState<CandidateFormState>(EMPTY_CANDIDATE_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const field = <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setSubmitError('First name and last name are required');
      return;
    }
    if (!form.email.trim()) {
      setSubmitError('Email is required');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await employerApi.createCandidate(organizationId, candidateFormToPayload(form));
      navigate(`/organizations/${organizationId}/employer/candidates/${response.data.candidate.id}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create candidate');
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
            <p className="text-sm text-mentor-text-secondary">Candidates are only available for company organizations.</p>
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
                ? 'This organization is archived — creating candidates is disabled.'
                : "You don't have permission to create candidates."}
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
          to={`/organizations/${organizationId}/employer/candidates`}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ChevronLeft size={16} />
          Back to Candidates
        </Link>

        <div className="page-header">
          <h1 className="page-title">New Candidate</h1>
          <p className="page-subtitle">Add a new candidate profile for {activeOrganization.name}.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
              <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
              <p className="text-sm text-mentor-error">{submitError}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">First Name</label>
              <input type="text" value={form.firstName} onChange={(e) => field('firstName', e.target.value)} className="input" maxLength={100} />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input type="text" value={form.lastName} onChange={(e) => field('lastName', e.target.value)} className="input" maxLength={100} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)} className="input" maxLength={254} />
            </div>
            <div>
              <label className="label">Phone (optional)</label>
              <input type="text" value={form.phone} onChange={(e) => field('phone', e.target.value)} className="input" maxLength={30} />
            </div>
          </div>

          <div>
            <label className="label">Headline (optional)</label>
            <input type="text" value={form.headline} onChange={(e) => field('headline', e.target.value)} className="input" maxLength={200} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Current Company (optional)</label>
              <input
                type="text"
                value={form.currentCompany}
                onChange={(e) => field('currentCompany', e.target.value)}
                className="input"
                maxLength={150}
              />
            </div>
            <div>
              <label className="label">Current Title (optional)</label>
              <input
                type="text"
                value={form.currentTitle}
                onChange={(e) => field('currentTitle', e.target.value)}
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
              <label className="label">Total Experience (years)</label>
              <input
                type="number"
                min={0}
                value={form.totalExperienceYears}
                onChange={(e) => field('totalExperienceYears', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Source</label>
              <select value={form.source} onChange={(e) => field('source', e.target.value as CandidateFormState['source'])} className="input">
                <option value="">Select</option>
                {EMPLOYER_CANDIDATE_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">LinkedIn URL (optional)</label>
              <input type="url" value={form.linkedinUrl} onChange={(e) => field('linkedinUrl', e.target.value)} className="input" maxLength={300} />
            </div>
            <div>
              <label className="label">Portfolio URL (optional)</label>
              <input type="url" value={form.portfolioUrl} onChange={(e) => field('portfolioUrl', e.target.value)} className="input" maxLength={300} />
            </div>
            <div>
              <label className="label">GitHub URL (optional)</label>
              <input type="url" value={form.githubUrl} onChange={(e) => field('githubUrl', e.target.value)} className="input" maxLength={300} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label">Notice Period (days)</label>
              <input
                type="number"
                min={0}
                value={form.noticePeriodDays}
                onChange={(e) => field('noticePeriodDays', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Current Salary</label>
              <input type="number" min={0} value={form.currentSalary} onChange={(e) => field('currentSalary', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Expected Salary</label>
              <input
                type="number"
                min={0}
                value={form.expectedSalary}
                onChange={(e) => field('expectedSalary', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Currency</label>
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

          <div>
            <label className="label">Tags (comma or newline separated, optional)</label>
            <textarea value={form.tagsText} onChange={(e) => field('tagsText', e.target.value)} className="input" rows={2} />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={form.notes} onChange={(e) => field('notes', e.target.value)} className="input" rows={4} maxLength={2000} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Creating...' : 'Create Candidate'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/organizations/${organizationId}/employer/candidates`)}
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

export default EmployerCandidateFormPage;
