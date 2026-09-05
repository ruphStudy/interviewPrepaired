import fs from 'fs';
import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import EmployerCandidateResumeAnalysis, {
  ICandidateResumeProfile,
  ICandidateProfileName,
  ICandidateProfileContact,
  ICandidateProfileExperience,
  ICandidateProfileEducation,
  ICandidateProfileProject,
  IEmployerCandidateResumeAnalysisUsage,
} from '../models/EmployerCandidateResumeAnalysis.model';
import {
  EmployerCandidateResumeAnalysisStatus,
  MAX_PROFILE_EXPERIENCE_ENTRIES,
  MAX_PROFILE_EDUCATION_ENTRIES,
  MAX_PROFILE_PROJECT_ENTRIES,
} from '../constants/employerCandidateResumeAnalysis';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { getModelPricing } from '../config/openaiPricing';
import { getAIService } from '../ai';
import type { AIResponseMetadata } from '../ai';
import { resolveStoredResumeAbsolutePath } from '../utils/candidateResumeStorage';
import { resumeTextExtractionService } from './ResumeTextExtractionService';
import { ApiError } from '../utils/ApiError';

interface CandidateRef {
  _id: Types.ObjectId;
  status: EmployerCandidateStatus;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8; // 8dp — same convention as EmployerJobDescriptionAnalysisService/AIUsageService
}

/**
 * Resume-to-structured-profile parsing (18C) — uses ONLY the existing
 * Sprint 2 AI Gateway (`getAIService().generateStructured`); never
 * instantiates a provider SDK directly. Extraction reuses the same
 * mammoth/pdf-parse primitives QuestionFileParserService already uses (via
 * ResumeTextExtractionService), never a new heavy dependency — legacy .doc
 * is rejected with a 422 rather than adding one. Cost is computed via the
 * same shared `getModelPricing` config every other AI-backed sprint uses.
 *
 * Concurrency safety mirrors EmployerJobDescriptionAnalysisService (17B)
 * exactly: the unique {organizationId, candidateId, resumeSourceId} index
 * on EmployerCandidateResumeAnalysis doubles as the claim — the first
 * `create()` for a given resume source version wins; a concurrent
 * duplicate insert's E11000 is used to detect and react to whatever state
 * already exists (completed -> return it; processing -> reject as
 * in-progress; failed -> revive via compare-and-swap for a single retrying
 * racer). No queue/worker infrastructure.
 *
 * Nothing here ever writes back to EmployerCandidate, creates an
 * application/job linkage, or scores/ranks the candidate — pure extraction.
 */
export class EmployerCandidateResumeAnalysisService {
  /** GET .../resumes/analysis — the CURRENT resume's analysis, or null if never parsed. Read-only, so archived org/candidate remain readable. */
  async getCurrentAnalysis(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const currentSource = await this.getCurrentResumeSource(organization._id, candidate._id);
    if (!currentSource) {
      return null;
    }

    const analysis = await EmployerCandidateResumeAnalysis.findOne({
      organizationId: organization._id,
      candidateId: candidate._id,
      resumeSourceId: currentSource._id,
    }).lean();

    return analysis ? this.toDetail(analysis) : null;
  }

  /** GET .../resumes/:resumeSourceId/analysis — analysis for one EXACT resume version, or null if that version was never parsed. The resume itself must exist in this exact org+candidate, or 404. */
  async getAnalysisForSource(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    resumeSourceId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const source = await EmployerCandidateResumeSource.findOne({
      _id: resumeSourceId,
      organizationId: organization._id,
      candidateId: candidate._id,
    }).select('_id');
    if (!source) {
      throw new ApiError(404, 'Resume not found');
    }

    const analysis = await EmployerCandidateResumeAnalysis.findOne({
      organizationId: organization._id,
      candidateId: candidate._id,
      resumeSourceId: source._id,
    }).lean();

    return analysis ? this.toDetail(analysis) : null;
  }

  /**
   * POST .../resumes/analyze — parses the CURRENT resume only. If a
   * completed analysis already exists for that exact resume version,
   * returns it WITHOUT calling AI again. If a failed analysis exists,
   * retries. Never parses an old historical version through this endpoint.
   */
  async analyzeCurrentResume(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    actorMembershipId: string,
    candidateId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);
    this.assertCandidateMutable(candidate);

    const currentSource = await this.getCurrentResumeSource(organization._id, candidate._id);
    if (!currentSource) {
      throw new ApiError(409, 'This candidate has no resume to analyze yet');
    }

    const claim = await this.claimAnalysis(
      organization._id,
      candidate._id,
      currentSource._id as Types.ObjectId,
      currentSource.version,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed analysis already exists for this exact resume version — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    // From here, `claim.row` is exclusively ours (status: processing).
    try {
      const absolutePath = resolveStoredResumeAbsolutePath(currentSource.storedFileName);
      const buffer = await fs.promises.readFile(absolutePath);
      const resumeText = await resumeTextExtractionService.extractText(buffer, currentSource.fileExtension);

      const { profile, aiUsage } = await this.runAnalysis(resumeText, organization._id.toString());
      claim.row.profile = profile;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerCandidateResumeAnalysisStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerCandidateResumeAnalysisService] Analysis failed for candidate ${candidate._id.toString()} resume ${currentSource._id.toString()}`,
        error
      );
      const isUnreadableFile = error instanceof ApiError && error.statusCode === 422;
      claim.row.status = EmployerCandidateResumeAnalysisStatus.FAILED;
      claim.row.errorMessage = isUnreadableFile ? error.message : 'Failed to analyze this resume. Please try again.';
      await claim.row.save();
      if (isUnreadableFile) {
        throw error;
      }
      throw new ApiError(502, 'Failed to analyze resume');
    }
  }

  /**
   * Wins (or recovers) the exclusive right to parse `resumeSourceId`.
   * Returns either an already-COMPLETED row (caller must not call AI) or a
   * row this caller now exclusively owns with status PROCESSING (caller
   * must call AI and then save the outcome). Throws 409 for an
   * already-in-progress concurrent request, or when a FAILED row's retry is
   * lost to another concurrent racer.
   */
  private async claimAnalysis(
    organizationId: Types.ObjectId,
    candidateId: Types.ObjectId,
    resumeSourceId: Types.ObjectId,
    resumeVersion: number,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerCandidateResumeAnalysis>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerCandidateResumeAnalysis.create({
        organizationId,
        candidateId,
        resumeSourceId,
        resumeVersion,
        status: EmployerCandidateResumeAnalysisStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    // Someone already has (or had) a row for this exact resume version.
    const existing = await EmployerCandidateResumeAnalysis.findOne({ organizationId, candidateId, resumeSourceId });
    if (!existing) {
      throw new ApiError(409, 'Analysis is already being processed — please try again shortly');
    }

    if (existing.status === EmployerCandidateResumeAnalysisStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerCandidateResumeAnalysisStatus.PROCESSING) {
      throw new ApiError(409, 'Analysis is already in progress for this resume');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerCandidateResumeAnalysis.findOneAndUpdate(
      { _id: existing._id, status: EmployerCandidateResumeAnalysisStatus.FAILED },
      { $set: { status: EmployerCandidateResumeAnalysisStatus.PROCESSING }, $unset: { profile: '', aiUsage: '', errorMessage: '' } },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Analysis is already in progress for this resume');
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
    resumeText: string,
    organizationId: string
  ): Promise<{ profile: ICandidateResumeProfile; aiUsage: IEmployerCandidateResumeAnalysisUsage }> {
    const prompt = this.buildPrompt(resumeText);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 3000 },
      { organizationId, operation: 'candidate-resume-parsing' }
    );

    const profile = this.validateProfile(result.data);
    const aiUsage = this.computeUsage(result.metadata);
    return { profile, aiUsage };
  }

  /**
   * Extract ONLY facts stated or unambiguously implied by the resume text —
   * never invent employment/education/skills. This is extraction, not
   * evaluation: the candidate is never scored or judged for fit here.
   */
  private buildPrompt(resumeText: string): string {
    return `You are an expert resume/CV parser.

Extract ONLY facts that are explicitly stated or unambiguously implied by the resume text supplied below. Do not invent, assume, guess, or fabricate any employment history, education, skill, certification, project, or contact detail that is not actually present in the text. If a field cannot be determined, omit it, use null, or return an empty array as appropriate.

Do not evaluate, score, rank, or judge the candidate's fit for any role — this is extraction only, never an assessment.

Preserve the chronological order of experience and education entries exactly as they appear in the resume.

"confidence.overall" is a number from 0 to 1 reflecting how confident you are in this extraction given how clear and complete the resume text is. "confidence.ambiguousSections" should list short section labels (e.g. "experience", "education") ONLY where the wording was genuinely unclear or incomplete — leave it empty if the resume was clear.

Return ONLY a single JSON object with EXACTLY this shape (omit a field, or use null/an empty array, when the text does not support a value — never fabricate):
{
  "name": { "fullName": string|null, "firstName": string|null, "lastName": string|null } | null,
  "contact": { "email": string|null, "phone": string|null, "location": string|null, "linkedinUrl": string|null, "githubUrl": string|null, "portfolioUrl": string|null } | null,
  "headline": string|null,
  "summary": string|null,
  "totalExperienceYears": number|null,
  "experience": [{ "company": string|null, "title": string|null, "location": string|null, "startDate": string|null, "endDate": string|null, "isCurrent": boolean|null, "durationMonths": number|null, "responsibilities": string[], "achievements": string[], "technologies": string[] }],
  "education": [{ "institution": string|null, "degree": string|null, "field": string|null, "startYear": number|null, "endYear": number|null }],
  "skills": string[],
  "toolsTechnologies": string[],
  "certifications": string[],
  "projects": [{ "name": string|null, "description": string|null, "technologies": string[] }],
  "languages": string[],
  "confidence": { "overall": number, "ambiguousSections": string[] }
}

RESUME TEXT:
"""
${resumeText}
"""

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /** Strict normalization of untrusted AI JSON — every field is defensively coerced/clamped/truncated/capped; nothing from the model's raw output is trusted as-is, and none of the ids in this row ever come from the AI response. */
  private validateProfile(data: unknown): ICandidateResumeProfile {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

    const asString = (value: unknown, maxLength = 300): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
    const asStringArray = (value: unknown, maxItems = 50, maxLength = 200): string[] => {
      if (!Array.isArray(value)) return [];
      return value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, maxLength))
        .slice(0, maxItems);
    };
    /** Case-insensitive dedupe, applied only to the flat lists the spec calls out (skills/toolsTechnologies/certifications/languages). */
    const asDedupedStringArray = (value: unknown, maxItems = 60, maxLength = 100): string[] => {
      const candidates = asStringArray(value, maxItems * 4, maxLength);
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of candidates) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(item);
        if (result.length >= maxItems) break;
      }
      return result;
    };
    const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    const asNonNegativeNumber = (value: unknown): number | undefined => {
      const n = asNumber(value);
      return n !== undefined && n >= 0 ? n : undefined;
    };
    const asYear = (value: unknown): number | undefined => {
      const n = asNumber(value);
      if (n === undefined) return undefined;
      const rounded = Math.round(n);
      return rounded >= 1900 && rounded <= 2100 ? rounded : undefined;
    };
    const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);
    const asObject = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

    const nameRaw = source.name && typeof source.name === 'object' ? asObject(source.name) : null;
    let name: ICandidateProfileName | undefined;
    if (nameRaw) {
      const candidateName: ICandidateProfileName = {
        fullName: asString(nameRaw.fullName, 150),
        firstName: asString(nameRaw.firstName, 100),
        lastName: asString(nameRaw.lastName, 100),
      };
      name = Object.values(candidateName).some((value) => value !== undefined) ? candidateName : undefined;
    }

    const contactRaw = source.contact && typeof source.contact === 'object' ? asObject(source.contact) : null;
    let contact: ICandidateProfileContact | undefined;
    if (contactRaw) {
      const candidateContact: ICandidateProfileContact = {
        email: asString(contactRaw.email, 254),
        phone: asString(contactRaw.phone, 30),
        location: asString(contactRaw.location, 200),
        linkedinUrl: asString(contactRaw.linkedinUrl, 300),
        githubUrl: asString(contactRaw.githubUrl, 300),
        portfolioUrl: asString(contactRaw.portfolioUrl, 300),
      };
      contact = Object.values(candidateContact).some((value) => value !== undefined) ? candidateContact : undefined;
    }

    const experienceRaw = Array.isArray(source.experience) ? source.experience : [];
    const experience: ICandidateProfileExperience[] = experienceRaw.slice(0, MAX_PROFILE_EXPERIENCE_ENTRIES).map((entryRaw) => {
      const entry = asObject(entryRaw);
      return {
        company: asString(entry.company, 150),
        title: asString(entry.title, 150),
        location: asString(entry.location, 200),
        startDate: asString(entry.startDate, 50),
        endDate: asString(entry.endDate, 50),
        isCurrent: asBoolean(entry.isCurrent),
        durationMonths: asNonNegativeNumber(entry.durationMonths),
        responsibilities: asStringArray(entry.responsibilities, 30, 500),
        achievements: asStringArray(entry.achievements, 20, 500),
        technologies: asStringArray(entry.technologies, 40, 100),
      };
    });

    const educationRaw = Array.isArray(source.education) ? source.education : [];
    const education: ICandidateProfileEducation[] = educationRaw.slice(0, MAX_PROFILE_EDUCATION_ENTRIES).map((entryRaw) => {
      const entry = asObject(entryRaw);
      return {
        institution: asString(entry.institution, 200),
        degree: asString(entry.degree, 150),
        field: asString(entry.field, 150),
        startYear: asYear(entry.startYear),
        endYear: asYear(entry.endYear),
      };
    });

    const projectsRaw = Array.isArray(source.projects) ? source.projects : [];
    const projects: ICandidateProfileProject[] = projectsRaw.slice(0, MAX_PROFILE_PROJECT_ENTRIES).map((entryRaw) => {
      const entry = asObject(entryRaw);
      return {
        name: asString(entry.name, 200),
        description: asString(entry.description, 1000),
        technologies: asStringArray(entry.technologies, 40, 100),
      };
    });

    const confidenceRaw = asObject(source.confidence);
    let overall = asNumber(confidenceRaw.overall) ?? 0;
    overall = Math.min(1, Math.max(0, overall));

    return {
      name,
      contact,
      headline: asString(source.headline, 200),
      summary: asString(source.summary, 2000),
      totalExperienceYears: asNonNegativeNumber(source.totalExperienceYears),
      experience,
      education,
      skills: asDedupedStringArray(source.skills, 60, 100),
      toolsTechnologies: asDedupedStringArray(source.toolsTechnologies, 60, 100),
      certifications: asDedupedStringArray(source.certifications, 30, 150),
      projects,
      languages: asDedupedStringArray(source.languages, 20, 50),
      confidence: {
        overall,
        ambiguousSections: asStringArray(confidenceRaw.ambiguousSections, 20, 100),
      },
    };
  }

  /** Reuses the SAME shared pricing config/formula every other AI-backed sprint uses — never a parallel pricing calculator — just persisted into this model's own single-call usage shape. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerCandidateResumeAnalysisUsage {
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

  /** The current resume is always the highest-version row for the candidate — same derivation EmployerCandidateResumeService uses for its own `current`. */
  private async getCurrentResumeSource(organizationId: Types.ObjectId, candidateId: Types.ObjectId) {
    return EmployerCandidateResumeSource.findOne({ organizationId, candidateId }).sort({ version: -1 });
  }

  /** Exact {_id, organizationId} match only — never findById(candidateId) alone. */
  private async getCandidateInOrganization(organizationId: Types.ObjectId, candidateId: string): Promise<CandidateRef> {
    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('_id status').lean();
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    return { _id: candidate._id as Types.ObjectId, status: candidate.status };
  }

  /** An archived candidate's resume analyses remain readable, but no new parse can be triggered — restore it to active first. */
  private assertCandidateMutable(candidate: CandidateRef): void {
    if (candidate.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'This candidate is archived — analyzing a resume is disabled');
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

  /** Type guard — candidate resume analysis doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes provider secrets/raw error dumps — `errorMessage` is always the short, safe message this service itself wrote. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      candidateId: doc.candidateId.toString(),
      resumeSourceId: doc.resumeSourceId.toString(),
      resumeVersion: doc.resumeVersion,
      status: doc.status,
      profile: doc.profile ?? null,
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdByMembershipId: doc.createdByMembershipId.toString(),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerCandidateResumeAnalysisService = new EmployerCandidateResumeAnalysisService();
