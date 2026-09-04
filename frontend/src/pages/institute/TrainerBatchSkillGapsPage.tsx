import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import instituteApi, { TrainerSkillGapAnalytics, InstituteBatch } from '../../api/instituteApi';
import { AlertCircle, Loader2, ArrowLeft, BarChart3, Gauge, TrendingUp, TrendingDown } from 'lucide-react';

const getScoreColorClass = (score?: number) => {
  if (score === undefined) return 'text-mentor-text-muted';
  if (score >= 8) return 'text-mentor-success';
  if (score >= 6) return 'text-primary-600';
  if (score >= 4) return 'text-mentor-warning';
  return 'text-mentor-error';
};

/**
 * Trainer-scoped skill-gap analytics for a batch — every figure here comes
 * directly from InstituteTrainerSkillGapService, which derives it entirely
 * from already-persisted evaluation data. Nothing is recomputed client-side.
 */
const TrainerBatchSkillGapsPage: React.FC = () => {
  const { organizationId, batchId } = useParams<{ organizationId: string; batchId: string }>();
  const navigate = useNavigate();
  const {
    activeOrganizationId,
    activeOrganization,
    activeRole,
    loading: contextLoading,
    error: contextError,
    setActiveOrganization,
    hasPermission,
  } = useOrganization();

  const [batch, setBatch] = useState<InstituteBatch | null>(null);
  const [analytics, setAnalytics] = useState<TrainerSkillGapAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const isTrainer = activeRole === 'trainer';
  const canView = hasPermission('analytics:view');

  const fetchAnalytics = useCallback(async () => {
    if (!organizationId || !batchId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await instituteApi.getTrainerBatchSkillGaps(organizationId, batchId);
      setAnalytics(response.data);
      try {
        const batchResponse = await instituteApi.getBatch(organizationId, batchId);
        setBatch(batchResponse.data.batch);
      } catch {
        // Non-fatal — display name only.
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load skill gap analytics');
    } finally {
      setLoading(false);
    }
  }, [organizationId, batchId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'institute' && isTrainer && canView) {
      fetchAnalytics();
    }
  }, [isSyncing, activeOrganization, isTrainer, canView, fetchAnalytics]);

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
            <p className="text-sm text-mentor-text-secondary">The trainer portal is only available for institute organizations.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!isTrainer) {
    return (
      <AuthenticatedLayout>
        <main className="page-container py-8">
          <div className="card max-w-md mx-auto text-center">
            <AlertCircle className="w-12 h-12 text-mentor-warning mx-auto mb-4" />
            <h2 className="section-title text-lg mb-2">Trainer portal is available only to trainers</h2>
            <p className="text-sm text-mentor-text-secondary">Your role in {activeOrganization.name} does not have trainer access.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view skill gap analytics.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <button
          onClick={() => navigate(`/organizations/${organizationId}/trainer`)}
          className="inline-flex items-center gap-1.5 text-sm text-mentor-text-secondary hover:text-mentor-text mb-4"
        >
          <ArrowLeft size={16} />
          Back to Trainer Dashboard
        </button>

        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="page-title">{batch ? `${batch.name} — Skill Gaps` : 'Skill Gap Analytics'}</h1>
            <p className="page-subtitle">Derived from completed interview evaluations for this batch.</p>
          </div>
          {batchId && (
            <div className="flex items-center gap-2 shrink-0">
              <Link to={`/organizations/${organizationId}/trainer/batches/${batchId}/analytics`} className="btn btn-secondary">
                <BarChart3 size={16} />
                Analytics
              </Link>
              <Link to={`/organizations/${organizationId}/trainer/batches/${batchId}/readiness`} className="btn btn-secondary">
                <Gauge size={16} />
                Readiness
              </Link>
            </div>
          )}
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading skill gap analytics...</p>
          </div>
        ) : error || !analytics ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load skill gap analytics</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error || 'No data available.'}</p>
            <button onClick={fetchAnalytics} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.totalStudents}</div>
                <div className="stat-tile-label">Students</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.studentsAssessed}</div>
                <div className="stat-tile-label">Assessed</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.completedInterviews}</div>
                <div className="stat-tile-label">Completed Interviews</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-value">{analytics.summary.skillsObserved}</div>
                <div className="stat-tile-label">Skills Observed</div>
              </div>
            </div>

            {analytics.summary.completedInterviews === 0 ? (
              <div className="card p-16 text-center">
                <p className="text-sm text-mentor-text-secondary">
                  No completed interviews yet for this batch, so there's no skill data to show.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="card">
                  <h2 className="flex items-center gap-2 section-title mb-4">
                    <TrendingUp size={18} className="text-mentor-success" />
                    Strongest Skills
                  </h2>
                  {analytics.strongestSkills.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary py-4">No skill data yet.</p>
                  ) : (
                    <div className="divide-y divide-mentor-border">
                      {analytics.strongestSkills.map((skill) => (
                        <div key={skill.skill} className="flex items-center justify-between gap-3 py-2.5">
                          <div>
                            <p className="text-sm text-mentor-text">{skill.skill}</p>
                            <p className="text-xs text-mentor-text-muted">{skill.evidenceCount} data points</p>
                          </div>
                          <span className={`text-sm font-bold ${getScoreColorClass(skill.averageScore)}`}>
                            {skill.averageScore !== undefined ? skill.averageScore.toFixed(1) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card">
                  <h2 className="flex items-center gap-2 section-title mb-4">
                    <TrendingDown size={18} className="text-mentor-error" />
                    Skill Gaps
                  </h2>
                  {analytics.skillGaps.length === 0 ? (
                    <p className="text-sm text-mentor-text-secondary py-4">No skill data yet.</p>
                  ) : (
                    <div className="divide-y divide-mentor-border">
                      {analytics.skillGaps.map((skill) => (
                        <div key={skill.skill} className="flex items-center justify-between gap-3 py-2.5">
                          <div>
                            <p className="text-sm text-mentor-text">{skill.skill}</p>
                            <p className="text-xs text-mentor-text-muted">{skill.evidenceCount} data points</p>
                          </div>
                          <span className={`text-sm font-bold ${getScoreColorClass(skill.averageScore)}`}>
                            {skill.averageScore !== undefined ? skill.averageScore.toFixed(1) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              <h2 className="section-title px-6 pt-6 mb-2">Students Needing Attention</h2>
              {analytics.studentsNeedingAttention.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-10">No students to flag right now.</p>
              ) : (
                <div className="divide-y divide-mentor-border">
                  {analytics.studentsNeedingAttention.map((row) => (
                    <div key={row.student.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-mentor-text">
                          {row.student.firstName} {row.student.lastName || ''}
                        </p>
                        {row.weakSkills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {row.weakSkills.map((skill) => (
                              <span key={skill} className="badge badge-warning">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-sm font-bold ${getScoreColorClass(row.averageScore)}`}>
                          {row.averageScore !== undefined ? row.averageScore.toFixed(1) : 'No score yet'}
                        </span>
                        <Link
                          to={`/organizations/${organizationId}/trainer/students/${row.student.id}/reports`}
                          className="btn btn-secondary px-3 py-1.5 text-xs"
                        >
                          View Reports
                        </Link>
                      </div>
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

export default TrainerBatchSkillGapsPage;
