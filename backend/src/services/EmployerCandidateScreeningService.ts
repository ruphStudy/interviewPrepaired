import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication, { IEmployerJobApplication } from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobIntelligenceSnapshot, { IJobIntelligenceSnapshot } from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import EmployerCandidateResumeAnalysis, { ICandidateResumeProfile } from '../models/EmployerCandidateResumeAnalysis.model';
import { EmployerCandidateResumeAnalysisStatus } from '../constants/employerCandidateResumeAnalysis';
import EmployerCandidateScreening, {
  IScreeningResult,
  IScreeningCompetencyMatch,
  IEmployerCandidateScreeningUsage,
} from '../models/EmployerCandidateScreening.model';
import { EmployerCandidateScreeningStatus, EmployerCandidateScreeningRecommendation, MAX_SCREENING_HISTORY_LIMIT } from '../constants/employerCandidateScreening';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { getModelPricing } from '../config/openaiPricing';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { ApiError } from '../utils/ApiError';

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — same convention as every other AI-usage-persisting service in this project
}

/**
 * Candidate-to-job screening (19A) — compares one job application's
 * candidate resume analysis against the job's FINALIZED JD Intelligence
 * Snapshot (17E) using ONLY the existing Sprint 2 AI Gateway
 * (`getAIService().generateStructured`). Never reads raw JD text, the
 * mutable EmployerJob fields, or standalone 17B/17C/17D artifacts — the
 * finalized snapshot is the sole stable contract. Never reads raw resume
 * text — only the already-structured, already-validated 18C profile.
 * Never modifies the application, candidate, job, JD snapshot, or resume
 * analysis. No ranking across candidates (19D), no shortlist automation
 * (19E), no interview generation.
 *
 * Concurrency safety mirrors EmployerJobDescriptionAnalysisService (17B)
 * and EmployerCandidateResumeAnalysisService (18C) exactly: the unique
 * {organizationId, applicationId, jdSnapshotId, resumeAnalysisId} index on
 * EmployerCandidateScreening doubles as the claim.
 */
export class EmployerCandidateScreeningService {
  /**
   * GET .../screening — the screening result applicable to the
   * CURRENT finalized JD snapshot and CURRENT resolvable resume analysis
   * for this application, or null if that exact combination was never
   * screened. Read-only, so an archived organization/application remains
   * readable.
   */
  async getCurrentScreening(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const jdSnapshot = await this.getCurrentFinalizedSnapshot(organization._id, application.jobId);
    if (!jdSnapshot) return null;

    const resumeAnalysis = await this.resolveResumeAnalysis(organization._id, application);
    if (!resumeAnalysis) return null;

    const screening = await EmployerCandidateScreening.findOne({
      organizationId: organization._id,
      applicationId: application._id,
      jdSnapshotId: jdSnapshot._id,
      resumeAnalysisId: resumeAnalysis._id,
    }).lean();

    return screening ? this.toDetail(screening) : null;
  }

  /** GET .../screenings — full screening history for this application, newest first, capped. Optional convenience; not the primary read path. */
  async getScreeningHistory(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<{ screenings: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const screenings = await EmployerCandidateScreening.find({ organizationId: organization._id, applicationId: application._id })
      .sort({ createdAt: -1 })
      .limit(MAX_SCREENING_HISTORY_LIMIT)
      .lean();

    return { screenings: screenings.map((s) => this.toDetail(s)) };
  }

  /**
   * POST .../screening — screens this application against the CURRENT
   * finalized JD snapshot and the resolved resume analysis (preferring
   * `application.resumeAnalysisId` from 18D; falling back to the
   * candidate's CURRENT completed resume analysis only when that reference
   * is absent or no longer resolvable). If a completed screening already
   * exists for this EXACT combination, it is returned WITHOUT calling AI
   * again — a new JD snapshot or new resume analysis is a different
   * combination and gets its own row; no historical result is ever
   * overwritten.
   */
  async screenApplication(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    applicationId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id });
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }
    this.assertApplicationMutable(application.status);

    const jdSnapshot = await this.getCurrentFinalizedSnapshot(organization._id, application.jobId);
    if (!jdSnapshot) {
      throw new ApiError(409, 'Finalize JD Intelligence before screening.');
    }

    const resumeAnalysis = await this.resolveResumeAnalysis(organization._id, application);
    if (!resumeAnalysis || !resumeAnalysis.profile) {
      throw new ApiError(409, 'Analyze the candidate resume before screening.');
    }

    const claim = await this.claimScreening(
      organization._id,
      application._id as Types.ObjectId,
      application.jobId,
      application.candidateId,
      jdSnapshot._id as Types.ObjectId,
      resumeAnalysis._id as Types.ObjectId,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed screening already exists for this exact combination — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    // From here, `claim.row` is exclusively ours (status: processing).
    try {
      const { result, aiUsage } = await this.runScreening(jdSnapshot.snapshot, resumeAnalysis.profile, organization._id.toString());
      claim.row.result = result;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerCandidateScreeningStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerCandidateScreeningService] Screening failed for application ${application._id.toString()} (job ${application.jobId.toString()}, candidate ${application.candidateId.toString()})`,
        error
      );
      claim.row.status = EmployerCandidateScreeningStatus.FAILED;
      claim.row.errorMessage = 'Failed to screen this application. Please try again.';
      await claim.row.save();
      throw new ApiError(502, 'Failed to screen application');
    }
  }

  /**
   * Wins (or recovers) the exclusive right to screen this exact
   * {applicationId, jdSnapshotId, resumeAnalysisId} combination. Returns
   * either an already-COMPLETED row (caller must not call AI) or a row
   * this caller now exclusively owns with status PROCESSING (caller must
   * call AI and then save the outcome).
   */
  private async claimScreening(
    organizationId: Types.ObjectId,
    applicationId: Types.ObjectId,
    jobId: Types.ObjectId,
    candidateId: Types.ObjectId,
    jdSnapshotId: Types.ObjectId,
    resumeAnalysisId: Types.ObjectId,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerCandidateScreening>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerCandidateScreening.create({
        organizationId,
        applicationId,
        jobId,
        candidateId,
        jdSnapshotId,
        resumeAnalysisId,
        status: EmployerCandidateScreeningStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await EmployerCandidateScreening.findOne({ organizationId, applicationId, jdSnapshotId, resumeAnalysisId });
    if (!existing) {
      throw new ApiError(409, 'Screening is already being processed — please try again shortly');
    }

    if (existing.status === EmployerCandidateScreeningStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerCandidateScreeningStatus.PROCESSING) {
      throw new ApiError(409, 'Screening is already in progress for this application');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerCandidateScreening.findOneAndUpdate(
      { _id: existing._id, status: EmployerCandidateScreeningStatus.FAILED },
      { $set: { status: EmployerCandidateScreeningStatus.PROCESSING }, $unset: { result: '', aiUsage: '', errorMessage: '' } },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Screening is already in progress for this application');
    }
    return { row: revived, alreadyCompleted: false };
  }

  /**
   * The ONLY place this service calls AI — through the existing Sprint 2
   * gateway's generic structured-generation primitive. `result.data` is
   * `unknown`/untyped from the gateway's own contract, so it is strictly
   * validated/normalized before anything is persisted.
   */
  private async runScreening(
    jdSnapshot: IJobIntelligenceSnapshot,
    profile: ICandidateResumeProfile,
    organizationId: string
  ): Promise<{ result: IScreeningResult; aiUsage: IEmployerCandidateScreeningUsage }> {
    const validCompetencyNames = new Set(jdSnapshot.competencies.map((c) => c.name));
    const prompt = this.buildPrompt(jdSnapshot, profile);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 2500 },
      { organizationId, operation: 'candidate-screening' }
    );

    const screeningResult = this.validateResult(result.data, validCompetencyNames);
    const aiUsage = this.computeUsage(result.metadata);
    return { result: screeningResult, aiUsage };
  }

  /**
   * Compact, structured inputs ONLY — never raw JD text, never raw resume
   * text. Requires evidence-based comparison, forbids inferring missing
   * experience or treating related technologies as automatic matches,
   * requires respecting the JD's own competency weights, forbids any
   * protected/personal-attribute inference, and forbids hiring-decision
   * language beyond the four defined recommendation values.
   */
  private buildPrompt(jdSnapshot: IJobIntelligenceSnapshot, profile: ICandidateResumeProfile): string {
    const compactJd = {
      role: {
        jobTitle: jdSnapshot.role.jobTitle,
        summary: jdSnapshot.role.summary,
        experience: jdSnapshot.role.experience,
        education: jdSnapshot.role.education,
        domainKnowledge: jdSnapshot.role.domainKnowledge,
      },
      skills: jdSnapshot.skills.map((s) => ({
        name: s.name,
        requirement: s.requirement,
        proficiency: s.proficiency,
        importance: s.importance,
      })),
      competencies: jdSnapshot.competencies.map((c) => ({
        name: c.name,
        description: c.description,
        weight: c.weight,
        importance: c.importance,
        skillNames: c.skillNames,
      })),
    };

    const compactProfile = {
      headline: profile.headline,
      summary: profile.summary,
      totalExperienceYears: profile.totalExperienceYears,
      experience: profile.experience.map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        durationMonths: e.durationMonths,
        responsibilities: e.responsibilities,
        achievements: e.achievements,
        technologies: e.technologies,
      })),
      education: profile.education,
      skills: profile.skills,
      toolsTechnologies: profile.toolsTechnologies,
      certifications: profile.certifications,
      projects: profile.projects,
    };

    const competencyNameList = jdSnapshot.competencies.map((c) => `"${c.name}"`).join(', ');

    return `You are an expert technical recruiter comparing ONE candidate against ONE job's requirements.

Compare the JOB REQUIREMENTS and CANDIDATE PROFILE JSON below using ONLY evidence actually present in them. Do not infer, assume, or fabricate any experience, skill, or qualification that is not stated. A JD skill with no supporting evidence in the candidate profile stays in "missingSkills" — never move it to "matchedSkills" out of assumption. A related-but-not-identical technology (e.g. the JD asks for "PostgreSQL" and the candidate lists "MySQL") may be listed in "partialSkills" — it is NEVER automatically treated as a full match.

Respect the JD's own competency weights (given below) when reasoning about overall fit — a competency with a higher weight matters more to the overall assessment than one with a lower weight. For EVERY competency listed below, include exactly one entry in "competencyMatch" using its EXACT name from this list: ${competencyNameList || '(none)'}.

Do NOT use, mention, or infer any protected or personal attribute — including but not limited to age, gender, race, ethnicity, religion, national origin, marital status, family/parental status, disability, or any other demographic characteristic. Base every judgment strictly on stated skills, experience, education, and qualifications.

This is a fit ASSESSMENT only, not a hiring decision — do not use hiring-decision language (e.g. "hire", "reject", "advance") anywhere in your output beyond selecting one value for "recommendation" from its four defined options.

JOB REQUIREMENTS (from the finalized JD intelligence snapshot):
${JSON.stringify(compactJd)}

CANDIDATE PROFILE (from the candidate's completed resume analysis):
${JSON.stringify(compactProfile)}

Return ONLY a single JSON object with EXACTLY this shape:
{
  "overallScore": number (0-100),
  "recommendation": "strong_match" | "match" | "borderline" | "weak_match",
  "skillMatch": { "score": number (0-100), "matchedSkills": string[], "missingSkills": string[], "partialSkills": string[] },
  "competencyMatch": [ { "competencyName": string, "score": number (0-100), "evidence": string[] } ],
  "experienceMatch": { "score": number (0-100), "summary": string | null },
  "educationMatch": { "score": number (0-100), "summary": string | null },
  "strengths": string[],
  "concerns": string[],
  "confidence": number (0-1)
}

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /**
   * Strict normalization of untrusted AI JSON. Structural prerequisites
   * (a valid recommendation, an object skillMatch, an array
   * competencyMatch) must be present or the result is rejected outright
   * (fail screening rather than persist junk) — every field within that
   * structure is then defensively coerced/clamped/capped, and any
   * competency reference that doesn't match an actual JD competency name
   * is dropped, never persisted.
   */
  private validateResult(data: unknown, validCompetencyNames: Set<string>): IScreeningResult {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source) {
      throw new ApiError(502, 'Screening result was structurally invalid');
    }

    const recommendation = this.validateRecommendation(source.recommendation);
    if (!recommendation) {
      throw new ApiError(502, 'Screening result was structurally invalid');
    }

    if (!source.skillMatch || typeof source.skillMatch !== 'object') {
      throw new ApiError(502, 'Screening result was structurally invalid');
    }
    if (!Array.isArray(source.competencyMatch)) {
      throw new ApiError(502, 'Screening result was structurally invalid');
    }

    const asClampedScore = (value: unknown): number => {
      const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
      return Math.min(100, Math.max(0, Math.round(n)));
    };
    const asStringArray = (value: unknown, maxItems = 40, maxLength = 200): string[] => {
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim().slice(0, maxLength);
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(trimmed);
        if (result.length >= maxItems) break;
      }
      return result;
    };
    const asOptionalString = (value: unknown, maxLength = 500): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
    const asConfidence = (value: unknown): number => {
      const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
      return Math.min(1, Math.max(0, n));
    };
    const asObject = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

    const skillMatchRaw = asObject(source.skillMatch);
    const skillMatch = {
      score: asClampedScore(skillMatchRaw.score),
      matchedSkills: asStringArray(skillMatchRaw.matchedSkills, 60, 150),
      missingSkills: asStringArray(skillMatchRaw.missingSkills, 60, 150),
      partialSkills: asStringArray(skillMatchRaw.partialSkills, 60, 150),
    };

    // Only keep competency entries that reference an ACTUAL JD competency name — unknown/hallucinated references are dropped, never persisted.
    const competencyMatch: IScreeningCompetencyMatch[] = (source.competencyMatch as unknown[])
      .map((entryRaw) => asObject(entryRaw))
      .map((entry) => ({
        competencyName: typeof entry.competencyName === 'string' ? entry.competencyName.trim() : '',
        score: asClampedScore(entry.score),
        evidence: asStringArray(entry.evidence, 10, 300),
      }))
      .filter((entry) => entry.competencyName.length > 0 && validCompetencyNames.has(entry.competencyName))
      .slice(0, 50);

    const experienceMatchRaw = asObject(source.experienceMatch);
    const educationMatchRaw = asObject(source.educationMatch);

    return {
      overallScore: asClampedScore(source.overallScore),
      recommendation,
      skillMatch,
      competencyMatch,
      experienceMatch: { score: asClampedScore(experienceMatchRaw.score), summary: asOptionalString(experienceMatchRaw.summary) },
      educationMatch: { score: asClampedScore(educationMatchRaw.score), summary: asOptionalString(educationMatchRaw.summary) },
      strengths: asStringArray(source.strengths, 15, 300),
      concerns: asStringArray(source.concerns, 15, 300),
      confidence: asConfidence(source.confidence),
    };
  }

  private validateRecommendation(value: unknown): EmployerCandidateScreeningRecommendation | null {
    if (
      typeof value === 'string' &&
      Object.values(EmployerCandidateScreeningRecommendation).includes(value as EmployerCandidateScreeningRecommendation)
    ) {
      return value as EmployerCandidateScreeningRecommendation;
    }
    return null;
  }

  /** Reuses the SAME shared pricing config/formula every other AI-backed sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerCandidateScreeningUsage {
    const cachedInputTokens = metadata.cachedInputTokens ?? 0;
    const pricing = getModelPricing(metadata.model);
    const nonCachedInputTokens = Math.max(metadata.inputTokens - cachedInputTokens, 0);

    let inputCostUsd = 0;
    let cachedInputCostUsd = 0;
    let outputCostUsd = 0;
    let pricingStatus: 'calculated' | 'unknown' = 'unknown';

    if (pricing) {
      inputCostUsd = round((nonCachedInputTokens / 1_000_000) * pricing.inputPerMillionUsd);
      cachedInputCostUsd = pricing.cachedInputPerMillionUsd
        ? round((cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillionUsd)
        : 0;
      outputCostUsd = round((metadata.outputTokens / 1_000_000) * pricing.outputPerMillionUsd);
      pricingStatus = 'calculated';
    }

    const totalCostUsd = pricingStatus === 'calculated' ? round(inputCostUsd + cachedInputCostUsd + outputCostUsd) : 0;

    return {
      provider: metadata.provider,
      model: metadata.model,
      inputTokens: metadata.inputTokens,
      cachedInputTokens,
      outputTokens: metadata.outputTokens,
      totalTokens: metadata.totalTokens,
      inputCostUsd,
      cachedInputCostUsd,
      outputCostUsd,
      totalCostUsd,
      pricingStatus,
    };
  }

  /** The CURRENT JD source's finalized snapshot — same derivation EmployerJobIntelligenceSnapshotService uses for "current". Returns null if the current source has never been finalized. */
  private async getCurrentFinalizedSnapshot(organizationId: Types.ObjectId, jobId: Types.ObjectId) {
    const currentSource = await EmployerJobDescriptionSource.findOne({ organizationId, jobId }).sort({ version: -1 }).select('_id');
    if (!currentSource) return null;
    return EmployerJobIntelligenceSnapshot.findOne({ organizationId, jobId, jdSourceId: currentSource._id });
  }

  /**
   * Prefers the resume analysis captured on the application itself (18D),
   * re-verified as a real COMPLETED analysis for this exact
   * organization/candidate. Falls back to the candidate's CURRENT resume
   * version's COMPLETED analysis — the same deterministic derivation
   * EmployerCandidateResumeAnalysisService uses — only when the captured
   * reference is absent or no longer resolvable.
   */
  private async resolveResumeAnalysis(organizationId: Types.ObjectId, application: IEmployerJobApplication) {
    if (application.resumeAnalysisId) {
      const captured = await EmployerCandidateResumeAnalysis.findOne({
        _id: application.resumeAnalysisId,
        organizationId,
        candidateId: application.candidateId,
        status: EmployerCandidateResumeAnalysisStatus.COMPLETED,
      });
      if (captured) return captured;
    }

    const currentResumeSource = await EmployerCandidateResumeSource.findOne({ organizationId, candidateId: application.candidateId })
      .sort({ version: -1 })
      .select('_id');
    if (!currentResumeSource) return null;

    return EmployerCandidateResumeAnalysis.findOne({
      organizationId,
      candidateId: application.candidateId,
      resumeSourceId: currentResumeSource._id,
      status: EmployerCandidateResumeAnalysisStatus.COMPLETED,
    });
  }

  /** An archived application is never screened (or re-screened) — matches the same read-only-when-archived convention as every other application mutation (18D). */
  private assertApplicationMutable(status: EmployerJobApplicationStatus): void {
    if (status === EmployerJobApplicationStatus.ARCHIVED) {
      throw new ApiError(409, 'This application is archived — screening is disabled');
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — candidate screening doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes provider secrets/raw error dumps — `errorMessage` is always the short, safe message this service itself wrote. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      applicationId: doc.applicationId.toString(),
      jobId: doc.jobId.toString(),
      candidateId: doc.candidateId.toString(),
      jdSnapshotId: doc.jdSnapshotId.toString(),
      resumeAnalysisId: doc.resumeAnalysisId.toString(),
      status: doc.status,
      result: doc.result ?? null,
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerCandidateScreeningService = new EmployerCandidateScreeningService();
