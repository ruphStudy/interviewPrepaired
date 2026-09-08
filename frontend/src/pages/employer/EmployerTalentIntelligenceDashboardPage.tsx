import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, { EmployerTalentIntelligenceDashboard, EmployerOutcomeQualityAnalytics } from '../../api/employerApi';
import { AlertCircle, Loader2, LayoutDashboard } from 'lucide-react';

const labelize = (value?: string) => (value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');
const formatDateTime = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

/**
 * "Talent Intelligence" (32E) — the final, read-only employer-level dashboard
 * bringing together already-persisted 32A/32B/32C/32D artifacts into one
 * view, plus the org-wide "Outcome & Quality Analytics" (32D) build/refresh
 * section. ZERO AI, no new ranking engine, no automated hiring decisions,
 * no candidate-vs-candidate comparison, no protected-trait aggregation.
 */
const EmployerTalentIntelligenceDashboardPage: React.FC = () => {
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

  const [dashboard, setDashboard] = useState<EmployerTalentIntelligenceDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<EmployerOutcomeQualityAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [buildingAnalytics, setBuildingAnalytics] = useState(false);
  const [buildAnalyticsError, setBuildAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('analytics:view');
  const canManage = hasPermission('interviews:manage') && activeOrganization?.status !== 'archived';

  const fetchDashboard = useCallback(async () => {
    if (!organizationId) return;
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const response = await employerApi.getEmployerTalentIntelligenceDashboard(organizationId);
      setDashboard(response.data);
    } catch (err: any) {
      setDashboardError(err.message || 'Failed to load talent intelligence dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchDashboard();
    }
  }, [isSyncing, activeOrganization, canView, fetchDashboard]);

  const fetchAnalytics = useCallback(async () => {
    if (!organizationId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const response = await employerApi.getEmployerOutcomeQualityAnalytics(organizationId);
      setAnalytics(response.data);
    } catch (err: any) {
      setAnalyticsError(err.message || 'Failed to load outcome quality analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchAnalytics();
    }
  }, [isSyncing, activeOrganization, canView, fetchAnalytics]);

  const handleBuildAnalytics = async () => {
    if (!organizationId) return;
    setBuildingAnalytics(true);
    setBuildAnalyticsError(null);
    try {
      const response = await employerApi.buildEmployerOutcomeQualityAnalytics(organizationId);
      setAnalytics(response.data);
      fetchDashboard();
    } catch (err: any) {
      setBuildAnalyticsError(err.message || 'Failed to build outcome quality analytics');
    } finally {
      setBuildingAnalytics(false);
    }
  };

  if (contextLoading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center p-4" style={{ minHeight: 'calc(100vh - 64px)' }}>
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-3" />
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
            <p className="text-sm text-mentor-text-secondary">Talent Intelligence is only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view talent intelligence.</p>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="page-container py-8 space-y-6">
        <div>
          <h1 className="page-title flex items-center gap-2 mb-1">
            <LayoutDashboard size={20} className="text-mentor-text-muted" />
            Talent Intelligence
          </h1>
          <p className="text-sm text-mentor-text-secondary">
            A read-only, evidence-based view across candidates in this organization. Historical outcomes and evidence
            coverage only — never a candidate ranking, never a hiring recommendation, never a prediction.
          </p>
        </div>

        {/* ---- 32E: Dashboard ---- */}
        {dashboardLoading ? (
          <div className="card p-6 text-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
          </div>
        ) : dashboardError ? (
          <div className="card p-6 text-center">
            <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
            <p className="text-sm text-mentor-text-secondary mb-4">{dashboardError}</p>
            <button onClick={fetchDashboard} className="btn btn-primary">
              Try Again
            </button>
          </div>
        ) : dashboard ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="card p-4">
                <p className="text-xs text-mentor-text-muted">Candidates</p>
                <p className="text-2xl font-semibold text-mentor-text">{dashboard.overview.totalCandidates}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-mentor-text-muted">Active Applications</p>
                <p className="text-2xl font-semibold text-mentor-text">{dashboard.overview.activeApplications}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-mentor-text-muted">Completed Assessments</p>
                <p className="text-2xl font-semibold text-mentor-text">{dashboard.overview.completedAssessments}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-mentor-text-muted">Multi-Source Profiles</p>
                <p className="text-2xl font-semibold text-mentor-text">{dashboard.overview.multiSourceCandidates}</p>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Evidence Coverage</h2>
              <p className="text-xs text-mentor-text-muted mb-4">Distinct candidates with evidence from each assessment type.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Standard Interviews</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.evidenceCoverage.standardInterviewCandidates}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Scenario Assessments</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.evidenceCoverage.scenarioCandidates}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Coding Assessments</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.evidenceCoverage.codingCandidates}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Knowledge Grounding</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.evidenceCoverage.knowledgeGroundedCandidates}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Competency Landscape</h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                Evidence presence across candidates — not a ranking. Top {dashboard.competencyLandscape.length} by candidate evidence
                count.
              </p>
              {dashboard.competencyLandscape.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-4">
                  No talent profiles have been built yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                        <th className="py-2 pr-4">Competency</th>
                        <th className="py-2 pr-4">Candidates with Evidence</th>
                        <th className="py-2 pr-4">Strong/Sufficient Evidence</th>
                        <th className="py-2 pr-4">Evidence Gaps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.competencyLandscape.map((c) => (
                        <tr key={c.competencyName} className="border-b border-mentor-border last:border-0">
                          <td className="py-2 pr-4 text-mentor-text">{c.competencyName}</td>
                          <td className="py-2 pr-4">{c.candidateEvidenceCount}</td>
                          <td className="py-2 pr-4 text-mentor-success">{c.strongOrSufficientCount}</td>
                          <td className="py-2 pr-4 text-mentor-warning">{c.gapCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Skills Landscape</h2>
              <p className="text-xs text-mentor-text-muted mb-4">Top {dashboard.skillsLandscape.length} skills by candidate count.</p>
              {dashboard.skillsLandscape.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-4">No skill evidence has been captured yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                        <th className="py-2 pr-4">Skill</th>
                        <th className="py-2 pr-4">Candidates</th>
                        <th className="py-2 pr-4">Evidence Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.skillsLandscape.map((s) => (
                        <tr key={s.skillName} className="border-b border-mentor-border last:border-0">
                          <td className="py-2 pr-4 text-mentor-text">{s.skillName}</td>
                          <td className="py-2 pr-4">{s.candidateCount}</td>
                          <td className="py-2 pr-4">{s.evidenceCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-mentor-text-muted mt-3">
                Looking for candidates with a specific skill?{' '}
                <Link to={`/organizations/${organizationId}/employer/talent-skills`} className="text-primary-600 hover:underline">
                  Search Talent Skills
                </Link>
                .
              </p>
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Cross-Assessment Patterns</h2>
              <p className="text-xs text-mentor-text-muted mb-4">
                Evidence-pattern counts across candidates' own assessment sources — never a comparison between candidates.
              </p>
              {dashboard.crossAssessment.repeatedStrengthCount === 0 &&
              dashboard.crossAssessment.repeatedGapCount === 0 &&
              dashboard.crossAssessment.mixedEvidenceCount === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-4">
                  Cross-assessment intelligence becomes available after candidates have evidence from multiple assessment
                  types.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Repeated Strengths</p>
                    <p className="text-lg font-semibold text-mentor-success">{dashboard.crossAssessment.repeatedStrengthCount}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Repeated Evidence Gaps</p>
                    <p className="text-lg font-semibold text-mentor-warning">{dashboard.crossAssessment.repeatedGapCount}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Mixed Evidence</p>
                    <p className="text-lg font-semibold text-mentor-text">{dashboard.crossAssessment.mixedEvidenceCount}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Hiring Outcomes</h2>
              <p className="text-xs text-mentor-text-muted mb-4">Historical outcomes only — recorded, not predicted.</p>
              {dashboard.outcomes.hired + dashboard.outcomes.rejected + dashboard.outcomes.withdrawn + dashboard.outcomes.noDecision ===
              0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-4">No hiring outcomes have been recorded yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Hired</p>
                    <p className="text-lg font-semibold text-mentor-success">{dashboard.outcomes.hired}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Rejected</p>
                    <p className="text-lg font-semibold text-mentor-text">{dashboard.outcomes.rejected}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Withdrawn</p>
                    <p className="text-lg font-semibold text-mentor-text">{dashboard.outcomes.withdrawn}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">No Decision</p>
                    <p className="text-lg font-semibold text-mentor-text">{dashboard.outcomes.noDecision}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Data Coverage</h2>
              <p className="text-xs text-mentor-text-muted mb-4">Completeness of recorded evidence — not candidate quality.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Talent Profiles</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.dataQuality.talentProfileCoveragePercent}%</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Cross-Assessment Intelligence</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.dataQuality.crossAssessmentCoveragePercent}%</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Hiring Outcomes</p>
                  <p className="text-lg font-semibold text-mentor-text">{dashboard.dataQuality.hiringOutcomeCoveragePercent}%</p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title mb-1">Recent Activity</h2>
              <p className="text-xs text-mentor-text-muted mb-4">Chronological, safe business metadata only.</p>
              {dashboard.recentActivity.length === 0 ? (
                <p className="text-sm text-mentor-text-secondary text-center py-4">No recent activity yet.</p>
              ) : (
                <ul className="space-y-2">
                  {dashboard.recentActivity.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3 text-sm border-b border-mentor-border last:border-0 pb-2">
                      <span className="text-mentor-text">{item.label}</span>
                      <span className="text-xs text-mentor-text-muted">{formatDateTime(item.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}

        {/* ---- 32D: Outcome & Quality Analytics ---- */}
        <div className="card">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <h2 className="section-title">Outcome & Quality Analytics</h2>
            {canManage && (
              <button onClick={handleBuildAnalytics} disabled={buildingAnalytics} className="btn btn-primary px-3 py-1.5 text-xs">
                {buildingAnalytics ? 'Building...' : analytics?.built ? 'Refresh Analytics' : 'Build Analytics'}
              </button>
            )}
          </div>
          <p className="text-xs text-mentor-text-muted mb-4">
            Organization-wide, historical hiring-outcome and evidence-coverage analytics. Descriptive data quality only —
            never a prediction, never a candidate ranking.
          </p>
          {buildAnalyticsError && <p className="text-sm text-mentor-error mb-2">{buildAnalyticsError}</p>}

          {analyticsLoading ? (
            <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />
          ) : analyticsError ? (
            <div>
              <p className="text-sm text-mentor-error mb-2">{analyticsError}</p>
              <button onClick={fetchAnalytics} className="btn btn-secondary">
                Try Again
              </button>
            </div>
          ) : !analytics?.built ? (
            <p className="text-sm text-mentor-text-secondary text-center py-4">
              Outcome & quality analytics have not been built yet.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Hiring Outcomes Recorded</p>
                  <p className="text-lg font-semibold text-mentor-text">{analytics.hiringOutcomes?.totalRecorded}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Outcome Coverage</p>
                  <p className="text-lg font-semibold text-mentor-text">{analytics.dataQuality?.outcomeCoveragePercent}%</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Assessment Evidence Coverage</p>
                  <p className="text-lg font-semibold text-mentor-text">{analytics.dataQuality?.assessmentEvidenceCoveragePercent}%</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Multi-Source Talent Profiles</p>
                  <p className="text-lg font-semibold text-mentor-text">{analytics.evidenceQuality?.multiSourceCandidates}</p>
                </div>
              </div>

              <div>
                <p className="label mb-2">Hiring Outcomes</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Hired</p>
                    <p className="text-lg font-semibold text-mentor-success">{analytics.hiringOutcomes?.hired}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Rejected</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.hiringOutcomes?.rejected}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Withdrawn</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.hiringOutcomes?.withdrawn}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">No Decision</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.hiringOutcomes?.noDecision}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">Employment Outcomes</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Joined</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.employmentOutcomes?.joined}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Did Not Join</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.employmentOutcomes?.didNotJoin}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Employed</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.employmentOutcomes?.employed}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Left</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.employmentOutcomes?.left}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Unknown</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.employmentOutcomes?.unknown}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">Retention</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Retained</p>
                    <p className="text-lg font-semibold text-mentor-success">{analytics.retention?.retained}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Exited</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.retention?.exited}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Unknown</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.retention?.unknown}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">Post-Hire Performance</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Below Expectations</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.performance?.belowExpectations}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Meets Expectations</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.performance?.meetsExpectations}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Exceeds Expectations</p>
                    <p className="text-lg font-semibold text-mentor-success">{analytics.performance?.exceedsExpectations}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Not Recorded</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.performance?.notRecorded}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">Assessment Coverage</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Standard Interview</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.assessmentCoverage?.applicationsWithInterviewReport}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Scenario</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.assessmentCoverage?.applicationsWithScenarioReport}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Coding</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.assessmentCoverage?.applicationsWithCodingReport}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Knowledge Grounding</p>
                    <p className="text-lg font-semibold text-mentor-text">
                      {analytics.assessmentCoverage?.applicationsWithKnowledgeEvaluation}
                    </p>
                  </div>
                </div>
              </div>

              {(analytics.outcomeEvidenceMatrix?.length ?? 0) > 0 && (
                <div>
                  <p className="label mb-2">Outcome / Evidence Coverage</p>
                  <p className="text-xs text-mentor-text-muted mb-2">
                    Descriptive coverage only — this does not indicate that any assessment type caused an outcome.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                          <th className="py-2 pr-4">Hiring Outcome</th>
                          <th className="py-2 pr-4">Applications</th>
                          <th className="py-2 pr-4">Standard Interview</th>
                          <th className="py-2 pr-4">Scenario</th>
                          <th className="py-2 pr-4">Coding</th>
                          <th className="py-2 pr-4">Knowledge Grounding</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.outcomeEvidenceMatrix!.map((row) => (
                          <tr key={row.hiringOutcome} className="border-b border-mentor-border last:border-0">
                            <td className="py-2 pr-4 text-mentor-text">{labelize(row.hiringOutcome)}</td>
                            <td className="py-2 pr-4">{row.applicationCount}</td>
                            <td className="py-2 pr-4">{row.withStandardInterview}</td>
                            <td className="py-2 pr-4">{row.withScenario}</td>
                            <td className="py-2 pr-4">{row.withCoding}</td>
                            <td className="py-2 pr-4">{row.withKnowledgeGrounding}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div>
                <p className="label mb-2">Review Windows</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">30 Day</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.reviewWindows?.thirtyDay}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">90 Day</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.reviewWindows?.ninetyDay}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">6 Month</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.reviewWindows?.sixMonth}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">12 Month</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.reviewWindows?.twelveMonth}</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Not Available</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.reviewWindows?.notAvailable}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">Data Quality</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Outcome Coverage</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.dataQuality?.outcomeCoveragePercent}%</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Employment Follow-Up Coverage</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.dataQuality?.employmentOutcomeCoveragePercent}%</p>
                  </div>
                  <div className="surface-muted p-3">
                    <p className="text-xs text-mentor-text-muted">Assessment Evidence Coverage</p>
                    <p className="text-lg font-semibold text-mentor-text">{analytics.dataQuality?.assessmentEvidenceCoveragePercent}%</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-mentor-text-muted">Generated: {formatDateTime(analytics.generatedAt)}</p>
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerTalentIntelligenceDashboardPage;
