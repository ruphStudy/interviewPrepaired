import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobDescriptionAnalysis, { IJobDescriptionAnalysis } from '../models/EmployerJobDescriptionAnalysis.model';
import EmployerJobDescriptionSkills, {
  IJobDescriptionSkill,
  IEmployerJobDescriptionSkillsUsage,
} from '../models/EmployerJobDescriptionSkills.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobDescriptionAnalysisStatus } from '../constants/employerJobDescriptionAnalysis';
import {
  EmployerJobDescriptionSkillsStatus,
  EmployerJobSkillCategory,
  EmployerJobSkillRequirement,
  EmployerJobSkillProficiency,
  EmployerJobSkillImportance,
} from '../constants/employerJobDescriptionSkills';
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

const MAX_SKILLS_FROM_AI = 100;
const MAX_EVIDENCE_PER_SKILL = 5;
const MAX_ALIASES_PER_SKILL = 10;

const CATEGORY_VALUES = new Set(Object.values(EmployerJobSkillCategory));
const REQUIREMENT_VALUES = new Set(Object.values(EmployerJobSkillRequirement));
const PROFICIENCY_VALUES = new Set(Object.values(EmployerJobSkillProficiency));
const IMPORTANCE_VALUES = new Set(Object.values(EmployerJobSkillImportance));

const REQUIREMENT_RANK: Record<EmployerJobSkillRequirement, number> = {
  [EmployerJobSkillRequirement.MANDATORY]: 3,
  [EmployerJobSkillRequirement.PREFERRED]: 2,
  [EmployerJobSkillRequirement.INFERRED]: 1,
};

const IMPORTANCE_RANK: Record<EmployerJobSkillImportance, number> = {
  [EmployerJobSkillImportance.CRITICAL]: 4,
  [EmployerJobSkillImportance.HIGH]: 3,
  [EmployerJobSkillImportance.MEDIUM]: 2,
  [EmployerJobSkillImportance.LOW]: 1,
};

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — same convention as AIUsageService.recordAIUsage / 17B
}

/**
 * Skill extraction from an ALREADY-COMPLETED 17B analysis (17C) — never
 * re-parses the raw JD text. Uses ONLY the existing Sprint 2 AI Gateway
 * (`getAIService().generateStructured`); never a provider SDK directly.
 * Cost reuses the same shared `getModelPricing` config as 17B/AIUsageService
 * — no parallel pricing calculator. This is job/JD-version skill
 * intelligence only — explicitly NOT the later global Skill Graph (Sprint
 * 25), and never generates competency weights (17D).
 *
 * Concurrency safety mirrors 17B exactly: the unique
 * {organizationId, jobId, jdSourceId} index on this model doubles as the
 * claim (first `create()` wins; E11000 branches on existing status;
 * FAILED is revived via compare-and-swap for a single retrying racer). No
 * queue/worker infrastructure.
 */
export class EmployerJobDescriptionSkillsService {
  /** GET .../jd/skills — the CURRENT JD source's skills, or null if never extracted. Read-only, so archived org/job remain readable. */
  async getCurrentSkills(
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

    const skills = await EmployerJobDescriptionSkills.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    }).lean();

    return skills ? this.toDetail(skills) : null;
  }

  /** GET .../jd/:jdSourceId/skills — skills for one EXACT source version, or null if that version's skills were never extracted. The source itself must exist in this exact org+job, or 404. */
  async getSkillsForSource(
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

    const skills = await EmployerJobDescriptionSkills.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: source._id,
    }).lean();

    return skills ? this.toDetail(skills) : null;
  }

  /**
   * POST .../jd/skills/extract — extracts skills for the CURRENT JD source
   * only, from its already-COMPLETED 17B analysis. Requires that analysis
   * to exist and be COMPLETED — never re-parses raw JD text, never calls AI
   * when the current analysis is missing/processing/failed.
   */
  async extractCurrentSkills(
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
      throw new ApiError(409, 'This job has no job description yet');
    }

    const analysisDoc = await EmployerJobDescriptionAnalysis.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    });
    if (!analysisDoc || analysisDoc.status !== EmployerJobDescriptionAnalysisStatus.COMPLETED || !analysisDoc.analysis) {
      throw new ApiError(409, 'Analyze the job description before extracting skills');
    }

    const claim = await this.claimExtraction(
      organization._id,
      job._id,
      currentSource._id as Types.ObjectId,
      currentSource.version,
      analysisDoc._id as Types.ObjectId,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed skill set already exists for this exact source version — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    // From here, `claim.row` is exclusively ours (status: processing).
    try {
      const { skills, aiUsage } = await this.runExtraction(analysisDoc.analysis, organization._id.toString());
      claim.row.skills = skills;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerJobDescriptionSkillsStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerJobDescriptionSkillsService] Skill extraction failed for job ${job._id.toString()} source ${currentSource._id.toString()}`,
        error
      );
      claim.row.status = EmployerJobDescriptionSkillsStatus.FAILED;
      claim.row.errorMessage = 'Failed to extract skills from this job description. Please try again.';
      await claim.row.save();
      throw new ApiError(502, 'Failed to extract job description skills');
    }
  }

  /**
   * Wins (or recovers) the exclusive right to extract skills for
   * `jdSourceId`. Returns either an already-COMPLETED row (caller must not
   * call AI) or a row this caller now exclusively owns with status
   * PROCESSING. Throws 409 for an already-in-progress concurrent request,
   * or when a FAILED row's retry is lost to another concurrent racer.
   */
  private async claimExtraction(
    organizationId: Types.ObjectId,
    jobId: Types.ObjectId,
    jdSourceId: Types.ObjectId,
    jdVersion: number,
    analysisId: Types.ObjectId,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerJobDescriptionSkills>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerJobDescriptionSkills.create({
        organizationId,
        jobId,
        jdSourceId,
        jdVersion,
        analysisId,
        status: EmployerJobDescriptionSkillsStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await EmployerJobDescriptionSkills.findOne({ organizationId, jobId, jdSourceId });
    if (!existing) {
      throw new ApiError(409, 'Skill extraction is already being processed — please try again shortly');
    }

    if (existing.status === EmployerJobDescriptionSkillsStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerJobDescriptionSkillsStatus.PROCESSING) {
      throw new ApiError(409, 'Skill extraction is already in progress for this job description');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerJobDescriptionSkills.findOneAndUpdate(
      { _id: existing._id, status: EmployerJobDescriptionSkillsStatus.FAILED },
      { $set: { status: EmployerJobDescriptionSkillsStatus.PROCESSING }, $unset: { skills: '', aiUsage: '', errorMessage: '' } },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Skill extraction is already in progress for this job description');
    }
    return { row: revived, alreadyCompleted: false };
  }

  /**
   * The ONLY place this service calls AI. Sends the COMPACT structured 17B
   * analysis (not the raw JD text) to minimize tokens/cost, through the
   * existing gateway's generic structured-generation primitive. `result.data`
   * is strictly validated/normalized before anything is persisted.
   */
  private async runExtraction(
    analysis: IJobDescriptionAnalysis,
    organizationId: string
  ): Promise<{ skills: IJobDescriptionSkill[]; aiUsage: IEmployerJobDescriptionSkillsUsage }> {
    const prompt = this.buildPrompt(analysis);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 2000 },
      { organizationId, operation: 'jd-skill-extraction' }
    );

    const skills = this.validateAndNormalizeSkills(result.data);
    const aiUsage = this.computeUsage(result.metadata);
    return { skills, aiUsage };
  }

  /** Compact structured input — only the fields useful for skill extraction, never the raw JD text. */
  private buildPrompt(analysis: IJobDescriptionAnalysis): string {
    const compactInput = {
      jobTitle: analysis.jobTitle,
      mandatoryRequirements: analysis.requirements.mandatory,
      preferredRequirements: analysis.requirements.preferred,
      technicalKeywords: analysis.technicalKeywords,
      toolsTechnologies: analysis.toolsTechnologies,
      softSkillKeywords: analysis.softSkillKeywords,
      domainKnowledge: analysis.domainKnowledge,
      responsibilities: analysis.responsibilities,
      experience: analysis.experience,
    };

    return `You are an expert technical recruiter extracting a normalized, de-duplicated list of skills required for a role, from ALREADY-STRUCTURED job description data (not raw text).

Analyze ONLY the structured data supplied below. Do not invent a skill that is not clearly present or implied by this data.

For each distinct skill you identify, decide:
- "name": a clean, human-facing skill name (e.g. "Node.js", not "nodejs" or "the Node JS framework").
- "category": exactly one of technical | tool | domain | soft_skill | methodology | other.
- "requirement":
  - "mandatory" ONLY when the skill is drawn from mandatoryRequirements (or unambiguously stated as required there).
  - "preferred" ONLY when the skill is drawn from preferredRequirements (or unambiguously nice-to-have there).
  - "inferred" when the skill is clearly needed to perform one of the listed responsibilities, but is not explicitly listed under mandatory or preferred requirements. NEVER upgrade an inferred skill to mandatory.
- "proficiency": exactly one of foundational | intermediate | advanced | expert | unspecified. Only choose a specific level when the data explicitly states it (e.g. "expert in X", "basic Python") or ties years of experience clearly to that exact skill. Do NOT guess a level just because a skill is present — default to "unspecified".
- "importance": exactly one of critical | high | medium | low, based on how central the skill is to the role's core purpose. Reserve "critical" for the rare, clearly core-role requirements — most skills should NOT be critical or even high.
- "evidence": 1-3 short quotes or close paraphrases taken directly from the supplied data fields that justify this skill. Never invent evidence not grounded in the supplied data.
- "aliases": other names for this SAME skill, only when the supplied data itself treats them as equivalent (e.g. both "Node.js" and "NodeJS" appear for the same thing). Do not invent aliases.
- "confidence": 0 to 1, how confident you are this is a real, distinct, correctly-classified skill.

Merge obvious duplicate mentions of the exact same skill within this data (e.g. "Node.js" and "NodeJS" are one skill; list it once with both spellings as aliases). Preserve meaningful distinctions — do NOT merge different skills even when related (e.g. React vs React Native; Java vs JavaScript; SQL vs PostgreSQL are all distinct skills).

Return ONLY a single JSON object with EXACTLY this shape:
{
  "skills": [
    {
      "name": string,
      "category": "technical" | "tool" | "domain" | "soft_skill" | "methodology" | "other",
      "requirement": "mandatory" | "preferred" | "inferred",
      "proficiency": "foundational" | "intermediate" | "advanced" | "expert" | "unspecified",
      "importance": "critical" | "high" | "medium" | "low",
      "evidence": string[],
      "aliases": string[],
      "confidence": number
    }
  ]
}

STRUCTURED JOB DESCRIPTION DATA:
${JSON.stringify(compactInput)}

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /**
   * Strict normalization of untrusted AI JSON. `normalizedName` is ALWAYS
   * computed server-side (never trusted from the model), and duplicates by
   * that identity are merged rather than kept as separate entries.
   */
  private validateAndNormalizeSkills(data: unknown): IJobDescriptionSkill[] {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const rawSkills = Array.isArray(source.skills) ? source.skills : [];

    const asStringArray = (value: unknown, maxItems: number, maxLength: number): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, maxLength))
        .slice(0, maxItems);
    };

    const candidates: IJobDescriptionSkill[] = [];
    for (const raw of rawSkills.slice(0, MAX_SKILLS_FROM_AI)) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;

      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 150) : '';
      if (!name) continue; // required non-empty name

      const category = CATEGORY_VALUES.has(item.category as EmployerJobSkillCategory)
        ? (item.category as EmployerJobSkillCategory)
        : EmployerJobSkillCategory.OTHER;
      // Defaults to the most conservative value on an invalid/missing enum —
      // never silently upgrades to mandatory/critical.
      const requirement = REQUIREMENT_VALUES.has(item.requirement as EmployerJobSkillRequirement)
        ? (item.requirement as EmployerJobSkillRequirement)
        : EmployerJobSkillRequirement.INFERRED;
      const proficiency = PROFICIENCY_VALUES.has(item.proficiency as EmployerJobSkillProficiency)
        ? (item.proficiency as EmployerJobSkillProficiency)
        : EmployerJobSkillProficiency.UNSPECIFIED;
      const importance = IMPORTANCE_VALUES.has(item.importance as EmployerJobSkillImportance)
        ? (item.importance as EmployerJobSkillImportance)
        : EmployerJobSkillImportance.MEDIUM;

      const confidence = Math.min(1, Math.max(0, typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : 0));

      candidates.push({
        name,
        normalizedName: this.computeNormalizedName(name),
        category,
        requirement,
        proficiency,
        importance,
        evidence: asStringArray(item.evidence, MAX_EVIDENCE_PER_SKILL, 300),
        aliases: asStringArray(item.aliases, MAX_ALIASES_PER_SKILL, 100),
        confidence,
      });
    }

    return this.deduplicateByNormalizedName(candidates);
  }

  /**
   * Deterministic identity key — JD-version-local canonicalization ONLY
   * (never a global skill catalog): lowercase, trim, collapse whitespace,
   * and strip a small set of harmless separator punctuation (periods,
   * hyphens, underscores, slashes, spaces) so "Node.js" / "NodeJS" /
   * "Node JS" all normalize to the same identity. Deliberately does NOT
   * touch other characters (+, #, &, etc.) so genuinely distinct skills
   * (React vs React Native, Java vs JavaScript, SQL vs PostgreSQL, C vs
   * C++/C#) are never accidentally merged.
   */
  private computeNormalizedName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[.]/g, '')
      .replace(/[\s\-_/]+/g, '');
  }

  /** Merge duplicates by normalizedName — never inventing facts, only combining what each duplicate already stated. */
  private deduplicateByNormalizedName(skills: IJobDescriptionSkill[]): IJobDescriptionSkill[] {
    const byKey = new Map<string, IJobDescriptionSkill>();

    for (const skill of skills) {
      const existing = byKey.get(skill.normalizedName);
      if (!existing) {
        byKey.set(skill.normalizedName, { ...skill, evidence: [...skill.evidence], aliases: [...skill.aliases] });
        continue;
      }

      const strongerRequirement =
        REQUIREMENT_RANK[skill.requirement] > REQUIREMENT_RANK[existing.requirement] ? skill.requirement : existing.requirement;
      const strongerImportance =
        IMPORTANCE_RANK[skill.importance] > IMPORTANCE_RANK[existing.importance] ? skill.importance : existing.importance;
      // A specified proficiency from either duplicate beats "unspecified" — never invents a level neither duplicate stated.
      const mergedProficiency =
        existing.proficiency !== EmployerJobSkillProficiency.UNSPECIFIED
          ? existing.proficiency
          : skill.proficiency !== EmployerJobSkillProficiency.UNSPECIFIED
          ? skill.proficiency
          : EmployerJobSkillProficiency.UNSPECIFIED;
      const preferNewDisplayFields = skill.confidence > existing.confidence;
      const extraAlias = skill.name.toLowerCase() !== existing.name.toLowerCase() ? [skill.name] : [];

      byKey.set(skill.normalizedName, {
        name: preferNewDisplayFields ? skill.name : existing.name,
        normalizedName: existing.normalizedName,
        category: preferNewDisplayFields ? skill.category : existing.category,
        requirement: strongerRequirement,
        proficiency: mergedProficiency,
        importance: strongerImportance,
        evidence: this.mergeStringArrays(existing.evidence, skill.evidence, MAX_EVIDENCE_PER_SKILL, 300),
        aliases: this.mergeStringArrays(existing.aliases, [...skill.aliases, ...extraAlias], MAX_ALIASES_PER_SKILL, 100),
        confidence: Math.max(existing.confidence, skill.confidence),
      });
    }

    return Array.from(byKey.values());
  }

  private mergeStringArrays(a: string[], b: string[], maxItems: number, maxLength: number): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const raw of [...a, ...b]) {
      const trimmed = raw.trim().slice(0, maxLength);
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
      if (merged.length >= maxItems) break;
    }
    return merged;
  }

  /** Reuses the SAME shared pricing config/formula as 17B/AIUsageService — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerJobDescriptionSkillsUsage {
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

  /** The current JD source is always the highest-version row for the job — same derivation as EmployerJobDescriptionService/17B. */
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

  /** An archived JOB (independent of organization archival) can still have its skills read, but never a new extraction triggered. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its job description skills cannot be extracted');
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

  /** Type guard — JD skills don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Matches the task's exact response shape — never exposes createdByMembershipId/jobId/auth internals. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jdSourceId: doc.jdSourceId.toString(),
      jdVersion: doc.jdVersion,
      analysisId: doc.analysisId.toString(),
      status: doc.status,
      skills: doc.skills ?? [],
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerJobDescriptionSkillsService = new EmployerJobDescriptionSkillsService();
