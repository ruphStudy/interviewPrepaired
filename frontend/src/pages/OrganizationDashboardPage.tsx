import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AuthenticatedLayout from '../components/AuthenticatedLayout';
import { useOrganization } from '../contexts/OrganizationContext';
import organizationApi, { OrganizationDashboard } from '../api/organizationApi';
import {
  Building2,
  GraduationCap,
  AlertCircle,
  Loader2,
  MessagesSquare,
  Hourglass,
  CheckCircle2,
  FileStack,
  Users,
  Cpu,
  ClipboardCheck,
  FileText,
  Briefcase,
  PenLine,
  PauseCircle,
  XCircle,
  Archive,
} from 'lucide-react';

const JOB_STATUS_BADGE: Record<string, string> = {
  draft: 'badge-neutral',
  open: 'badge-success',
  paused: 'badge-warning',
  closed: 'badge-info',
  archived: 'badge-neutral',
};

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'active':
      return 'badge-success';
    case 'suspended':
      return 'badge-warning';
    case 'archived':
      return 'badge-neutral';
    default:
      return 'badge-neutral';
  }
};

const getInterviewStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'evaluated':
      return 'badge-success';
    case 'completed':
      return 'badge-info';
    case 'in-progress':
      return 'badge-warning';
    default:
      return 'badge-neutral';
  }
};

/** Adaptive precision, matching ReportDashboard's formatCostUsd — small AI costs need more than 2dp to not show as $0.00. */
function formatCostUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString();

const OrganizationDashboardPage: React.FC = () => {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [dashboard, setDashboard] = useState<OrganizationDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;

  const fetchDashboard = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await organizationApi.getDashboard(organizationId);
      setDashboard(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization dashboard');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing) fetchDashboard();
  }, [isSyncing, fetchDashboard]);

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

  if (contextError) {
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

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-9 h-9 text-primary-600 animate-spin mx-auto mb-4" />
            <p className="text-mentor-text-secondary text-sm font-medium">Loading dashboard...</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (error || !dashboard) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="card max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Couldn't load dashboard</h2>
            <p className="text-sm text-mentor-text-secondary mb-6">{error || 'Something went wrong'}</p>
            <button onClick={fetchDashboard} className="btn btn-primary">
              Try Again
            </button>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  const { organization, access, interviews, questionSets, jobs, memberSummary, usageSummary, recentActivity } = dashboard;
  const TypeIcon = organization.type === 'institute' ? GraduationCap : Building2;

  const summaryCards = [
    { label: 'Total Interviews', value: interviews.total, icon: MessagesSquare, iconBg: 'bg-mentor-aqua' },
    { label: 'In Progress', value: interviews.inProgress, icon: Hourglass, iconBg: 'bg-amber-50' },
    { label: 'Completed', value: interviews.completed, icon: CheckCircle2, iconBg: 'bg-mentor-mint' },
    { label: 'Question Sets', value: questionSets.total, icon: FileStack, iconBg: 'bg-mentor-soft' },
  ];

  // Company-only — `jobs` is undefined for an institute organization, so
  // this row simply never renders there; nothing else about the page changes.
  const jobSummaryCards = jobs
    ? [
        { label: 'Total Jobs', value: jobs.total, icon: Briefcase, iconBg: 'bg-mentor-aqua' },
        { label: 'Draft', value: jobs.draft, icon: PenLine, iconBg: 'bg-mentor-soft' },
        { label: 'Open', value: jobs.open, icon: CheckCircle2, iconBg: 'bg-mentor-mint' },
        { label: 'Paused', value: jobs.paused, icon: PauseCircle, iconBg: 'bg-amber-50' },
        { label: 'Closed', value: jobs.closed, icon: XCircle, iconBg: 'bg-mentor-soft' },
        { label: 'Archived', value: jobs.archived, icon: Archive, iconBg: 'bg-mentor-soft' },
      ]
    : null;

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        {/* Organization header */}
        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-mentor-soft dark:bg-future-elevated flex items-center justify-center shrink-0">
              <TypeIcon size={26} className="text-primary-600 dark:text-future-violet" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="page-title text-2xl truncate">{organization.name}</h1>
              <p className="page-subtitle mt-0.5">
                <span className="capitalize">{organization.type}</span>
                {organization.description ? ` · ${organization.description}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`badge ${getStatusBadgeClass(organization.status)} capitalize`}>{organization.status}</span>
              <span className="badge badge-info capitalize">{access.role}</span>
            </div>
          </div>
        </div>

        {organization.status === 'archived' && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-future-warning/10 border border-amber-200 dark:border-future-warning/20 rounded-lg p-4 mb-6">
            <AlertCircle size={18} className="text-mentor-warning mt-0.5 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-future-warning">
              This organization is archived. Data below is read-only.
            </p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {summaryCards.map(({ label, value, icon: Icon, iconBg }) => (
            <div key={label} className="card-flat flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-mentor-text-muted mb-1">{label}</p>
                <p className="text-2xl font-bold text-mentor-text">{value}</p>
              </div>
              <div className={`w-11 h-11 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon size={20} className="text-primary-600" />
              </div>
            </div>
          ))}
        </div>

        {/* Job summary — company organizations only */}
        {jobSummaryCards && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title flex items-center gap-2 mb-0">
                <Briefcase size={18} className="text-mentor-text-muted" />
                Jobs
              </h2>
              {hasPermission('organization:view') && (
                <button
                  onClick={() => navigate(`/organizations/${organizationId}/employer/jobs`)}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  View All
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {jobSummaryCards.map(({ label, value, icon: Icon, iconBg }) => (
                <div key={label} className="card-flat flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-mentor-text-muted mb-1">{label}</p>
                    <p className="text-2xl font-bold text-mentor-text">{value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={18} className="text-primary-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Member summary — only rendered when the backend actually returned it */}
          {memberSummary && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-title flex items-center gap-2">
                  <Users size={18} className="text-mentor-text-muted" />
                  Members
                </h2>
                {hasPermission('members:view') && (
                  <button
                    onClick={() => navigate(`/organizations/${organizationId}/members`)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    View All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <p className="text-xs text-mentor-text-muted mb-1">Total</p>
                  <p className="text-lg font-semibold text-mentor-text">{memberSummary.total}</p>
                </div>
                <div>
                  <p className="text-xs text-mentor-text-muted mb-1">Active</p>
                  <p className="text-lg font-semibold text-mentor-text">{memberSummary.active}</p>
                </div>
                <div>
                  <p className="text-xs text-mentor-text-muted mb-1">Inactive</p>
                  <p className="text-lg font-semibold text-mentor-text">{memberSummary.inactive}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(memberSummary.byRole).map(([role, count]) => (
                  <span key={role} className="badge badge-neutral capitalize">
                    {role}: {count}
                  </span>
                ))}
              </div>
              {memberSummary.pendingInvitations !== null && (
                <p className="text-xs text-mentor-text-muted pt-3 border-t border-mentor-border">
                  {memberSummary.pendingInvitations} pending invitation{memberSummary.pendingInvitations === 1 ? '' : 's'}
                </p>
              )}
            </div>
          )}

          {/* AI usage/cost — only rendered when the backend actually returned it */}
          {usageSummary && (
            <div className="card">
              <h2 className="section-title flex items-center gap-2 mb-4">
                <Cpu size={18} className="text-mentor-text-muted" />
                AI Usage
              </h2>
              <p className="helper-text mb-4">Based on actual API usage recorded across this organization's interviews.</p>
              {!usageSummary.ai.pricingComplete && (
                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertCircle size={16} className="text-mentor-warning mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    Partial cost — pricing unavailable for one or more model calls. The total below excludes those calls.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="stat-tile">
                  <p className="stat-tile-value">{usageSummary.interviews.tracked}</p>
                  <p className="stat-tile-label">Tracked Interviews</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-tile-value">{usageSummary.interviews.untracked}</p>
                  <p className="stat-tile-label">Untracked Interviews</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-tile-value">{usageSummary.ai.callCount}</p>
                  <p className="stat-tile-label">AI Calls</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-tile-value">{usageSummary.ai.totalTokens.toLocaleString()}</p>
                  <p className="stat-tile-label">Total Tokens</p>
                </div>
                <div className="stat-tile">
                  <p className="stat-tile-value">{formatCostUsd(usageSummary.ai.totalCostUsd)}</p>
                  <p className="stat-tile-label">Total Cost (USD)</p>
                </div>
                <div className="stat-tile">
                  <p className={`stat-tile-value ${usageSummary.ai.pricingComplete ? 'text-mentor-success' : 'text-mentor-warning'}`}>
                    {usageSummary.ai.pricingComplete ? 'Complete' : 'Partial'}
                  </p>
                  <p className="stat-tile-label">Pricing Status</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-mentor-border">
              <h2 className="section-title">Recent Interviews</h2>
            </div>
            {recentActivity.recentInterviews.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-mentor-text-secondary">No interviews yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-mentor-border">
                {recentActivity.recentInterviews.map((interview) => (
                  <div key={interview.id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                      <ClipboardCheck size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-mentor-text truncate">{interview.topic}</p>
                      <p className="text-xs text-mentor-text-muted">{formatDate(interview.createdAt)}</p>
                    </div>
                    <span className={`badge ${getInterviewStatusBadgeClass(interview.status)} shrink-0`}>
                      {interview.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-mentor-border">
              <h2 className="section-title">Recent Question Sets</h2>
            </div>
            {recentActivity.recentQuestionSets.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-mentor-text-secondary">No question sets yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-mentor-border">
                {recentActivity.recentQuestionSets.map((questionSet) => (
                  <div key={questionSet.id} className="flex items-center gap-3 px-6 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-mentor-soft flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-mentor-text truncate">{questionSet.name}</p>
                      <p className="text-xs text-mentor-text-muted">{formatDate(questionSet.createdAt)}</p>
                    </div>
                    <span className="badge badge-neutral capitalize shrink-0">{questionSet.source}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Jobs — company organizations only */}
        {recentActivity.recentJobs !== undefined && (
          <div className="card p-0 overflow-hidden mt-4">
            <div className="px-6 py-4 border-b border-mentor-border">
              <h2 className="section-title">Recent Jobs</h2>
            </div>
            {recentActivity.recentJobs.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-mentor-text-secondary">No jobs yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-mentor-border">
                {recentActivity.recentJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/organizations/${organizationId}/employer/jobs/${job.id}`)}
                    className="flex w-full items-center gap-3 px-6 py-3.5 text-left hover:bg-mentor-surface transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                      <Briefcase size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-mentor-text truncate">{job.title}</p>
                      <p className="text-xs text-mentor-text-muted">
                        {job.department ? `${job.department} · ` : ''}
                        {formatDate(job.updatedAt)}
                      </p>
                    </div>
                    <span className={`badge ${JOB_STATUS_BADGE[job.status] || 'badge-neutral'} capitalize shrink-0`}>
                      {job.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default OrganizationDashboardPage;
