import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerJob,
  EmployerJobStatus,
  EmployerJobWorkplaceType,
  EmployerJobEmploymentType,
  EMPLOYER_JOB_WORKPLACE_TYPES,
  EMPLOYER_JOB_EMPLOYMENT_TYPES,
} from '../../api/employerApi';
import { AlertCircle, Loader2, Plus, ChevronLeft, ChevronRight, Briefcase } from 'lucide-react';

const PAGE_LIMIT = 20;

const STATUS_LABELS: Record<EmployerJobStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  paused: 'Paused',
  closed: 'Closed',
  archived: 'Archived',
};

const STATUS_BADGE: Record<EmployerJobStatus, string> = {
  draft: 'badge-neutral',
  open: 'badge-success',
  paused: 'badge-warning',
  closed: 'badge-info',
  archived: 'badge-neutral',
};

const workplaceLabel = (value?: EmployerJobWorkplaceType) => EMPLOYER_JOB_WORKPLACE_TYPES.find((w) => w.value === value)?.label;
const employmentLabel = (value?: EmployerJobEmploymentType) =>
  EMPLOYER_JOB_EMPLOYMENT_TYPES.find((e) => e.value === value)?.label;
const formatDate = (value: string) => new Date(value).toLocaleDateString();

/** Company-only job list (16B). List/read requires only ORGANIZATION_VIEW; create/manage controls are gated separately by INTERVIEWS_MANAGE. */
const EmployerJobsPage: React.FC = () => {
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

  const [jobs, setJobs] = useState<EmployerJob[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployerJobStatus | ''>('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [workplaceFilter, setWorkplaceFilter] = useState<EmployerJobWorkplaceType | ''>('');
  const [employmentFilter, setEmploymentFilter] = useState<EmployerJobEmploymentType | ''>('');

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchJobs = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await employerApi.listJobs(organizationId, {
        page,
        limit: PAGE_LIMIT,
        status: statusFilter || undefined,
        department: departmentFilter || undefined,
        workplaceType: workplaceFilter || undefined,
        employmentType: employmentFilter || undefined,
        search: search || undefined,
      });
      setJobs(response.data.jobs);
      setTotal(response.data.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [organizationId, page, statusFilter, departmentFilter, workplaceFilter, employmentFilter, search]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchJobs();
    }
  }, [isSyncing, activeOrganization, canView, fetchJobs]);

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

  if (!canView) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">No access</h2>
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view jobs.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="page-title">Jobs</h1>
            <p className="page-subtitle">Job postings for {activeOrganization.name}.</p>
          </div>
          {canManage && (
            <button
              onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/new`)}
              className="btn btn-primary shrink-0"
            >
              <Plus size={16} />
              New Job
            </button>
          )}
        </div>

        {activeOrganization.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Jobs remain viewable, but creating or managing jobs is disabled.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, code, department, location..."
            className="input w-full sm:w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as EmployerJobStatus | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All statuses</option>
            {Object.keys(STATUS_LABELS).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s as EmployerJobStatus]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={departmentFilter}
            onChange={(e) => {
              setDepartmentFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Department"
            className="input w-auto"
          />
          <select
            value={workplaceFilter}
            onChange={(e) => {
              setWorkplaceFilter(e.target.value as EmployerJobWorkplaceType | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All workplace types</option>
            {EMPLOYER_JOB_WORKPLACE_TYPES.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
          <select
            value={employmentFilter}
            onChange={(e) => {
              setEmploymentFilter(e.target.value as EmployerJobEmploymentType | '');
              setPage(1);
            }}
            className="input w-auto"
          >
            <option value="">All employment types</option>
            {EMPLOYER_JOB_EMPLOYMENT_TYPES.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
              <p className="text-mentor-text-muted text-sm">Loading jobs...</p>
            </div>
          ) : error ? (
            <div className="p-16 text-center">
              <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
              <h3 className="section-title mb-1.5">Couldn't load jobs</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
              <button onClick={fetchJobs} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
                <Briefcase size={22} className="text-primary-600" />
              </div>
              <h3 className="section-title mb-1.5">No jobs yet</h3>
              <p className="text-sm text-mentor-text-secondary mb-5">
                {canManage ? 'Create your first job posting to get started.' : 'No job postings match these filters.'}
              </p>
              {canManage && (
                <button onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/new`)} className="btn btn-primary">
                  <Plus size={16} />
                  New Job
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-mentor-border">
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Location
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Openings
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-mentor-text-muted">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mentor-border">
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/${job.id}`)}
                      className="cursor-pointer hover:bg-mentor-surface transition-colors"
                    >
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-mentor-text">{job.title}</div>
                        <div className="text-xs text-mentor-text-muted">{job.jobCode || '—'}</div>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{job.department || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{job.location || '—'}</td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">
                        {[workplaceLabel(job.workplaceType), employmentLabel(job.employmentType)].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary">{job.openings ?? '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`badge ${STATUS_BADGE[job.status]}`}>{STATUS_LABELS[job.status]}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-mentor-text-secondary whitespace-nowrap">{formatDate(job.updatedAt)}</td>
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

export default EmployerJobsPage;
