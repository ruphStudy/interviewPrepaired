import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import Interview from '../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../constants/interview';
import EmployerHiringEvidenceMatrix from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerInterviewScenarioReport from '../models/EmployerInterviewScenarioReport.model';
import EmployerCodingAssessmentReport from '../models/EmployerCodingAssessmentReport.model';
import EmployerHiringKnowledgeGroundedEvaluation from '../models/EmployerHiringKnowledgeGroundedEvaluation.model';
import EmployerUnifiedTalentProfile from '../models/EmployerUnifiedTalentProfile.model';
import EmployerCrossAssessmentTalentIntelligence from '../models/EmployerCrossAssessmentTalentIntelligence.model';
import EmployerHiringOutcome from '../models/EmployerHiringOutcome.model';
import EmployerOutcomeQualityAnalytics from '../models/EmployerOutcomeQualityAnalytics.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const RECENT_ACTIVITY_LIMIT = 20;
const LANDSCAPE_LIMIT = 20;

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

interface RecentActivityItem {
  type: 'application' | 'talent_profile' | 'hiring_outcome' | 'scenario_assessment' | 'coding_assessment';
  candidateId?: string;
  applicationId?: string;
  label: string;
  occurredAt: Date;
}

/**
 * Read-only, deterministic (NO AI) organization-level dashboard (32E) that
 * brings together already-persisted 32A/32B/32C/32D artifacts into one
 * view. Never rebuilds those artifacts on GET, never computes a new
 * ranking/score, never an automated hiring decision.
 */
export class EmployerTalentIntelligenceDashboardService {
  /** GET .../talent-intelligence/dashboard — requires ANALYTICS_VIEW. Read-only; reads current persisted state only. */
  async getDashboard(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const orgId = organization._id;

    const [totalCandidates, activeApplications, applications, talentProfiles, crossAssessmentRecords, hiringOutcomes, persistedAnalytics] =
      await Promise.all([
        EmployerCandidate.countDocuments({ organizationId: orgId }),
        EmployerJobApplication.countDocuments({
          organizationId: orgId,
          status: {
            $in: [
              EmployerJobApplicationStatus.APPLIED,
              EmployerJobApplicationStatus.SCREENING,
              EmployerJobApplicationStatus.SHORTLISTED,
              EmployerJobApplicationStatus.INTERVIEW,
              EmployerJobApplicationStatus.OFFER,
            ],
          },
        }),
        EmployerJobApplication.find({ organizationId: orgId }).select('_id candidateId status createdAt').lean(),
        EmployerUnifiedTalentProfile.find({ organizationId: orgId }).select('candidateId competencies skills updatedAt').lean(),
        EmployerCrossAssessmentTalentIntelligence.find({ organizationId: orgId })
          .select('candidateId sourceCoverage crossAssessmentSignals')
          .lean(),
        EmployerHiringOutcome.find({ organizationId: orgId }).select('candidateId applicationId hiringOutcome updatedAt').lean(),
        EmployerOutcomeQualityAnalytics.findOne({ organizationId: orgId }).select('hiringOutcomes generatedAt').lean(),
      ]);

    const applicationIds = applications.map((a) => a._id);
    const candidateIdByApplicationId = new Map(applications.map((a) => [a._id.toString(), a.candidateId.toString()]));
    const totalApplications = applications.length;

    const [
      completedInterviews,
      scenarioReports,
      codingReports,
      knowledgeEvaluations,
      standardInterviewCandidateIds,
    ] = await Promise.all([
      Interview.countDocuments({
        organizationId: orgId,
        purpose: InterviewPurpose.HIRING_ASSESSMENT,
        status: { $in: [InterviewStatus.COMPLETED, InterviewStatus.EVALUATED] },
      }),
      applicationIds.length > 0
        ? EmployerInterviewScenarioReport.find({ organizationId: orgId, applicationId: { $in: applicationIds } })
            .select('applicationId generatedAt')
            .lean()
        : [],
      applicationIds.length > 0
        ? EmployerCodingAssessmentReport.find({ organizationId: orgId, applicationId: { $in: applicationIds } })
            .select('applicationId generatedAt')
            .lean()
        : [],
      applicationIds.length > 0
        ? EmployerHiringKnowledgeGroundedEvaluation.countDocuments({
            organizationId: orgId,
            applicationId: { $in: applicationIds },
            status: 'completed',
          })
        : 0,
      EmployerHiringEvidenceMatrix.distinct('candidateId', { organizationId: orgId }),
    ]);

    const scenarioCandidateIds = new Set<string>();
    for (const report of scenarioReports) {
      const candidateId = candidateIdByApplicationId.get(report.applicationId.toString());
      if (candidateId) scenarioCandidateIds.add(candidateId);
    }
    const codingCandidateIds = new Set<string>();
    for (const report of codingReports) {
      const candidateId = candidateIdByApplicationId.get(report.applicationId.toString());
      if (candidateId) codingCandidateIds.add(candidateId);
    }
    const knowledgeGroundedCandidateApplicationIds =
      applicationIds.length > 0
        ? await EmployerHiringKnowledgeGroundedEvaluation.distinct('applicationId', {
            organizationId: orgId,
            applicationId: { $in: applicationIds },
            status: 'completed',
          })
        : [];
    const knowledgeGroundedCandidateIds = new Set<string>();
    for (const appId of knowledgeGroundedCandidateApplicationIds) {
      const candidateId = candidateIdByApplicationId.get(appId.toString());
      if (candidateId) knowledgeGroundedCandidateIds.add(candidateId);
    }

    const multiSourceCandidates = crossAssessmentRecords.filter((r) => r.sourceCoverage.totalSourceTypes >= 2).length;
    const completedAssessments = completedInterviews + scenarioReports.length + codingReports.length + knowledgeEvaluations;

    // ---- Competency landscape (32A profiles — evidence presence only, never a rank) ----
    const competencyMap = new Map<string, { competencyName: string; candidateIds: Set<string>; strongOrSufficient: Set<string>; gap: Set<string> }>();
    const skillMap = new Map<string, { skillName: string; candidateIds: Set<string>; evidenceCount: number }>();
    for (const profile of talentProfiles) {
      const candidateId = profile.candidateId.toString();
      for (const c of profile.competencies ?? []) {
        const key = c.competencyName.trim().toLowerCase();
        const entry = competencyMap.get(key) ?? {
          competencyName: c.competencyName,
          candidateIds: new Set<string>(),
          strongOrSufficient: new Set<string>(),
          gap: new Set<string>(),
        };
        entry.candidateIds.add(candidateId);
        const positiveCount = c.states.strong + c.states.sufficient;
        const weakCount = c.states.partial + c.states.insufficient + c.states.notObserved;
        if (positiveCount > 0) entry.strongOrSufficient.add(candidateId);
        if (positiveCount === 0 || weakCount > positiveCount) entry.gap.add(candidateId);
        competencyMap.set(key, entry);
      }
      for (const s of profile.skills ?? []) {
        const key = s.skillName.trim().toLowerCase();
        const entry = skillMap.get(key) ?? { skillName: s.skillName, candidateIds: new Set<string>(), evidenceCount: 0 };
        entry.candidateIds.add(candidateId);
        entry.evidenceCount += s.evidenceCount;
        skillMap.set(key, entry);
      }
    }

    const competencyLandscape = Array.from(competencyMap.values())
      .map((c) => ({
        competencyName: c.competencyName,
        candidateEvidenceCount: c.candidateIds.size,
        strongOrSufficientCount: c.strongOrSufficient.size,
        gapCount: c.gap.size,
      }))
      .sort((a, b) => b.candidateEvidenceCount - a.candidateEvidenceCount || a.competencyName.localeCompare(b.competencyName))
      .slice(0, LANDSCAPE_LIMIT);

    const skillsLandscape = Array.from(skillMap.values())
      .map((s) => ({ skillName: s.skillName, candidateCount: s.candidateIds.size, evidenceCount: s.evidenceCount }))
      .sort((a, b) => b.candidateCount - a.candidateCount || a.skillName.localeCompare(b.skillName))
      .slice(0, LANDSCAPE_LIMIT);

    // ---- Cross-assessment pattern counts (32B) — evidence-pattern counts only ----
    let repeatedStrengthCount = 0;
    let repeatedGapCount = 0;
    let mixedEvidenceCount = 0;
    for (const record of crossAssessmentRecords) {
      repeatedStrengthCount += record.crossAssessmentSignals?.repeatedStrengths?.length ?? 0;
      repeatedGapCount += record.crossAssessmentSignals?.repeatedEvidenceGaps?.length ?? 0;
      mixedEvidenceCount += record.crossAssessmentSignals?.mixedEvidence?.length ?? 0;
    }

    // ---- Outcomes — prefer the latest persisted 32D snapshot; else derive directly from 32C, same definition ----
    const outcomes = persistedAnalytics
      ? {
          hired: persistedAnalytics.hiringOutcomes.hired,
          rejected: persistedAnalytics.hiringOutcomes.rejected,
          withdrawn: persistedAnalytics.hiringOutcomes.withdrawn,
          noDecision: persistedAnalytics.hiringOutcomes.noDecision,
        }
      : hiringOutcomes.reduce(
          (acc, o) => {
            if (o.hiringOutcome === 'hired') acc.hired += 1;
            else if (o.hiringOutcome === 'rejected') acc.rejected += 1;
            else if (o.hiringOutcome === 'withdrawn') acc.withdrawn += 1;
            else acc.noDecision += 1;
            return acc;
          },
          { hired: 0, rejected: 0, withdrawn: 0, noDecision: 0 }
        );

    const dataQuality = {
      talentProfileCoveragePercent: pct(talentProfiles.length, totalCandidates),
      crossAssessmentCoveragePercent: pct(crossAssessmentRecords.length, totalCandidates),
      hiringOutcomeCoveragePercent: pct(hiringOutcomes.length, totalApplications),
    };

    // ---- Recent activity — bounded, safe business metadata only ----
    const [recentProfiles, recentOutcomes, recentScenarioReports, recentCodingReports] = await Promise.all([
      EmployerUnifiedTalentProfile.find({ organizationId: orgId })
        .select('candidateId updatedAt')
        .sort({ updatedAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),
      EmployerHiringOutcome.find({ organizationId: orgId })
        .select('candidateId applicationId updatedAt')
        .sort({ updatedAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),
      EmployerInterviewScenarioReport.find({ organizationId: orgId })
        .select('applicationId generatedAt')
        .sort({ generatedAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),
      EmployerCodingAssessmentReport.find({ organizationId: orgId })
        .select('applicationId generatedAt')
        .sort({ generatedAt: -1 })
        .limit(RECENT_ACTIVITY_LIMIT)
        .lean(),
    ]);

    const recentApplications = [...applications]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    const activity: RecentActivityItem[] = [
      ...recentApplications.map((a) => ({
        type: 'application' as const,
        candidateId: a.candidateId.toString(),
        applicationId: a._id.toString(),
        label: 'New application received',
        occurredAt: a.createdAt,
      })),
      ...recentProfiles.map((p) => ({
        type: 'talent_profile' as const,
        candidateId: p.candidateId.toString(),
        label: 'Talent profile refreshed',
        occurredAt: p.updatedAt,
      })),
      ...recentOutcomes.map((o) => ({
        type: 'hiring_outcome' as const,
        candidateId: o.candidateId.toString(),
        applicationId: o.applicationId.toString(),
        label: 'Hiring outcome recorded',
        occurredAt: o.updatedAt,
      })),
      ...recentScenarioReports.map((r) => ({
        type: 'scenario_assessment' as const,
        candidateId: candidateIdByApplicationId.get(r.applicationId.toString()),
        applicationId: r.applicationId.toString(),
        label: 'Scenario assessment completed',
        occurredAt: r.generatedAt,
      })),
      ...recentCodingReports.map((r) => ({
        type: 'coding_assessment' as const,
        candidateId: candidateIdByApplicationId.get(r.applicationId.toString()),
        applicationId: r.applicationId.toString(),
        label: 'Coding assessment completed',
        occurredAt: r.generatedAt,
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);

    return {
      overview: {
        totalCandidates,
        activeApplications,
        completedAssessments,
        talentProfilesBuilt: talentProfiles.length,
        multiSourceCandidates,
      },
      evidenceCoverage: {
        standardInterviewCandidates: standardInterviewCandidateIds.length,
        scenarioCandidates: scenarioCandidateIds.size,
        codingCandidates: codingCandidateIds.size,
        knowledgeGroundedCandidates: knowledgeGroundedCandidateIds.size,
      },
      competencyLandscape,
      skillsLandscape,
      crossAssessment: { repeatedStrengthCount, repeatedGapCount, mixedEvidenceCount },
      outcomes,
      dataQuality,
      recentActivity: activity,
    };
  }

  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }
}

export const employerTalentIntelligenceDashboardService = new EmployerTalentIntelligenceDashboardService();
export default employerTalentIntelligenceDashboardService;
