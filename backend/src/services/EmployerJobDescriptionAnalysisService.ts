import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobDescriptionAnalysis, {
  IJobDescriptionAnalysis,
  IJobDescriptionAnalysisCompensation,
  IEmployerJobDescriptionAnalysisUsage,
} from '../models/EmployerJobDescriptionAnalysis.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobDescriptionAnalysisStatus } from '../constants/employerJobDescriptionAnalysis';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { getModelPricing } from '../config/openaiPricing';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { ApiError } from '../utils/ApiError';

interface JobRef {
  _id: Types.ObjectId;
  status: EmployerJobStatus;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — same convention as AIUsageService.recordAIUsage
}

/**
 * Structured JD parsing (17B) — uses ONLY the existing Sprint 2 AI Gateway
 * (`getAIService().generateStructured`); never instantiates a provider SDK
 * directly, never a second abstraction. Cost is computed via the same
 * shared `getModelPricing` config AIUsageService already uses — never a
 * parallel pricing calculator — just persisted into this model's own
 * single-call `aiUsage` shape rather than Interview's cumulative one (a JD
 * analysis is exactly one AI call, not many).
 *
 * Concurrency safety reuses the unique {organizationId, jobId, jdSourceId}
 * index on EmployerJobDescriptionAnalysis itself as the claim: the first
 * `create()` for a given source version wins; a concurrent duplicate
 * insert's E11000 is used to detect and react to whatever state already
 * exists (completed -> return it; processing -> reject as in-progress;
 * failed -> revive via compare-and-swap for a single retrying racer). No
 * queue/worker infrastructure — mirrors the existing
 * OrganizationInterviewCreditService claim pattern, minus the separate
 * claim collection (this model's own uniqueness already provides it).
 */
export class EmployerJobDescriptionAnalysisService {
  /** GET .../jd/analysis — the CURRENT JD source's analysis, or null if never parsed. Read-only, so archived org/job remain readable. */
  async getCurrentAnalysis(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const currentSource = await this.getCurrentSource(organization._id, job._id);
    if (!currentSource) {
      return null;
    }

    const analysis = await EmployerJobDescriptionAnalysis.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    }).lean();

    return analysis ? this.toDetail(analysis) : null;
  }

  /** GET .../jd/:jdSourceId/analysis — analysis for one EXACT source version, or null if that version was never parsed. The source itself must exist in this exact org+job, or 404. */
  async getAnalysisForSource(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    jobId: string,
    jdSourceId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);

    const source = await EmployerJobDescriptionSource.findOne({
      _id: jdSourceId,
      organizationId: organization._id,
      jobId: job._id,
    }).select('_id');
    if (!source) {
      throw new ApiError(404, 'Job description version not found');
    }

    const analysis = await EmployerJobDescriptionAnalysis.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: source._id,
    }).lean();

    return analysis ? this.toDetail(analysis) : null;
  }

  /**
   * POST .../jd/analyze — parses the CURRENT JD source only. If a completed
   * analysis already exists for that exact source version, returns it
   * WITHOUT calling AI again. If a failed analysis exists, retries. Never
   * touches the raw JD source itself.
   */
  async analyzeCurrentJobDescription(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    jobId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const job = await this.getJobInOrganization(organization._id, jobId);
    this.assertJobMutable(job);

    const currentSource = await this.getCurrentSource(organization._id, job._id);
    if (!currentSource) {
      throw new ApiError(409, 'This job has no job description to analyze yet');
    }

    const claim = await this.claimAnalysis(
      organization._id,
      job._id,
      currentSource._id as Types.ObjectId,
      currentSource.version,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed analysis already exists for this exact source version — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    // From here, `claim.row` is exclusively ours (status: processing).
    try {
      const { analysis, aiUsage } = await this.runAnalysis(currentSource.rawText, organization._id.toString());
      claim.row.analysis = analysis;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerJobDescriptionAnalysisStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerJobDescriptionAnalysisService] Analysis failed for job ${job._id.toString()} source ${currentSource._id.toString()}`,
        error
      );
      claim.row.status = EmployerJobDescriptionAnalysisStatus.FAILED;
      claim.row.errorMessage = 'Failed to analyze this job description. Please try again.';
      await claim.row.save();
      throw new ApiError(502, 'Failed to analyze job description');
    }
  }

  /**
   * Wins (or recovers) the exclusive right to parse `jdSourceId`. Returns
   * either an already-COMPLETED row (caller must not call AI) or a row this
   * caller now exclusively owns with status PROCESSING (caller must call AI
   * and then save the outcome). Throws 409 for an already-in-progress
   * concurrent request, or when a FAILED row's retry is lost to another
   * concurrent racer.
   */
  private async claimAnalysis(
    organizationId: Types.ObjectId,
    jobId: Types.ObjectId,
    jdSourceId: Types.ObjectId,
    jdVersion: number,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerJobDescriptionAnalysis>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerJobDescriptionAnalysis.create({
        organizationId,
        jobId,
        jdSourceId,
        jdVersion,
        status: EmployerJobDescriptionAnalysisStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    // Someone already has (or had) a row for this exact source version.
    const existing = await EmployerJobDescriptionAnalysis.findOne({ organizationId, jobId, jdSourceId });
    if (!existing) {
      throw new ApiError(409, 'Analysis is already being processed — please try again shortly');
    }

    if (existing.status === EmployerJobDescriptionAnalysisStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerJobDescriptionAnalysisStatus.PROCESSING) {
      throw new ApiError(409, 'Analysis is already in progress for this job description');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerJobDescriptionAnalysis.findOneAndUpdate(
      { _id: existing._id, status: EmployerJobDescriptionAnalysisStatus.FAILED },
      { $set: { status: EmployerJobDescriptionAnalysisStatus.PROCESSING }, $unset: { analysis: '', aiUsage: '', errorMessage: '' } },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Analysis is already in progress for this job description');
    }
    return { row: revived, alreadyCompleted: false };
  }

  /**
   * The ONLY place this service calls AI — through the existing Sprint 2
   * gateway's generic structured-generation primitive. No provider SDK is
   * touched here. `result.data` is `unknown`/untyped from the gateway's own
   * contract, so it is strictly validated/normalized before anything is
   * persisted — arbitrary model JSON is never blindly saved.
   */
  private async runAnalysis(
    rawText: string,
    organizationId: string
  ): Promise<{ analysis: IJobDescriptionAnalysis; aiUsage: IEmployerJobDescriptionAnalysisUsage }> {
    const prompt = this.buildPrompt(rawText);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 2000 },
      { organizationId, operation: 'jd-parsing' }
    );

    const analysis = this.validateAnalysis(result.data);
    const aiUsage = this.computeUsage(result.metadata);
    return { analysis, aiUsage };
  }

  /**
   * Analyze ONLY the supplied text — never invent missing facts. Unknown
   * values must be omitted/null/empty. Preserves mandatory-vs-preferred and
   * responsibility-vs-requirement distinctions. `technicalKeywords`/
   * `toolsTechnologies`/`softSkillKeywords` are explicitly framed as raw
   * mentioned concepts, not a canonical/scored skill taxonomy (that's a
   * later sprint). Must return JSON only (required for OpenAI's JSON mode).
   */
  private buildPrompt(rawText: string): string {
    return `You are an expert technical recruiter and job description analyst.

Analyze ONLY the job description text supplied below. Do not invent, assume, or add any fact that is not stated or clearly implied by the text. If a field cannot be determined from the text, omit it, use null, or return an empty array as appropriate — never guess or fabricate a value.

Preserve these distinctions carefully:
- "requirements.mandatory" are qualifications explicitly required/must-have; "requirements.preferred" are explicitly optional/nice-to-have. If the text does not clearly distinguish them, place only unambiguous must-haves under "mandatory" and everything else under "preferred".
- "responsibilities" describe what the person will DO in the role. "requirements" describe qualifications/skills/experience needed to be considered for the role. Do not mix the two.
- "technicalKeywords", "toolsTechnologies", and "softSkillKeywords" are raw, notable keywords or short phrases actually mentioned in the text — they are NOT a scored or canonicalized skill taxonomy; just report what appears in the text.

"confidence.overall" is a number from 0 to 1 reflecting how confident you are in this extraction given how clear and complete the source text is. "confidence.ambiguousSections" should list short section labels (e.g. "experience", "compensation") ONLY where the wording was genuinely unclear, missing key detail, or contradictory — leave it empty if the text was clear.

Return ONLY a single JSON object with EXACTLY this shape (omit a field, or use null/an empty array, when the text does not support a value — never fabricate):
{
  "jobTitle": string | null,
  "summary": string | null,
  "rolePurpose": string | null,
  "responsibilities": string[],
  "requirements": { "mandatory": string[], "preferred": string[] },
  "experience": { "minYears": number | null, "maxYears": number | null, "description": string | null },
  "education": string[],
  "domainKnowledge": string[],
  "technicalKeywords": string[],
  "toolsTechnologies": string[],
  "softSkillKeywords": string[],
  "location": string | null,
  "workplaceType": string | null,
  "employmentType": string | null,
  "compensation": { "min": number | null, "max": number | null, "currency": string | null, "rawText": string | null } | null,
  "confidence": { "overall": number, "ambiguousSections": string[] }
}

JOB DESCRIPTION TEXT:
"""
${rawText}
"""

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /** Strict normalization of untrusted AI JSON — every field is defensively coerced/clamped/truncated; nothing from the model's raw output is trusted as-is. */
  private validateAnalysis(data: unknown): IJobDescriptionAnalysis {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

    const asString = (value: unknown, maxLength = 2000): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
    const asStringArray = (value: unknown, maxItems = 50, maxLength = 300): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, maxLength))
        .slice(0, maxItems);
    };
    const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

    const requirementsRaw = asObject(source.requirements);
    const experienceRaw = asObject(source.experience);
    const compensationRaw = source.compensation && typeof source.compensation === 'object' ? asObject(source.compensation) : null;
    const confidenceRaw = asObject(source.confidence);

    let overall = asNumber(confidenceRaw.overall) ?? 0;
    overall = Math.min(1, Math.max(0, overall));

    let compensation: IJobDescriptionAnalysisCompensation | undefined;
    if (compensationRaw) {
      const candidate: IJobDescriptionAnalysisCompensation = {
        min: asNumber(compensationRaw.min),
        max: asNumber(compensationRaw.max),
        currency: asString(compensationRaw.currency, 10),
        rawText: asString(compensationRaw.rawText, 300),
      };
      const hasContent = Object.values(candidate).some((value) => value !== undefined);
      compensation = hasContent ? candidate : undefined;
    }

    return {
      jobTitle: asString(source.jobTitle, 200),
      summary: asString(source.summary, 1000),
      rolePurpose: asString(source.rolePurpose, 1000),
      responsibilities: asStringArray(source.responsibilities),
      requirements: {
        mandatory: asStringArray(requirementsRaw.mandatory),
        preferred: asStringArray(requirementsRaw.preferred),
      },
      experience: {
        minYears: asNumber(experienceRaw.minYears),
        maxYears: asNumber(experienceRaw.maxYears),
        description: asString(experienceRaw.description, 500),
      },
      education: asStringArray(source.education, 20),
      domainKnowledge: asStringArray(source.domainKnowledge, 30),
      technicalKeywords: asStringArray(source.technicalKeywords, 80),
      toolsTechnologies: asStringArray(source.toolsTechnologies, 80),
      softSkillKeywords: asStringArray(source.softSkillKeywords, 40),
      location: asString(source.location, 200),
      workplaceType: asString(source.workplaceType, 50),
      employmentType: asString(source.employmentType, 50),
      compensation,
      confidence: {
        overall,
        ambiguousSections: asStringArray(confidenceRaw.ambiguousSections, 20, 100),
      },
    };
  }

  /** Reuses the SAME shared pricing config/formula as AIUsageService.recordAIUsage — never a parallel pricing calculator — just persisted into this model's own single-call usage shape. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerJobDescriptionAnalysisUsage {
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

  /** The current JD source is always the highest-version row for the job — same derivation EmployerJobDescriptionService uses for its own `current`. */
  private async getCurrentSource(organizationId: Types.ObjectId, jobId: Types.ObjectId) {
    return EmployerJobDescriptionSource.findOne({ organizationId, jobId }).sort({ version: -1 });
  }

  /** Exact {_id, organizationId} match only — a cross-org job id is treated identically to a nonexistent one (404). */
  private async getJobInOrganization(organizationId: Types.ObjectId, jobId: string): Promise<JobRef> {
    const job = await EmployerJob.findOne({ _id: jobId, organizationId }).select('_id status').lean();
    if (!job) {
      throw new ApiError(404, 'Job not found');
    }
    return { _id: job._id as Types.ObjectId, status: job.status };
  }

  /** An archived JOB (independent of organization archival) can still have its analysis read, but never a new parse triggered. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its job description cannot be analyzed');
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

  /** Type guard — JD analysis doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes provider secrets/raw error dumps — `errorMessage` is always the short, safe message this service itself wrote. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jobId: doc.jobId.toString(),
      jdSourceId: doc.jdSourceId.toString(),
      jdVersion: doc.jdVersion,
      status: doc.status,
      analysis: doc.analysis ?? null,
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdByMembershipId: doc.createdByMembershipId.toString(),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerJobDescriptionAnalysisService = new EmployerJobDescriptionAnalysisService();
