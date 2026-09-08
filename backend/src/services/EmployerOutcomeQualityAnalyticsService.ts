import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerHiringOutcome, { IEmployerHiringOutcome } from '../models/EmployerHiringOutcome.model';
import EmployerHiringEvidenceMatrix from '../models/EmployerHiringEvidenceMatrix.model';
import EmployerInterviewScenarioReport from '../models/EmployerInterviewScenarioReport.model';
import EmployerCodingAssessmentReport from '../models/EmployerCodingAssessmentReport.model';
import EmployerHiringKnowledgeGroundedEvaluation from '../models/EmployerHiringKnowledgeGroundedEvaluation.model';
import EmployerUnifiedTalentProfile from '../models/EmployerUnifiedTalentProfile.model';
import EmployerCrossAssessmentTalentIntelligence from '../models/EmployerCrossAssessmentTalentIntelligence.model';
import EmployerOutcomeQualityAnalytics, { IEmployerOutcomeQualityAnalytics } from '../models/EmployerOutcomeQualityAnalytics.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const ANALYTICS_VERSION = 'outcome-quality-analytics-v1';

export interface OutcomeQualityAnalyticsFilters {
  jobId?: string;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * Deterministic (NO AI) organization-level, POST-HOC analytics over 32C
 * hiring outcomes and 32A/32B assessment evidence coverage (32D).
 * Historical/aggregate data-quality reporting only — never a candidate
 * ranking, never a hiring prediction, never a claim that any assessment
 * type causes an outcome.
 */
export class EmployerOutcomeQualityAnalyticsService {
  /** POST .../outcome-quality-analytics/build — requires INTERVIEWS_MANAGE. Always builds the org-wide snapshot (jobId is a read-time filter only). Deterministic upsert-in-place. */
  async buildAnalytics(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const computed = await this.computeAnalytics(organization._id);

    const doc = await EmployerOutcomeQualityAnalytics.findOneAndUpdate(
      { organizationId: organization._id },
      { $set: { analyticsVersion: ANALYTICS_VERSION, generatedAt: new Date(), ...computed } },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /**
   * GET .../outcome-quality-analytics — requires ANALYTICS_VIEW. Read-only.
   * With no `jobId`, returns the last-persisted org-wide snapshot (or
   * `{built:false}` if never built). With `jobId`, computes a job-scoped
   * view dynamically — never persisted, never overloading the single
   * org-wide unique row.
   */
  async getAnalytics(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    filters?: OutcomeQualityAnalyticsFilters
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    if (filters?.jobId) {
      const job = await EmployerJobApplication.exists({ organizationId: organization._id, jobId: filters.jobId });
      if (!job) {
        return { built: true, analyticsVersion: ANALYTICS_VERSION, generatedAt: new Date(), jobId: filters.jobId, ...this.emptyAnalytics() };
      }
      const computed = await this.computeAnalytics(organization._id, filters.jobId);
      return { built: true, analyticsVersion: ANALYTICS_VERSION, generatedAt: new Date(), jobId: filters.jobId, ...computed };
    }

    const doc = await EmployerOutcomeQualityAnalytics.findOne({ organizationId: organization._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  private emptyAnalytics() {
    return {
      hiringOutcomes: { totalRecorded: 0, hired: 0, rejected: 0, withdrawn: 0, noDecision: 0 },
      employmentOutcomes: { joined: 0, didNotJoin: 0, employed: 0, left: 0, unknown: 0 },
      retention: { retained: 0, exited: 0, unknown: 0 },
      performance: { belowExpectations: 0, meetsExpectations: 0, exceedsExpectations: 0, notRecorded: 0 },
      assessmentCoverage: {
        applicationsWithInterviewReport: 0,
        applicationsWithScenarioReport: 0,
        applicationsWithCodingReport: 0,
        applicationsWithKnowledgeEvaluation: 0,
        applicationsWithAnyAssessmentEvidence: 0,
      },
      outcomeEvidenceMatrix: [],
      evidenceQuality: {
        totalCandidates: 0,
        candidatesWithUnifiedProfile: 0,
        candidatesWithCrossAssessmentIntelligence: 0,
        multiSourceCandidates: 0,
        singleSourceCandidates: 0,
        noAssessmentEvidenceCandidates: 0,
      },
      reviewWindows: { thirtyDay: 0, ninetyDay: 0, sixMonth: 0, twelveMonth: 0, notAvailable: 0 },
      dataQuality: { outcomeCoveragePercent: 0, employmentOutcomeCoveragePercent: 0, assessmentEvidenceCoveragePercent: 0 },
    };
  }

  /** Deterministic (NO AI) aggregate computation — a handful of bulk, org-scoped queries; never per-candidate N+1. */
  private async computeAnalytics(organizationId: Types.ObjectId, jobId?: string) {
    const applicationFilter: Record<string, unknown> = { organizationId };
    if (jobId) applicationFilter.jobId = new Types.ObjectId(jobId);

    const applications = await EmployerJobApplication.find(applicationFilter).select('_id candidateId status').lean();
    const applicationIds = applications.map((a) => a._id);
    const candidateIds = [...new Set(applications.map((a) => a.candidateId.toString()))].map((id) => new Types.ObjectId(id));
    const totalApplications = applications.length;

    const outcomes: IEmployerHiringOutcome[] =
      applicationIds.length > 0 ? await EmployerHiringOutcome.find({ organizationId, applicationId: { $in: applicationIds } }) : [];

    // ---- Evidence presence per application (bulk, no N+1) ----
    const [matrices, scenarioReports, codingReports, knowledgeEvaluations] = await Promise.all([
      applicationIds.length > 0
        ? EmployerHiringEvidenceMatrix.find({ organizationId, applicationId: { $in: applicationIds } }).select('applicationId').lean()
        : [],
      applicationIds.length > 0
        ? EmployerInterviewScenarioReport.find({ organizationId, applicationId: { $in: applicationIds } }).select('applicationId').lean()
        : [],
      applicationIds.length > 0
        ? EmployerCodingAssessmentReport.find({ organizationId, applicationId: { $in: applicationIds } }).select('applicationId').lean()
        : [],
      applicationIds.length > 0
        ? EmployerHiringKnowledgeGroundedEvaluation.find({ organizationId, applicationId: { $in: applicationIds }, status: 'completed' })
            .select('applicationId')
            .lean()
        : [],
    ]);
    const interviewAppIds = new Set(matrices.map((m) => m.applicationId.toString()));
    const scenarioAppIds = new Set(scenarioReports.map((r) => r.applicationId.toString()));
    const codingAppIds = new Set(codingReports.map((r) => r.applicationId.toString()));
    const knowledgeAppIds = new Set(knowledgeEvaluations.map((e) => e.applicationId.toString()));

    const evidenceByApplication = new Map<
      string,
      { hasInterview: boolean; hasScenario: boolean; hasCoding: boolean; hasKnowledge: boolean; hasAny: boolean }
    >();
    let applicationsWithInterviewReport = 0;
    let applicationsWithScenarioReport = 0;
    let applicationsWithCodingReport = 0;
    let applicationsWithKnowledgeEvaluation = 0;
    let applicationsWithAnyAssessmentEvidence = 0;
    for (const application of applications) {
      const id = application._id.toString();
      const hasInterview = interviewAppIds.has(id);
      const hasScenario = scenarioAppIds.has(id);
      const hasCoding = codingAppIds.has(id);
      const hasKnowledge = knowledgeAppIds.has(id);
      const hasAny = hasInterview || hasScenario || hasCoding || hasKnowledge;
      evidenceByApplication.set(id, { hasInterview, hasScenario, hasCoding, hasKnowledge, hasAny });
      if (hasInterview) applicationsWithInterviewReport += 1;
      if (hasScenario) applicationsWithScenarioReport += 1;
      if (hasCoding) applicationsWithCodingReport += 1;
      if (hasKnowledge) applicationsWithKnowledgeEvaluation += 1;
      if (hasAny) applicationsWithAnyAssessmentEvidence += 1;
    }

    // ---- 32C hiring/employment/retention/performance/review-window counts ----
    const hiringOutcomes = { totalRecorded: outcomes.length, hired: 0, rejected: 0, withdrawn: 0, noDecision: 0 };
    const employmentOutcomes = { joined: 0, didNotJoin: 0, employed: 0, left: 0, unknown: 0 };
    const retention = { retained: 0, exited: 0, unknown: 0 };
    const performance = { belowExpectations: 0, meetsExpectations: 0, exceedsExpectations: 0, notRecorded: 0 };
    const reviewWindows = { thirtyDay: 0, ninetyDay: 0, sixMonth: 0, twelveMonth: 0, notAvailable: 0 };
    const outcomeGroups = new Map<string, IEmployerHiringOutcome[]>();

    for (const outcome of outcomes) {
      switch (outcome.hiringOutcome) {
        case 'hired':
          hiringOutcomes.hired += 1;
          break;
        case 'rejected':
          hiringOutcomes.rejected += 1;
          break;
        case 'withdrawn':
          hiringOutcomes.withdrawn += 1;
          break;
        default:
          hiringOutcomes.noDecision += 1;
      }
      const group = outcomeGroups.get(outcome.hiringOutcome) ?? [];
      group.push(outcome);
      outcomeGroups.set(outcome.hiringOutcome, group);

      const employment = outcome.employmentOutcome;
      if (!employment || employment.status === 'unknown') {
        employmentOutcomes.unknown += 1;
      } else if (employment.status === 'joined') {
        employmentOutcomes.joined += 1;
      } else if (employment.status === 'did_not_join') {
        employmentOutcomes.didNotJoin += 1;
      } else if (employment.status === 'employed') {
        employmentOutcomes.employed += 1;
      } else if (employment.status === 'left') {
        employmentOutcomes.left += 1;
      }

      const retentionStatus = employment?.retentionStatus;
      if (!retentionStatus || retentionStatus === 'unknown') {
        retention.unknown += 1;
      } else if (retentionStatus === 'retained') {
        retention.retained += 1;
      } else if (retentionStatus === 'exited') {
        retention.exited += 1;
      }

      const performanceBand = employment?.performanceBand;
      if (!performanceBand) {
        performance.notRecorded += 1;
      } else if (performanceBand === 'below_expectations') {
        performance.belowExpectations += 1;
      } else if (performanceBand === 'meets_expectations') {
        performance.meetsExpectations += 1;
      } else if (performanceBand === 'exceeds_expectations') {
        performance.exceedsExpectations += 1;
      }

      const reviewWindow = employment?.reviewWindow;
      if (!reviewWindow || reviewWindow === 'not_available') {
        reviewWindows.notAvailable += 1;
      } else if (reviewWindow === 'thirty_day') {
        reviewWindows.thirtyDay += 1;
      } else if (reviewWindow === 'ninety_day') {
        reviewWindows.ninetyDay += 1;
      } else if (reviewWindow === 'six_month') {
        reviewWindows.sixMonth += 1;
      } else if (reviewWindow === 'twelve_month') {
        reviewWindows.twelveMonth += 1;
      }
    }

    // ---- Outcome-evidence matrix — descriptive coverage per outcome group only, never a causal claim ----
    const outcomeEvidenceMatrix = Array.from(outcomeGroups.entries()).map(([hiringOutcome, group]) => {
      let withStandardInterview = 0;
      let withScenario = 0;
      let withCoding = 0;
      let withKnowledgeGrounding = 0;
      for (const outcome of group) {
        const evidence = evidenceByApplication.get(outcome.applicationId.toString());
        if (!evidence) continue;
        if (evidence.hasInterview) withStandardInterview += 1;
        if (evidence.hasScenario) withScenario += 1;
        if (evidence.hasCoding) withCoding += 1;
        if (evidence.hasKnowledge) withKnowledgeGrounding += 1;
      }
      return {
        hiringOutcome: hiringOutcome as IEmployerHiringOutcome['hiringOutcome'],
        applicationCount: group.length,
        withStandardInterview,
        withScenario,
        withCoding,
        withKnowledgeGrounding,
      };
    });

    // ---- Evidence quality — 32A/32B availability only ----
    const totalCandidates = jobId ? candidateIds.length : await EmployerCandidate.countDocuments({ organizationId });
    const [unifiedProfiles, crossAssessmentRecords] = await Promise.all([
      candidateIds.length > 0
        ? EmployerUnifiedTalentProfile.find({ organizationId, candidateId: { $in: candidateIds } }).select('candidateId').lean()
        : [],
      candidateIds.length > 0
        ? EmployerCrossAssessmentTalentIntelligence.find({ organizationId, candidateId: { $in: candidateIds } })
            .select('candidateId sourceCoverage.totalSourceTypes')
            .lean()
        : [],
    ]);
    const evidenceQuality = {
      totalCandidates,
      candidatesWithUnifiedProfile: unifiedProfiles.length,
      candidatesWithCrossAssessmentIntelligence: crossAssessmentRecords.length,
      multiSourceCandidates: crossAssessmentRecords.filter((r) => r.sourceCoverage.totalSourceTypes >= 2).length,
      singleSourceCandidates: crossAssessmentRecords.filter((r) => r.sourceCoverage.totalSourceTypes === 1).length,
      noAssessmentEvidenceCandidates: crossAssessmentRecords.filter((r) => r.sourceCoverage.totalSourceTypes === 0).length,
    };

    // ---- Data quality — descriptive coverage percentages only ----
    const hiredApplicationIds = new Set(
      applications.filter((a) => a.status === EmployerJobApplicationStatus.HIRED).map((a) => a._id.toString())
    );
    const hiredWithEmploymentOutcome = outcomes.filter(
      (o) => hiredApplicationIds.has(o.applicationId.toString()) && !!o.employmentOutcome
    ).length;

    const dataQuality = {
      outcomeCoveragePercent: pct(outcomes.length, totalApplications),
      employmentOutcomeCoveragePercent: pct(hiredWithEmploymentOutcome, hiredApplicationIds.size),
      assessmentEvidenceCoveragePercent: pct(applicationsWithAnyAssessmentEvidence, totalApplications),
    };

    return {
      hiringOutcomes,
      employmentOutcomes,
      retention,
      performance,
      assessmentCoverage: {
        applicationsWithInterviewReport,
        applicationsWithScenarioReport,
        applicationsWithCodingReport,
        applicationsWithKnowledgeEvaluation,
        applicationsWithAnyAssessmentEvidence,
      },
      outcomeEvidenceMatrix,
      evidenceQuality,
      reviewWindows,
      dataQuality,
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

  private toDetail(doc: IEmployerOutcomeQualityAnalytics): Record<string, unknown> {
    return {
      built: true,
      analyticsVersion: doc.analyticsVersion,
      generatedAt: doc.generatedAt,
      hiringOutcomes: doc.hiringOutcomes,
      employmentOutcomes: doc.employmentOutcomes,
      retention: doc.retention,
      performance: doc.performance,
      assessmentCoverage: doc.assessmentCoverage,
      outcomeEvidenceMatrix: doc.outcomeEvidenceMatrix,
      evidenceQuality: doc.evidenceQuality,
      reviewWindows: doc.reviewWindows,
      dataQuality: doc.dataQuality,
    };
  }
}

export const employerOutcomeQualityAnalyticsService = new EmployerOutcomeQualityAnalyticsService();
export default employerOutcomeQualityAnalyticsService;
