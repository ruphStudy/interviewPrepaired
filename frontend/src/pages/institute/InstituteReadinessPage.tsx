import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { InstituteBatch, InstituteBatchReadinessAnalytics } from '../../api/instituteApi';
import { ReadinessLevel, ReadinessComponents } from '../../api/studentPortalApi';
import { AlertCircle, Loader2, Gauge, ClipboardList } from 'lucide-react';

const READINESS_LABELS: Record<ReadinessLevel, string> = {
  needs_foundation: 'Needs Foundation',
  developing: 'Developing',
  interview_ready: 'Interview Ready',
  strong: 'Strong',
  excellent: 'Excellent',
};

const READINESS_BADGE: Record<ReadinessLevel, string> = {
  needs_foundation: 'badge-warning',
  developing: 'badge-warning',
  interview_ready: 'badge-info',
  strong: 'badge-success',
  excellent: 'badge-success',
};

const COMPONENT_LABELS: Record<keyof ReadinessComponents, string> = {
  overallPerformance: 'Overall',
  technical: 'Technical',
  communication: 'Communication',
  problemSolving: 'Problem Solving',
  confidence: 'Confidence',
};

/**
 * Institute-management placement readiness (UI-08) — for OWNER/ADMIN (or
 * anyone holding analytics:view) reviewing readiness across the institute,
 * not just their own teaching load (that's the trainer portal, UI-07). Uses
 * the institute-management readiness endpoint (any batch in the org, no
 * trainer-assignment scope gate) — never the trainer-only 15C endpoint.
 * Student rows link to the existing institute Student Detail page, never to
 * trainer-only report routes.
 */
const InstituteReadinessPage: React.FC = () => {
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

  const [batches, setBatches] = useState<InstituteBatch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState('');

  const [analytics, setAnalytics] = useState<InstituteBatchReadinessAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('analytics:view');

  const fetchBatches = useCallback(async () => {
    if (!organizationId) return;
    setBatchesLoading(true);
    setBatchesError(null);
    try {
      const response = await instituteApi.listBatches(organizationId, { limit: 100 });
      setBatches(response.data.batches);
    } catch (err: any) {
      setBatchesError(err.message || 'Failed to load batches');
    } finally {
      setBatchesLoading(false);
    }
  }, [organizationId]);

  const fetchReadiness = useCallback(async () => {
    if (!organizationId || !selectedBatchId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.getInstituteBatchReadiness(organizationId, selectedBatchId);
      setAnalytics(response.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load batch readiness');
    } finally {
      setLoading(false);
    }
  }, [organizationId, selectedBatchId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && canView) {
      fetchBatches();
    }
  }, [isSyncing, activeOrganization, canView, fetchBatches]);

  useEffect(() => {
    if (selectedBatchId) {
      fetchReadiness();
    } else {
      setAnalytics(null);
    }
  }, [selectedBatchId, fetchReadiness]);

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
            <p className="text-sm text-mentor-text-secondary">Placement readiness is only available for institute organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view placement readiness.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Placement Readiness</h1>
          <p className="page-subtitle">Select a batch to review its students' placement readiness.</p>
        </div>

        <div className="card mb-6">
          <label className="label">Batch</label>
          {batchesLoading ? (
            <div className="p-4 text-center">
              <Loader2 className="w-5 h-5 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : batchesError ? (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-future-error/10 border border-red-200 dark:border-future-error/20 rounded-lg p-3">
              <AlertCircle size={16} className="text-mentor-error mt-0.5 shrink-0" />
              <p className="text-sm text-mentor-error">{batchesError}</p>
              <button onClick={fetchBatches} className="btn btn-secondary ml-auto shrink-0">
                Try Again
              </button>
            </div>
          ) : (
            <select value={selectedBatchId} onChange={(e) => setSelectedBatchId(e.target.value)} className="input sm:w-1/2">
              <option value="">Select a batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name} {batch.status === 'inactive' ? '(inactive)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {!selectedBatchId ? (
          <div className="card p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <Gauge size={22} className="text-primary-600" />
            </div>
            <h3 className="section-title mb-1.5">Select a batch to get started</h3>
            <p className="text-sm text-mentor-text-secondary">Choose a batch above to view its placement readiness.</p>
          </div>
        ) : loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading readiness...</p>
          </div>
        ) : error || !analytics ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load readiness</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'No data available.'}</p>
            <button onClick={fetchReadiness} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.totalStudents}</div>
                <div className="stat-tile-label">Students</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.studentsAssessed}</div>
                <div className="stat-tile-label">Assessed</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">
                  {analytics.summary.averageReadinessScore !== null ? analytics.summary.averageReadinessScore.toFixed(0) : '—'}
                </div>
                <div className="stat-tile-label">Avg Readiness</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.insufficientData}</div>
                <div className="stat-tile-label">Insufficient Data</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.needsFoundation}</div>
                <div className="stat-tile-label">Needs Foundation</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.developing}</div>
                <div className="stat-tile-label">Developing</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.interviewReady}</div>
                <div className="stat-tile-label">Interview Ready</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.strong}</div>
                <div className="stat-tile-label">Strong</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.excellent}</div>
                <div className="stat-tile-label">Excellent</div>
              </div>
            </div>

            <div className="card p-0 overflow-hidden">
              <h2 className="section-title px-6 pt-6 mb-2">Student Readiness</h2>
              {analytics.students.length === 0 ? (
                <div className="p-10 text-center">
                  <ClipboardList size={20} className="text-mentor-text-muted mx-auto mb-2" />
                  <p className="text-sm text-mentor-text-secondary">No active students in this batch.</p>
                </div>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {analytics.students.map((row) => (
                    <div key={row.student.id} className="px-6 py-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <Link
                            to={`/organizations/${organizationId}/institute/students/${row.student.id}`}
                            className="text-sm font-semibold text-mentor-text hover:text-primary-600"
                          >
                            {row.student.firstName} {row.student.lastName || ''}
                          </Link>
                          <p className="text-xs text-mentor-text-muted">
                            {row.interviewsCompleted} interviews completed &middot; {row.scoredInterviews} scored
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {row.readinessLevel && (
                            <span className={`badge ${READINESS_BADGE[row.readinessLevel]}`}>
                              {READINESS_LABELS[row.readinessLevel]}
                            </span>
                          )}
                          <span className="text-lg font-bold text-primary-600">
                            {row.readinessScore !== null ? row.readinessScore.toFixed(0) : '—'}
                          </span>
                        </div>
                      </div>
                      {row.insufficientData ? (
                        <p className="text-xs text-mentor-text-muted">Not enough completed interviews yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(Object.keys(COMPONENT_LABELS) as Array<keyof ReadinessComponents>).map((key) => (
                            <span key={key} className="badge badge-neutral">
                              {COMPONENT_LABELS[key]}: {row.components[key] !== null ? row.components[key]!.toFixed(0) : '—'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default InstituteReadinessPage;
