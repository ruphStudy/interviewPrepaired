import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJob from '../models/EmployerJob.model';
import EmployerJobDescriptionSource from '../models/EmployerJobDescriptionSource.model';
import EmployerJobDescriptionAnalysis, { IJobDescriptionAnalysis } from '../models/EmployerJobDescriptionAnalysis.model';
import EmployerJobDescriptionSkills, { IJobDescriptionSkill } from '../models/EmployerJobDescriptionSkills.model';
import EmployerJobDescriptionCompetencies, {
  IJobDescriptionCompetency,
  IEmployerJobDescriptionCompetenciesUsage,
} from '../models/EmployerJobDescriptionCompetencies.model';
import { EmployerJobStatus } from '../constants/employerJob';
import { EmployerJobDescriptionAnalysisStatus } from '../constants/employerJobDescriptionAnalysis';
import { EmployerJobDescriptionSkillsStatus } from '../constants/employerJobDescriptionSkills';
import {
  EmployerJobDescriptionCompetenciesStatus,
  EmployerJobCompetencyCategory,
  EmployerJobCompetencyImportance,
  MIN_COMPETENCIES,
  MAX_COMPETENCIES,
} from '../constants/employerJobDescriptionCompetencies';
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

/** A validated competency candidate before weight normalization — `rawWeight` is the AI's own (untrusted) proposal, never persisted as-is. */
interface CompetencyCandidate {
  competency: Omit<IJobDescriptionCompetency, 'weight'>;
  rawWeight: number;
  normalizedNameKey: string;
}

const CATEGORY_VALUES = new Set(Object.values(EmployerJobCompetencyCategory));
const IMPORTANCE_VALUES = new Set(Object.values(EmployerJobCompetencyImportance));
const IMPORTANCE_RANK: Record<EmployerJobCompetencyImportance, number> = {
  [EmployerJobCompetencyImportance.CRITICAL]: 4,
  [EmployerJobCompetencyImportance.HIGH]: 3,
  [EmployerJobCompetencyImportance.MEDIUM]: 2,
  [EmployerJobCompetencyImportance.LOW]: 1,
};

const MAX_EVIDENCE_PER_COMPETENCY = 5;
const MAX_SIGNALS_PER_COMPETENCY = 5;
const MAX_SKILL_LINKS_PER_COMPETENCY = 30;
/** A generous upper bound on raw AI output before dedup/capping — the final persisted set is always MIN_COMPETENCIES..MAX_COMPETENCIES. */
const MAX_RAW_COMPETENCIES_CONSIDERED = MAX_COMPETENCIES * 2;

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — same convention as AIUsageService.recordAIUsage / 17B / 17C
}

/**
 * Thrown internally when validation yields fewer than MIN_COMPETENCIES
 * usable competencies — caught by the caller and treated exactly like any
 * other generation failure (status -> failed, safe errorMessage, 502).
 */
class InsufficientCompetenciesError extends Error {}

/**
 * Competency blueprint generation from ALREADY-COMPLETED 17B analysis + 17C
 * skills (17D) — never re-parses raw JD text, never re-derives skills. Uses
 * ONLY the existing Sprint 2 AI Gateway (`getAIService().generateStructured`);
 * never a provider SDK directly. Cost reuses the same shared
 * `getModelPricing` config as 17B/17C — no parallel pricing calculator.
 * This is job/JD-version competency intelligence only — explicitly NOT an
 * interview-question/assessment blueprint, NOT candidate scoring, and NOT a
 * global/cross-company competency catalog (all later sprints).
 *
 * Concurrency safety mirrors 17B/17C exactly: the unique
 * {organizationId, jobId, jdSourceId} index on this model doubles as the
 * claim (first `create()` wins; E11000 branches on existing status; FAILED
 * is revived via compare-and-swap for a single retrying racer). No
 * queue/worker infrastructure.
 */
export class EmployerJobDescriptionCompetencyService {
  /** GET .../jd/competencies — the CURRENT JD source's competencies, or null if never generated. Read-only, so archived org/job remain readable. */
  async getCurrentCompetencies(
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

    const competencies = await EmployerJobDescriptionCompetencies.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    }).lean();

    return competencies ? this.toDetail(competencies) : null;
  }

  /** GET .../jd/:jdSourceId/competencies — competencies for one EXACT source version, or null if that version's competencies were never generated. The source itself must exist in this exact org+job, or 404. */
  async getCompetenciesForSource(
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

    const competencies = await EmployerJobDescriptionCompetencies.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: source._id,
    }).lean();

    return competencies ? this.toDetail(competencies) : null;
  }

  /**
   * POST .../jd/competencies/generate — generates competencies for the
   * CURRENT JD source only, from its already-COMPLETED 17B analysis and
   * 17C skills. Requires both to exist and be COMPLETED — never re-parses
   * raw JD, never re-extracts skills.
   */
  async generateCurrentCompetencies(
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
      throw new ApiError(409, 'Analyze the job description before generating competencies');
    }

    const skillsDoc = await EmployerJobDescriptionSkills.findOne({
      organizationId: organization._id,
      jobId: job._id,
      jdSourceId: currentSource._id,
    });
    if (!skillsDoc || skillsDoc.status !== EmployerJobDescriptionSkillsStatus.COMPLETED || skillsDoc.skills.length === 0) {
      throw new ApiError(409, 'Extract skills before generating competencies');
    }

    const claim = await this.claimGeneration(
      organization._id,
      job._id,
      currentSource._id as Types.ObjectId,
      currentSource.version,
      analysisDoc._id as Types.ObjectId,
      skillsDoc._id as Types.ObjectId,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed competency blueprint already exists for this exact source version — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    // From here, `claim.row` is exclusively ours (status: processing).
    try {
      const { competencies, aiUsage } = await this.runGeneration(analysisDoc.analysis, skillsDoc.skills, organization._id.toString());
      claim.row.competencies = competencies;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerJobDescriptionCompetenciesStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerJobDescriptionCompetencyService] Competency generation failed for job ${job._id.toString()} source ${currentSource._id.toString()}`,
        error
      );
      claim.row.status = EmployerJobDescriptionCompetenciesStatus.FAILED;
      claim.row.errorMessage = 'Failed to generate competencies for this job description. Please try again.';
      await claim.row.save();
      throw new ApiError(502, 'Failed to generate job description competencies');
    }
  }

  /**
   * Wins (or recovers) the exclusive right to generate competencies for
   * `jdSourceId`. Returns either an already-COMPLETED row (caller must not
   * call AI) or a row this caller now exclusively owns with status
   * PROCESSING. Throws 409 for an already-in-progress concurrent request,
   * or when a FAILED row's retry is lost to another concurrent racer.
   */
  private async claimGeneration(
    organizationId: Types.ObjectId,
    jobId: Types.ObjectId,
    jdSourceId: Types.ObjectId,
    jdVersion: number,
    analysisId: Types.ObjectId,
    skillsId: Types.ObjectId,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerJobDescriptionCompetencies>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerJobDescriptionCompetencies.create({
        organizationId,
        jobId,
        jdSourceId,
        jdVersion,
        analysisId,
        skillsId,
        status: EmployerJobDescriptionCompetenciesStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await EmployerJobDescriptionCompetencies.findOne({ organizationId, jobId, jdSourceId });
    if (!existing) {
      throw new ApiError(409, 'Competency generation is already being processed — please try again shortly');
    }

    if (existing.status === EmployerJobDescriptionCompetenciesStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerJobDescriptionCompetenciesStatus.PROCESSING) {
      throw new ApiError(409, 'Competency generation is already in progress for this job description');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerJobDescriptionCompetencies.findOneAndUpdate(
      { _id: existing._id, status: EmployerJobDescriptionCompetenciesStatus.FAILED },
      {
        $set: { status: EmployerJobDescriptionCompetenciesStatus.PROCESSING },
        $unset: { competencies: '', aiUsage: '', errorMessage: '' },
      },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Competency generation is already in progress for this job description');
    }
    return { row: revived, alreadyCompleted: false };
  }

  /**
   * The ONLY place this service calls AI. Sends COMPACT structured input
   * (role context + requirements + the completed skill list) — never the
   * raw JD text, never re-derived skills. `result.data` is strictly
   * validated/normalized before anything is persisted.
   */
  private async runGeneration(
    analysis: IJobDescriptionAnalysis,
    skills: IJobDescriptionSkill[],
    organizationId: string
  ): Promise<{ competencies: IJobDescriptionCompetency[]; aiUsage: IEmployerJobDescriptionCompetenciesUsage }> {
    const prompt = this.buildPrompt(analysis, skills);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 2000 },
      { organizationId, operation: 'jd-competency-generation' }
    );

    const validSkillNamesByLower = new Map(skills.map((s) => [s.name.trim().toLowerCase(), s.name]));
    const competencies = this.validateAndNormalizeCompetencies(result.data, validSkillNamesByLower);
    const aiUsage = this.computeUsage(result.metadata);
    return { competencies, aiUsage };
  }

  /** Compact structured input — role context + requirements + the already-completed skill list. Never the raw JD text. */
  private buildPrompt(analysis: IJobDescriptionAnalysis, skills: IJobDescriptionSkill[]): string {
    const compactInput = {
      jobTitle: analysis.jobTitle,
      rolePurpose: analysis.rolePurpose,
      responsibilities: analysis.responsibilities,
      mandatoryRequirements: analysis.requirements.mandatory,
      preferredRequirements: analysis.requirements.preferred,
      skills: skills.map((s) => ({ name: s.name, category: s.category, requirement: s.requirement, importance: s.importance })),
    };

    return `You are an expert technical hiring lead defining the competency model for a role, from ALREADY-STRUCTURED role data and an already-extracted skill list (not raw job description text).

A COMPETENCY is BROADER than a single skill — it is a capability area an interviewer would assess, such as "Backend Engineering", "Distributed Systems Problem Solving", or "Stakeholder Communication". Do NOT simply create one competency per skill in the supplied list — group related skills and responsibilities into ${MIN_COMPETENCIES}-${MAX_COMPETENCIES} meaningful competencies that together represent what matters for this role.

For each competency:
- "name": a short, clear competency name (broader than one skill).
- "description": 1-2 sentences describing what this competency covers for this specific role.
- "category": exactly one of technical | problem_solving | system_design | communication | leadership | domain | execution | collaboration | other.
- "importance": exactly one of critical | high | medium | low, based on how central this competency is to succeeding in the role. Reserve "critical" for the few competencies that are truly core — most should NOT be critical.
- "weight": a number representing this competency's relative importance versus the OTHERS in your list (e.g. on a rough 0-100 scale summing close to 100 across all competencies you return) — critical/high competencies should generally carry more weight than medium/low ones. Do not make every competency equal by default; only do so if the data genuinely gives no basis to differentiate them.
- "skillNames": names of skills from the supplied skill list that belong to this competency. Use the skill names EXACTLY as given in the supplied list — do not invent or rename skills.
- "evidence": 1-3 short quotes or close paraphrases from the supplied data (responsibilities/requirements/skills) that justify this competency. Never invent evidence not grounded in the supplied data.
- "interviewSignals": 1-3 short descriptions of OBSERVABLE EVIDENCE an interviewer should look for when assessing this competency (e.g. "can explain trade-offs between consistency and availability"). These are things to look for, NOT interview questions to ask.
- "confidence": 0 to 1, how confident you are this competency is well-formed and grounded in the supplied data.

Return ONLY a single JSON object with EXACTLY this shape:
{
  "competencies": [
    {
      "name": string,
      "description": string,
      "category": "technical" | "problem_solving" | "system_design" | "communication" | "leadership" | "domain" | "execution" | "collaboration" | "other",
      "importance": "critical" | "high" | "medium" | "low",
      "weight": number,
      "skillNames": string[],
      "evidence": string[],
      "interviewSignals": string[],
      "confidence": number
    }
  ]
}

ROLE DATA AND SKILLS:
${JSON.stringify(compactInput)}

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /**
   * Strict normalization of untrusted AI JSON. `skillNames` are restricted
   * to actual 17C skill names (case-insensitive match; unknown references
   * dropped). Duplicates are merged by a transient (never persisted)
   * normalized-name key. Weights are ALWAYS recomputed server-side to sum
   * to exactly 100 — the AI's proposed weight is only ever an input signal,
   * never trusted as the final stored value. Throws
   * InsufficientCompetenciesError (treated as a generation failure by the
   * caller) if fewer than MIN_COMPETENCIES usable competencies remain.
   */
  private validateAndNormalizeCompetencies(
    data: unknown,
    validSkillNamesByLower: Map<string, string>
  ): IJobDescriptionCompetency[] {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    const rawCompetencies = Array.isArray(source.competencies) ? source.competencies : [];

    const asStringArray = (value: unknown, maxItems: number, maxLength: number): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, maxLength))
        .slice(0, maxItems);
    };

    const candidates: CompetencyCandidate[] = [];
    for (const raw of rawCompetencies.slice(0, MAX_RAW_COMPETENCIES_CONSIDERED)) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;

      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 150) : '';
      const description = typeof item.description === 'string' ? item.description.trim().slice(0, 500) : '';
      if (!name || !description) continue; // both required non-empty

      const category = CATEGORY_VALUES.has(item.category as EmployerJobCompetencyCategory)
        ? (item.category as EmployerJobCompetencyCategory)
        : EmployerJobCompetencyCategory.OTHER;
      const importance = IMPORTANCE_VALUES.has(item.importance as EmployerJobCompetencyImportance)
        ? (item.importance as EmployerJobCompetencyImportance)
        : EmployerJobCompetencyImportance.MEDIUM;
      const confidence = Math.min(
        1,
        Math.max(0, typeof item.confidence === 'number' && Number.isFinite(item.confidence) ? item.confidence : 0)
      );
      const rawWeight = typeof item.weight === 'number' && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 0;

      const rawSkillNames = Array.isArray(item.skillNames) ? item.skillNames : [];
      const skillNames = rawSkillNames
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => validSkillNamesByLower.get(s.trim().toLowerCase()))
        .filter((s): s is string => !!s)
        .filter((s, index, arr) => arr.indexOf(s) === index) // de-dup within this competency
        .slice(0, MAX_SKILL_LINKS_PER_COMPETENCY);

      candidates.push({
        competency: {
          name,
          description,
          category,
          importance,
          skillNames,
          evidence: asStringArray(item.evidence, MAX_EVIDENCE_PER_COMPETENCY, 300),
          interviewSignals: asStringArray(item.interviewSignals, MAX_SIGNALS_PER_COMPETENCY, 300),
          confidence,
        },
        rawWeight,
        normalizedNameKey: this.computeNormalizedName(name),
      });
    }

    const deduped = this.deduplicateCompetencies(candidates);
    const capped = deduped.sort((a, b) => b.competency.confidence - a.competency.confidence).slice(0, MAX_COMPETENCIES);

    if (capped.length < MIN_COMPETENCIES) {
      throw new InsufficientCompetenciesError('AI did not return enough valid competencies');
    }

    const weights = this.normalizeWeights(capped.map((c) => c.rawWeight));
    return capped.map((c, index) => ({ ...c.competency, weight: weights[index] }));
  }

  /**
   * Deterministic identity key for dedup only — never persisted (the
   * competency shape has no `normalizedName` field). Same conservative
   * scheme as 17C's skill normalization: lowercase, trim, strip harmless
   * separator punctuation, collapse whitespace.
   */
  private computeNormalizedName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[.]/g, '')
      .replace(/[\s\-_/]+/g, '');
  }

  /** Merge duplicate competencies by normalized name — never inventing facts, only combining what each duplicate already stated. */
  private deduplicateCompetencies(candidates: CompetencyCandidate[]): CompetencyCandidate[] {
    const byKey = new Map<string, CompetencyCandidate>();

    for (const candidate of candidates) {
      const existing = byKey.get(candidate.normalizedNameKey);
      if (!existing) {
        byKey.set(candidate.normalizedNameKey, {
          ...candidate,
          competency: {
            ...candidate.competency,
            evidence: [...candidate.competency.evidence],
            interviewSignals: [...candidate.competency.interviewSignals],
            skillNames: [...candidate.competency.skillNames],
          },
        });
        continue;
      }

      const preferNew = candidate.competency.confidence > existing.competency.confidence;
      const mergedImportance =
        IMPORTANCE_RANK[candidate.competency.importance] > IMPORTANCE_RANK[existing.competency.importance]
          ? candidate.competency.importance
          : existing.competency.importance;

      byKey.set(candidate.normalizedNameKey, {
        normalizedNameKey: existing.normalizedNameKey,
        // Max, not sum — merging duplicates must never inflate a competency's proposed weight beyond what either duplicate actually proposed.
        rawWeight: Math.max(existing.rawWeight, candidate.rawWeight),
        competency: {
          name: preferNew ? candidate.competency.name : existing.competency.name,
          description: preferNew ? candidate.competency.description : existing.competency.description,
          category: preferNew ? candidate.competency.category : existing.competency.category,
          importance: mergedImportance,
          skillNames: this.mergeStringArrays(existing.competency.skillNames, candidate.competency.skillNames, MAX_SKILL_LINKS_PER_COMPETENCY, 150),
          evidence: this.mergeStringArrays(existing.competency.evidence, candidate.competency.evidence, MAX_EVIDENCE_PER_COMPETENCY, 300),
          interviewSignals: this.mergeStringArrays(
            existing.competency.interviewSignals,
            candidate.competency.interviewSignals,
            MAX_SIGNALS_PER_COMPETENCY,
            300
          ),
          confidence: Math.max(existing.competency.confidence, candidate.competency.confidence),
        },
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

  /**
   * Backend-authoritative weight normalization — ALWAYS recomputes from the
   * AI's raw proposals (proportionally, never trusted as final), using the
   * largest-remainder method for deterministic integer rounding so the
   * stored total is exactly 100. Any entry that would floor to 0 is bumped
   * to a minimum of 1 by taking from the current largest entry, preserving
   * the total.
   */
  private normalizeWeights(rawWeights: number[]): number[] {
    const n = rawWeights.length;
    if (n === 0) return [];

    const sanitized = rawWeights.map((w) => Math.max(0, w));
    const sum = sanitized.reduce((a, b) => a + b, 0);
    // No usable AI weights at all -> distribute evenly rather than leaving everything at 0.
    const proportional = sum > 0 ? sanitized.map((w) => (w / sum) * 100) : sanitized.map(() => 100 / n);

    const floored = proportional.map((w) => Math.floor(w));
    const flooredSum = floored.reduce((a, b) => a + b, 0);
    const remainder = 100 - flooredSum;

    // Largest-remainder method: give the leftover whole points to the
    // entries with the biggest fractional part, tie-broken deterministically
    // by original index.
    const fractionalParts = proportional
      .map((w, index) => ({ index, frac: w - floored[index] }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index);

    const result = [...floored];
    for (let k = 0; k < remainder; k++) {
      result[fractionalParts[k % n].index] += 1;
    }

    // Minimum sensible weight > 0 — repair any zero-weight entries by
    // taking 1 point from the currently-largest entry, preserving total=100.
    for (let i = 0; i < n; i++) {
      if (result[i] > 0) continue;
      let maxIndex = 0;
      for (let j = 1; j < n; j++) {
        if (result[j] > result[maxIndex]) maxIndex = j;
      }
      if (maxIndex !== i && result[maxIndex] > 1) {
        result[maxIndex] -= 1;
        result[i] = 1;
      }
    }

    return result;
  }

  /** Reuses the SAME shared pricing config/formula as 17B/17C/AIUsageService — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerJobDescriptionCompetenciesUsage {
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

  /** The current JD source is always the highest-version row for the job — same derivation as EmployerJobDescriptionService/17B/17C. */
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

  /** An archived JOB (independent of organization archival) can still have its competencies read, but never a new generation triggered. */
  private assertJobMutable(job: JobRef): void {
    if (job.status === EmployerJobStatus.ARCHIVED) {
      throw new ApiError(409, 'Job is archived and its job description competencies cannot be generated');
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

  /** Type guard — JD competencies don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes createdByMembershipId/auth internals — same convention as 17C's response shape. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      jdSourceId: doc.jdSourceId.toString(),
      jdVersion: doc.jdVersion,
      analysisId: doc.analysisId.toString(),
      skillsId: doc.skillsId.toString(),
      status: doc.status,
      competencies: doc.competencies ?? [],
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerJobDescriptionCompetencyService = new EmployerJobDescriptionCompetencyService();
