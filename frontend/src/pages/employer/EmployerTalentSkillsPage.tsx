import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AuthenticatedLayout from '../../components/AuthenticatedLayout';
import { useOrganization } from '../../contexts/OrganizationContext';
import employerApi, {
  EmployerTalentSkillMap,
  EmployerTalentSearchResults,
  EmployerTalentSearchFilters,
  EmployerSkillClassification,
  EmployerSkillEvidenceRecencyBucket,
} from '../../api/employerApi';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight, Network, Search } from 'lucide-react';

const RESULTS_PAGE_LIMIT = 20;
const formatDate = (value: string) => new Date(value).toLocaleDateString();

const CLASSIFICATION_LABEL: Record<string, string> = {
  strong_evidence: 'Strong Evidence',
  supported: 'Supported',
  limited_evidence: 'Limited Evidence',
  additional_candidate_skill: 'Additional Candidate Skill',
};
const CLASSIFICATION_BADGE: Record<string, string> = {
  strong_evidence: 'badge-success',
  supported: 'badge-success',
  limited_evidence: 'badge-warning',
  additional_candidate_skill: 'badge-neutral',
};
const RECENCY_LABEL: Record<string, string> = { recent: 'Recent', aging: 'Aging', stale: 'Stale' };
const TREND_LABEL: Record<string, string> = {
  stronger_evidence: 'Evidence Stronger',
  stable_evidence: 'Evidence Stable',
  weaker_evidence: 'Evidence Weaker',
  first_observation: 'First Observation',
};

/**
 * "Talent Skills" (25E) — employer-internal DISCOVERY of candidates by
 * existing structured skill evidence (25A-25D). A search/read layer only:
 * NOT candidate ranking, NOT a hiring recommendation. `displayPosition` on
 * a result is deterministic discovery ordering, never a fit score.
 */
const EmployerTalentSkillsPage: React.FC = () => {
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

  const [skillMap, setSkillMap] = useState<EmployerTalentSkillMap | null>(null);
  const [skillMapLoading, setSkillMapLoading] = useState(true);
  const [skillMapError, setSkillMapError] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');
  const [selectedSkillNodeIds, setSelectedSkillNodeIds] = useState<string[]>([]);
  const [classification, setClassification] = useState<EmployerSkillClassification | ''>('');
  const [recencyBucket, setRecencyBucket] = useState<EmployerSkillEvidenceRecencyBucket | ''>('');
  const [minEvidenceStrength, setMinEvidenceStrength] = useState('');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<EmployerTalentSearchResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (organizationId && organizationId !== activeOrganizationId) {
      setActiveOrganization(organizationId);
    }
  }, [organizationId, activeOrganizationId, setActiveOrganization]);

  const isSyncing = !organizationId || activeOrganizationId !== organizationId;
  const canView = hasPermission('organization:view');

  const fetchSkillMap = useCallback(async () => {
    if (!organizationId) return;
    setSkillMapLoading(true);
    setSkillMapError(null);
    try {
      const response = await employerApi.getEmployerTalentSkillMap(organizationId);
      setSkillMap(response.data);
    } catch (err: any) {
      setSkillMapError(err.message || 'Failed to load talent skill map');
    } finally {
      setSkillMapLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!isSyncing && activeOrganization?.type === 'company' && canView) {
      fetchSkillMap();
    }
  }, [isSyncing, activeOrganization, canView, fetchSkillMap]);

  const runSearch = useCallback(
    async (pageOverride?: number) => {
      if (!organizationId) return;
      setResultsLoading(true);
      setResultsError(null);
      setHasSearched(true);
      const filters: EmployerTalentSearchFilters = {
        search: searchText.trim() || undefined,
        skillNodeIds: selectedSkillNodeIds.length > 0 ? selectedSkillNodeIds : undefined,
        classification: (classification || undefined) as EmployerTalentSearchFilters['classification'],
        recencyBucket: recencyBucket || undefined,
        minEvidenceStrength: minEvidenceStrength !== '' ? Number(minEvidenceStrength) : undefined,
        page: pageOverride ?? page,
        limit: RESULTS_PAGE_LIMIT,
      };
      try {
        const response = await employerApi.searchEmployerTalentSkills(organizationId, filters);
        setResults(response.data);
      } catch (err: any) {
        setResultsError(err.message || 'Failed to search talent skills');
      } finally {
        setResultsLoading(false);
      }
    },
    [organizationId, searchText, selectedSkillNodeIds, classification, recencyBucket, minEvidenceStrength, page]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    runSearch(1);
  };

  const toggleSkillNodeId = (skillNodeId: string) => {
    setSelectedSkillNodeIds((prev) => (prev.includes(skillNodeId) ? prev.filter((id) => id !== skillNodeId) : [...prev, skillNodeId]));
  };

  useEffect(() => {
    if (hasSearched) {
      runSearch(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
            <p className="text-sm text-mentor-text-secondary">Talent Skills is only available for company organizations.</p>
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
            <p className="text-sm text-mentor-text-secondary">You don't have permission to view talent skills.</p>
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
            <Network size={20} className="text-mentor-text-muted" />
            Talent Skills
          </h1>
          <p className="text-sm text-mentor-text-secondary">
            Discover candidates by evidenced skills already captured across this organization's hiring activity. This is a
            discovery tool, not a candidate ranking or hiring recommendation.
          </p>
        </div>

        <div className="card">
          <h2 className="section-title mb-4">Organization Skill Map</h2>
          {skillMapLoading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : skillMapError ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{skillMapError}</p>
              <button onClick={fetchSkillMap} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : !skillMap || skillMap.skills.length === 0 ? (
            <p className="text-sm text-mentor-text-secondary text-center py-6">
              No evidenced skills yet — skill memory hasn't been built for any candidate in this organization.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Candidates With Skill Memory</p>
                  <p className="text-lg font-semibold text-mentor-text">{skillMap.summary.candidateCountWithSkillMemory}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Evidenced Skills</p>
                  <p className="text-lg font-semibold text-mentor-text">{skillMap.summary.uniqueSkillCount}</p>
                </div>
                <div className="surface-muted p-3">
                  <p className="text-xs text-mentor-text-muted">Total Skill Observations</p>
                  <p className="text-lg font-semibold text-mentor-text">{skillMap.summary.totalSkillObservations}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-mentor-text-muted border-b border-mentor-border">
                      <th className="py-2 pr-3">Skill</th>
                      <th className="py-2 pr-3">Candidates</th>
                      <th className="py-2 pr-3">Observations</th>
                      <th className="py-2 pr-3">Recent Evidence</th>
                      <th className="py-2 pr-3">Stale Evidence</th>
                      <th className="py-2 pr-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {skillMap.skills.map((s) => (
                      <tr key={s.skillNodeId} className="border-b border-mentor-border last:border-0">
                        <td className="py-2 pr-3 text-mentor-text">{s.canonicalName}</td>
                        <td className="py-2 pr-3 text-mentor-text-secondary">{s.candidateCount}</td>
                        <td className="py-2 pr-3 text-mentor-text-secondary">{s.observationCount}</td>
                        <td className="py-2 pr-3 text-mentor-text-secondary">{s.recentEvidenceCandidateCount}</td>
                        <td className="py-2 pr-3 text-mentor-text-secondary">{s.staleEvidenceCandidateCount}</td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => toggleSkillNodeId(s.skillNodeId)}
                            className={`btn px-2 py-1 text-xs ${selectedSkillNodeIds.includes(s.skillNodeId) ? 'btn-primary' : 'btn-secondary'}`}
                          >
                            {selectedSkillNodeIds.includes(s.skillNodeId) ? 'Selected' : 'Add to Search'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title mb-4">Talent Skill Search</h2>

          <form onSubmit={handleSearchSubmit} className="space-y-3 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Candidate or skill name"
                className="input"
              />
              <select value={classification} onChange={(e) => setClassification(e.target.value as EmployerSkillClassification | '')} className="input">
                <option value="">Any evidence classification</option>
                <option value="strong_evidence">Strong Evidence</option>
                <option value="supported">Supported</option>
                <option value="limited_evidence">Limited Evidence</option>
                <option value="additional_candidate_skill">Additional Candidate Skill</option>
              </select>
              <select
                value={recencyBucket}
                onChange={(e) => setRecencyBucket(e.target.value as EmployerSkillEvidenceRecencyBucket | '')}
                className="input"
              >
                <option value="">Any evidence recency</option>
                <option value="recent">Recent</option>
                <option value="aging">Aging</option>
                <option value="stale">Stale</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                value={minEvidenceStrength}
                onChange={(e) => setMinEvidenceStrength(e.target.value)}
                placeholder="Min evidence strength"
                className="input"
              />
            </div>

            {selectedSkillNodeIds.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs text-mentor-text-muted">
                <span>Matches all selected skills:</span>
                {selectedSkillNodeIds.map((id) => {
                  const node = skillMap?.skills.find((s) => s.skillNodeId === id);
                  return (
                    <span key={id} className="badge badge-neutral">
                      {node?.canonicalName || id}
                    </span>
                  );
                })}
                <button type="button" onClick={() => setSelectedSkillNodeIds([])} className="text-mentor-text-muted underline">
                  Clear
                </button>
              </div>
            )}

            <button type="submit" disabled={resultsLoading} className="btn btn-primary flex items-center gap-2">
              <Search size={16} />
              {resultsLoading ? 'Searching...' : 'Search'}
            </button>
          </form>

          {resultsError ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-10 h-10 text-mentor-error mx-auto mb-3" />
              <p className="text-sm text-mentor-text-secondary mb-4">{resultsError}</p>
              <button onClick={() => runSearch(page)} className="btn btn-primary">
                Try Again
              </button>
            </div>
          ) : !hasSearched ? (
            <p className="text-sm text-mentor-text-secondary text-center py-6">Use the filters above to search evidenced skills.</p>
          ) : resultsLoading ? (
            <div className="p-6 text-center">
              <Loader2 className="w-6 h-6 text-primary-600 animate-spin mx-auto" />
            </div>
          ) : !results || results.candidates.length === 0 ? (
            <p className="text-sm text-mentor-text-secondary text-center py-6">No candidates match these filters.</p>
          ) : (
            <>
              <ul className="divide-y divide-mentor-border">
                {results.candidates.map((c) => (
                  <li key={c.candidate.id} className="py-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                      <Link
                        to={`/organizations/${organizationId}/employer/candidates/${c.candidate.id}`}
                        className="text-sm font-medium text-mentor-text hover:underline"
                      >
                        {c.candidate.firstName} {c.candidate.lastName}
                      </Link>
                      <span className="text-xs text-mentor-text-muted">
                        {c.matchSummary.matchedSkillCount} matching skill{c.matchSummary.matchedSkillCount === 1 ? '' : 's'}
                        {c.matchSummary.strongestEvidenceScore !== undefined && ` · strongest evidence ${c.matchSummary.strongestEvidenceScore}/100`}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.matchingSkills.map((s) => (
                        <span
                          key={s.skillNodeId}
                          className={`badge ${CLASSIFICATION_BADGE[s.latestClassification] || 'badge-neutral'}`}
                          title={`Last observed ${formatDate(s.lastObservedAt)}`}
                        >
                          {s.canonicalName} &middot; {CLASSIFICATION_LABEL[s.latestClassification] || s.latestClassification}
                          {s.latestEvidenceStrengthScore !== undefined && ` (${s.latestEvidenceStrengthScore}/100)`}
                          {s.recencyBucket && ` · ${RECENCY_LABEL[s.recencyBucket] || s.recencyBucket}`}
                          {s.trend && ` · ${TREND_LABEL[s.trend] || s.trend}`}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>

              {results.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-mentor-border">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-secondary px-3 py-2"
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs text-mentor-text-muted">
                    Page {results.pagination.page} of {results.pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(results.pagination.totalPages, p + 1))}
                    disabled={page >= results.pagination.totalPages}
                    className="btn btn-secondary px-3 py-2"
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
};

export default EmployerTalentSkillsPage;
