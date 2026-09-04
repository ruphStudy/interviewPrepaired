import React, { useCallback, useEffect, useState } from 'react';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import studentPortalApi, { StudentReadinessRow, ReadinessLevel, ReadinessComponents } from '../../api/studentPortalApi';
import { AlertCircle, Loader2, GraduationCap, Gauge } from 'lucide-react';

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
  overallPerformance: 'Overall Performance',
  technical: 'Technical',
  communication: 'Communication',
  problemSolving: 'Problem Solving',
  confidence: 'Confidence',
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString() : '—');

/**
 * Placement readiness, one card per linked institute. Every figure here is
 * exactly what PlacementReadinessService computed server-side — this page
 * never recomputes or reinterprets the score, it only renders it.
 */
const StudentReadinessPage: React.FC = () => {
  const [readiness, setReadiness] = useState<StudentReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await studentPortalApi.getReadiness();
      setReadiness(response.data.readiness);
    } catch (err: any) {
      setError(err.message || 'Failed to load placement readiness');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8">
        <div className="page-header">
          <h1 className="page-title">Placement Readiness</h1>
          <p className="page-subtitle">Your readiness, as assessed by your institute's interview program.</p>
        </div>

        {loading ? (
          <div className="card p-16 text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
            <p className="text-mentor-text-muted text-sm">Loading readiness...</p>
          </div>
        ) : error ? (
          <div className="card p-16 text-center">
            <AlertCircle className="w-12 h-12 text-mentor-error mx-auto mb-4" />
            <h3 className="section-title mb-1.5">Couldn't load readiness</h3>
            <p className="text-sm text-mentor-text-secondary mb-5">{error}</p>
            <button onClick={fetchReadiness} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : readiness.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="w-12 h-12 rounded-full bg-mentor-aqua flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={22} className="text-primary-600" />
            </div>
            <h3 className="section-title mb-1.5">No readiness data yet</h3>
            <p className="text-sm text-mentor-text-secondary">
              You're not linked to any institute yet, so there's no readiness assessment to show.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {readiness.map((row) => (
              <div key={row.organization.id} className="card">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-mentor-aqua flex items-center justify-center shrink-0">
                      <Gauge size={18} className="text-primary-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-mentor-text dark:text-future-text truncate">
                        {row.organization.name}
                      </h2>
                      <p className="text-xs text-mentor-text-muted truncate">
                        {row.student.firstName} {row.student.lastName || ''}
                        {row.student.enrollmentNumber ? ` · ${row.student.enrollmentNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  {row.readinessLevel && (
                    <span className={`badge ${READINESS_BADGE[row.readinessLevel]} shrink-0`}>
                      {READINESS_LABELS[row.readinessLevel]}
                    </span>
                  )}
                </div>

                {row.insufficientData ? (
                  <div className="surface-muted p-4 mb-5">
                    <p className="text-sm text-mentor-text-secondary">
                      Not enough completed interviews yet to calculate a reliable readiness score. Complete more
                      assigned interviews to see your readiness here.
                    </p>
                  </div>
                ) : (
                  row.readinessScore !== null && (
                    <div className="flex items-center gap-4 mb-5">
                      <div className="text-4xl font-bold text-primary-600">{row.readinessScore.toFixed(0)}</div>
                      <div className="text-xs text-mentor-text-muted">out of 100</div>
                    </div>
                  )
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
                  {(Object.keys(COMPONENT_LABELS) as Array<keyof ReadinessComponents>).map((key) => (
                    <div key={key} className="stat-tile">
                      <div className="stat-tile-value">
                        {row.components[key] !== null ? row.components[key]!.toFixed(0) : '—'}
                      </div>
                      <div className="stat-tile-label">{COMPONENT_LABELS[key]}</div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-mentor-text-muted">
                  <span>{row.interviewsCompleted} interviews completed</span>
                  <span>{row.scoredInterviews} scored</span>
                  <span>{row.evidence.totalSkillEvidence} skill data points</span>
                  <span>Last interview {formatDate(row.evidence.lastInterviewAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
};

export default StudentReadinessPage;
