import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerJobApplication from '../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../constants/employerJobApplication';
import { employerCandidateShortlistService } from './EmployerCandidateShortlistService';
import { employerCandidateScreeningService } from './EmployerCandidateScreeningService';
import { EmployerCandidateScreeningStatus } from '../constants/employerCandidateScreening';
import { IScreeningResult } from '../models/EmployerCandidateScreening.model';
import { employerCandidateScreeningScoreService } from './EmployerCandidateScreeningScoreService';
import { IScreeningScore } from '../models/EmployerCandidateScreeningScore.model';
import { employerCandidateScreeningGapService } from './EmployerCandidateScreeningGapService';
import { IScreeningGap } from '../models/EmployerCandidateScreeningGap.model';
import EmployerJobIntelligenceSnapshot, { IJobIntelligenceSnapshot } from '../models/EmployerJobIntelligenceSnapshot.model';
import EmployerInterviewBlueprint, {
  IInterviewBlueprint,
  IBlueprintSection,
  IBlueprintQuestionPlanItem,
  IEmployerInterviewBlueprintUsage,
} from '../models/EmployerInterviewBlueprint.model';
import {
  EmployerInterviewBlueprintStatus,
  EmployerInterviewBlueprintSectionCategory,
  EmployerInterviewBlueprintDifficulty,
  MIN_ESTIMATED_DURATION_MINUTES,
  MAX_ESTIMATED_DURATION_MINUTES,
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  MIN_SECTIONS,
  MAX_SECTIONS,
  MIN_SECTION_DURATION_MINUTES,
  MAX_SECTION_DURATION_MINUTES,
  MAX_QUESTION_PLAN_PER_SECTION,
  MAX_TOTAL_PLANNED_QUESTIONS,
  DURATION_RESCALE_THRESHOLD_RATIO,
} from '../constants/employerInterviewBlueprint';
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
 * Structured interview-plan generation for a shortlisted application
 * (20A) — question INTENTS/planning slots only, never final candidate-
 * facing questions, never an interview session/invitation (20B/20C/20D).
 * Job truth is ONLY the finalized JD Intelligence Snapshot (17E); candidate
 * context is ONLY the structured 19A screening result + 19B explainable
 * score + (optional) 19C gap analysis — never raw JD/resume text, never
 * demographic/contact information, never recruiter notes or application
 * source attribution.
 *
 * Reuses the EXISTING 19A/19B/19C "current applicable" resolution methods
 * (`getCurrentScreening`/`getScore`/`getGaps`) rather than re-deriving that
 * logic a fourth time, and the EXISTING 19E shortlist service to confirm a
 * human shortlist decision exists. Concurrency safety mirrors
 * EmployerJobDescriptionAnalysisService (17B) / EmployerCandidateResumeAnalysisService
 * (18C) / EmployerCandidateScreeningService (19A): the unique
 * {organizationId, applicationId, screeningId} index on
 * EmployerInterviewBlueprint doubles as the claim.
 */
export class EmployerInterviewBlueprintService {
  /** GET .../interview-blueprint — the blueprint for the CURRENT applicable screening, or null if never generated for that exact screening. Read-only, so an archived organization/application remains readable. */
  async getCurrentBlueprint(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<Record<string, unknown> | null> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const screeningDetail = await employerCandidateScreeningService.getCurrentScreening(organizationId, actingRole, applicationId);
    if (!screeningDetail || screeningDetail.status !== EmployerCandidateScreeningStatus.COMPLETED) {
      return null;
    }

    const blueprint = await EmployerInterviewBlueprint.findOne({
      organizationId: organization._id,
      applicationId: application._id,
      screeningId: new Types.ObjectId(screeningDetail.id as string),
    }).lean();

    return blueprint ? this.toDetail(blueprint) : null;
  }

  /** GET .../interview-blueprints — full blueprint history for this application, newest first. Optional convenience; not the primary read path. */
  async getBlueprintHistory(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    applicationId: string
  ): Promise<{ blueprints: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const application = await EmployerJobApplication.findOne({ _id: applicationId, organizationId: organization._id }).select('_id');
    if (!application) {
      throw new ApiError(404, 'Application not found');
    }

    const blueprints = await EmployerInterviewBlueprint.find({ organizationId: organization._id, applicationId: application._id })
      .sort({ createdAt: -1 })
      .lean();

    return { blueprints: blueprints.map((b) => this.toDetail(b)) };
  }

  /**
   * POST .../interview-blueprint — generates (or returns the already-
   * completed) blueprint for the CURRENT applicable screening only. Requires
   * the application to be shortlisted, a valid shortlist decision to exist,
   * a completed current screening, a current explainable score, and the
   * finalized JD snapshot that screening was run against. The current gap
   * analysis (19C) is used only when it belongs to that exact screening —
   * `getGaps` already guarantees this, so it is never required.
   */
  async generateBlueprint(
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
    if (application.status !== EmployerJobApplicationStatus.SHORTLISTED) {
      throw new ApiError(409, 'Shortlist this candidate before generating an interview blueprint');
    }

    const shortlistDecisionDetail = await employerCandidateShortlistService.getCurrentShortlistDecision(
      organizationId,
      actingRole,
      applicationId
    );
    if (!shortlistDecisionDetail) {
      throw new ApiError(409, 'A valid shortlist decision is required before generating an interview blueprint');
    }

    const screeningDetail = await employerCandidateScreeningService.getCurrentScreening(organizationId, actingRole, applicationId);
    if (!screeningDetail || screeningDetail.status !== EmployerCandidateScreeningStatus.COMPLETED) {
      throw new ApiError(409, 'A completed screening is required before generating an interview blueprint');
    }

    const scoreDetail = await employerCandidateScreeningScoreService.getScore(organizationId, actingRole, applicationId);
    if (!scoreDetail) {
      throw new ApiError(409, 'An explainable score is required before generating an interview blueprint');
    }

    // Optional — only used when it belongs to this EXACT current screening (getGaps already guarantees this internally).
    const gapDetail = await employerCandidateScreeningGapService.getGaps(organizationId, actingRole, applicationId);

    const jdSnapshot = await EmployerJobIntelligenceSnapshot.findOne({
      _id: screeningDetail.jdSnapshotId,
      organizationId: organization._id,
      jobId: application.jobId,
    });
    if (!jdSnapshot) {
      throw new ApiError(409, 'Finalize JD Intelligence before generating an interview blueprint');
    }

    const shortlistDecisionId = new Types.ObjectId(shortlistDecisionDetail.id as string);
    const screeningId = new Types.ObjectId(screeningDetail.id as string);
    const screeningScoreId = new Types.ObjectId(scoreDetail.id as string);
    const screeningGapId = gapDetail ? new Types.ObjectId(gapDetail.id as string) : undefined;
    const jdSnapshotId = jdSnapshot._id as Types.ObjectId;

    const claim = await this.claimBlueprint(
      organization._id,
      application._id as Types.ObjectId,
      application.jobId,
      application.candidateId,
      shortlistDecisionId,
      jdSnapshotId,
      screeningId,
      screeningScoreId,
      screeningGapId,
      actorMembershipId
    );
    if (claim.alreadyCompleted) {
      // A completed blueprint already exists for this exact screening — do NOT call AI again.
      return this.toDetail(claim.row.toObject());
    }

    try {
      const { blueprint, aiUsage } = await this.runBlueprintGeneration(
        jdSnapshot.snapshot,
        screeningDetail.result as IScreeningResult,
        scoreDetail.score as IScreeningScore,
        gapDetail ? (gapDetail.gap as IScreeningGap) : undefined,
        organization._id.toString()
      );
      claim.row.blueprint = blueprint;
      claim.row.aiUsage = aiUsage;
      claim.row.status = EmployerInterviewBlueprintStatus.COMPLETED;
      claim.row.errorMessage = undefined;
      await claim.row.save();
      return this.toDetail(claim.row.toObject());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[EmployerInterviewBlueprintService] Blueprint generation failed for application ${application._id.toString()} (job ${application.jobId.toString()}, candidate ${application.candidateId.toString()}, screening ${screeningId.toString()})`,
        error
      );
      claim.row.status = EmployerInterviewBlueprintStatus.FAILED;
      claim.row.errorMessage = 'Failed to generate interview blueprint. Please try again.';
      await claim.row.save();
      throw new ApiError(502, 'Failed to generate interview blueprint');
    }
  }

  /** Wins (or recovers) the exclusive right to generate a blueprint for this exact {applicationId, screeningId} combination. */
  private async claimBlueprint(
    organizationId: Types.ObjectId,
    applicationId: Types.ObjectId,
    jobId: Types.ObjectId,
    candidateId: Types.ObjectId,
    shortlistDecisionId: Types.ObjectId,
    jdSnapshotId: Types.ObjectId,
    screeningId: Types.ObjectId,
    screeningScoreId: Types.ObjectId,
    screeningGapId: Types.ObjectId | undefined,
    actorMembershipId: string
  ): Promise<{ row: InstanceType<typeof EmployerInterviewBlueprint>; alreadyCompleted: boolean }> {
    try {
      const created = await EmployerInterviewBlueprint.create({
        organizationId,
        applicationId,
        jobId,
        candidateId,
        shortlistDecisionId,
        jdSnapshotId,
        screeningId,
        screeningScoreId,
        screeningGapId,
        status: EmployerInterviewBlueprintStatus.PROCESSING,
        createdByMembershipId: new Types.ObjectId(actorMembershipId),
      });
      return { row: created, alreadyCompleted: false };
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    const existing = await EmployerInterviewBlueprint.findOne({ organizationId, applicationId, screeningId });
    if (!existing) {
      throw new ApiError(409, 'Interview blueprint is already being generated — please try again shortly');
    }

    if (existing.status === EmployerInterviewBlueprintStatus.COMPLETED) {
      return { row: existing, alreadyCompleted: true };
    }
    if (existing.status === EmployerInterviewBlueprintStatus.PROCESSING) {
      throw new ApiError(409, 'Interview blueprint is already being generated for this application');
    }

    // FAILED — revive via compare-and-swap so exactly one concurrent retry wins.
    const revived = await EmployerInterviewBlueprint.findOneAndUpdate(
      { _id: existing._id, status: EmployerInterviewBlueprintStatus.FAILED },
      {
        $set: { status: EmployerInterviewBlueprintStatus.PROCESSING, shortlistDecisionId, jdSnapshotId, screeningScoreId, screeningGapId },
        $unset: { blueprint: '', aiUsage: '', errorMessage: '' },
      },
      { new: true }
    );
    if (!revived) {
      throw new ApiError(409, 'Interview blueprint is already being generated for this application');
    }
    return { row: revived, alreadyCompleted: false };
  }

  /**
   * The ONLY place this service calls AI — through the existing Sprint 2
   * gateway's generic structured-generation primitive, exactly once.
   * `result.data` is `unknown`/untyped from the gateway's own contract, so
   * it is strictly validated/normalized before anything is persisted.
   */
  private async runBlueprintGeneration(
    jdSnapshot: IJobIntelligenceSnapshot,
    screeningResult: IScreeningResult,
    score: IScreeningScore,
    gap: IScreeningGap | undefined,
    organizationId: string
  ): Promise<{ blueprint: IInterviewBlueprint; aiUsage: IEmployerInterviewBlueprintUsage }> {
    const validCompetencyNames = new Set(jdSnapshot.competencies.map((c) => c.name));
    const validSkillNames = new Set(jdSnapshot.skills.map((s) => s.name));

    const prompt = this.buildPrompt(jdSnapshot, screeningResult, score, gap);

    const result = await getAIService().generateStructured<unknown>(
      { prompt, temperature: 0.2, maxTokens: 3000 },
      { organizationId, operation: 'employer-interview-blueprint' }
    );

    const blueprint = this.validateBlueprint(result.data, jdSnapshot, validCompetencyNames, validSkillNames);
    const aiUsage = this.computeUsage(result.metadata);
    return { blueprint, aiUsage };
  }

  /**
   * Compact, structured inputs ONLY — never raw JD text, never raw resume
   * text, never demographic/contact information, never recruiter notes or
   * application source attribution. This is a PLANNING prompt: the model
   * must produce question INTENTS, never final questions, and must never
   * include a hiring decision or protected/personal-life attribute.
   */
  private buildPrompt(
    jdSnapshot: IJobIntelligenceSnapshot,
    screeningResult: IScreeningResult,
    score: IScreeningScore,
    gap: IScreeningGap | undefined
  ): string {
    const compactJd = {
      role: {
        jobTitle: jdSnapshot.role.jobTitle,
        summary: jdSnapshot.role.summary,
        experience: jdSnapshot.role.experience,
        education: jdSnapshot.role.education,
        domainKnowledge: jdSnapshot.role.domainKnowledge,
      },
      skills: jdSnapshot.skills.map((s) => ({ name: s.name, requirement: s.requirement, proficiency: s.proficiency, importance: s.importance })),
      competencies: jdSnapshot.competencies.map((c) => ({
        name: c.name,
        description: c.description,
        weight: c.weight,
        importance: c.importance,
        skillNames: c.skillNames,
      })),
    };

    const compactCandidate = {
      strengths: screeningResult.strengths,
      concerns: screeningResult.concerns,
      skillMatch: screeningResult.skillMatch,
      experienceMatch: screeningResult.experienceMatch,
      educationMatch: screeningResult.educationMatch,
      explainableScoreComponents: score.components,
      competencyBreakdown: score.competencyBreakdown,
      gapSummary: gap?.summary,
      skillGaps: gap?.skillGaps,
      competencyGaps: gap?.competencyGaps,
      experienceGap: gap?.experienceGap,
      educationGap: gap?.educationGap,
    };

    const competencyNameList = jdSnapshot.competencies.map((c) => `"${c.name}"`).join(', ');
    const skillNameList = jdSnapshot.skills.map((s) => `"${s.name}"`).join(', ');

    return `You are an expert interview designer creating a STRUCTURED INTERVIEW PLAN for one candidate being considered for one role — this is a PLANNING document, not final interview questions.

Use ONLY the structured JOB REQUIREMENTS and CANDIDATE ASSESSMENT data below. Every "questionPlan" entry you produce is a question INTENT/topic an interviewer should probe — never a verbatim, final, ready-to-read question.

Design principles:
- Cover EVERY competency below marked importance "critical" or "high" across your sections — do not skip any of them.
- Emphasize areas where the candidate's assessment shows weakness, low scores, or gaps — but do not ignore genuine strengths; validate strengths too, don't only probe weaknesses.
- Include opportunities to validate evidence already found (e.g. ask the candidate to elaborate on a specific claimed strength or a partially-matched skill) rather than restating resume facts as trivia.
- Order sections in a logical interview flow (e.g. background/experience before deep technical, technical before behavioral — use your judgment).

Strict prohibitions:
- NEVER include or reference protected or personal-life attributes: no salary/compensation history, no age, no marital/family status, no religion, no health/disability, no race/ethnicity, no gender, no national origin, or any other demographic characteristic.
- NEVER include a hiring decision, recommendation, or fit judgment anywhere in this plan — this is a question-planning document only.

Every "competencies" entry in a section MUST exactly match one of these competency names: ${competencyNameList || '(none)'}. Every "skills" entry MUST exactly match one of these skill names: ${skillNameList || '(none)'}. Do not invent new names — omit a reference rather than inventing one.

Return ONLY a single JSON object with EXACTLY this shape:
{
  "title": string,
  "estimatedDurationMinutes": number,
  "sections": [
    {
      "title": string,
      "objective": string,
      "durationMinutes": number,
      "category": "technical" | "problem_solving" | "system_design" | "domain" | "behavioral" | "leadership" | "communication" | "experience",
      "competencies": string[],
      "skills": string[],
      "questionPlan": [
        { "intent": string, "difficulty": "easy" | "medium" | "hard", "evidenceExpected": string[], "followUpFocus": string[] }
      ]
    }
  ],
  "focusAreas": string[],
  "avoidAreas": string[]
}

JOB REQUIREMENTS (from the finalized JD intelligence snapshot):
${JSON.stringify(compactJd)}

CANDIDATE ASSESSMENT (from the candidate's completed screening, explainable score, and gap analysis — no personal, contact, or demographic information):
${JSON.stringify(compactCandidate)}

Return JSON only — no prose, no markdown code fences, no explanation.`;
  }

  /**
   * Strict normalization of untrusted AI JSON. Structural prerequisites (a
   * usable object, a non-empty sections array) must be present or the
   * result is rejected outright (fail rather than persist junk). Every
   * remaining field is defensively coerced/clamped/capped; any competency
   * or skill reference that doesn't match the exact JD snapshot is
   * dropped, never persisted; missing CRITICAL competency coverage is
   * deterministically repaired by referencing (never inventing) the
   * missing name in the most competency-focused remaining section.
   */
  private validateBlueprint(
    data: unknown,
    jdSnapshot: IJobIntelligenceSnapshot,
    validCompetencyNames: Set<string>,
    validSkillNames: Set<string>
  ): IInterviewBlueprint {
    const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    if (!source || !Array.isArray(source.sections)) {
      throw new ApiError(502, 'Interview blueprint was structurally invalid');
    }

    const asString = (value: unknown, maxLength = 300): string | undefined => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed ? trimmed.slice(0, maxLength) : undefined;
    };
    const asStringArray = (value: unknown, maxItems = 20, maxLength = 200): string[] => {
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
    const asReferenceArray = (value: unknown, validNames: Set<string>, maxItems: number): string[] => {
      if (!Array.isArray(value)) return [];
      const seen = new Set<string>();
      const result: string[] = [];
      for (const item of value) {
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed || !validNames.has(trimmed) || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
        if (result.length >= maxItems) break;
      }
      return result;
    };
    const asClampedNumber = (value: unknown, min: number, max: number, fallback: number): number => {
      const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    };
    const asDifficulty = (value: unknown): EmployerInterviewBlueprintDifficulty => {
      if (typeof value === 'string' && Object.values(EmployerInterviewBlueprintDifficulty).includes(value as EmployerInterviewBlueprintDifficulty)) {
        return value as EmployerInterviewBlueprintDifficulty;
      }
      return EmployerInterviewBlueprintDifficulty.MEDIUM;
    };
    const asCategory = (value: unknown): EmployerInterviewBlueprintSectionCategory => {
      if (
        typeof value === 'string' &&
        Object.values(EmployerInterviewBlueprintSectionCategory).includes(value as EmployerInterviewBlueprintSectionCategory)
      ) {
        return value as EmployerInterviewBlueprintSectionCategory;
      }
      return EmployerInterviewBlueprintSectionCategory.TECHNICAL;
    };
    const asObject = (value: unknown): Record<string, unknown> =>
      value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

    // ---- 1. Build cleaned sections (before any size-limit trimming) ----
    let sections: IBlueprintSection[] = (source.sections as unknown[])
      .map((sectionRaw) => asObject(sectionRaw))
      .map((sectionRaw, index) => {
        const questionPlanRaw = Array.isArray(sectionRaw.questionPlan) ? sectionRaw.questionPlan : [];
        const questionPlan: IBlueprintQuestionPlanItem[] = questionPlanRaw
          .map((itemRaw) => asObject(itemRaw))
          .map((itemRaw) => ({
            intent: asString(itemRaw.intent, 300) || '',
            difficulty: asDifficulty(itemRaw.difficulty),
            evidenceExpected: asStringArray(itemRaw.evidenceExpected, 5, 200),
            followUpFocus: asStringArray(itemRaw.followUpFocus, 5, 200),
          }))
          .filter((item) => item.intent.length > 0)
          .slice(0, MAX_QUESTION_PLAN_PER_SECTION);

        return {
          id: `sec-${index + 1}`,
          title: asString(sectionRaw.title, 200) || `Section ${index + 1}`,
          objective: asString(sectionRaw.objective, 500) || '',
          order: index + 1,
          durationMinutes: asClampedNumber(sectionRaw.durationMinutes, MIN_SECTION_DURATION_MINUTES, MAX_SECTION_DURATION_MINUTES, 15),
          category: asCategory(sectionRaw.category),
          competencies: asReferenceArray(sectionRaw.competencies, validCompetencyNames, 10),
          skills: asReferenceArray(sectionRaw.skills, validSkillNames, 15),
          questionPlan,
        };
      })
      // A section with no valid question plan contributes no interview content.
      .filter((section) => section.questionPlan.length > 0)
      .slice(0, MAX_SECTIONS);

    // ---- 2. Cap total planned questions, dropping any section left empty ----
    let runningTotal = 0;
    for (const section of sections) {
      const remaining = MAX_TOTAL_PLANNED_QUESTIONS - runningTotal;
      if (remaining <= 0) {
        section.questionPlan = [];
      } else if (section.questionPlan.length > remaining) {
        section.questionPlan = section.questionPlan.slice(0, remaining);
      }
      runningTotal += section.questionPlan.length;
    }
    sections = sections.filter((section) => section.questionPlan.length > 0);

    if (sections.length < MIN_SECTIONS) {
      throw new ApiError(502, 'Interview blueprint did not contain enough usable sections');
    }

    // ---- 3. Re-number order sequentially and re-derive ids after any dropping ----
    sections = sections.map((section, index) => ({ ...section, id: `sec-${index + 1}`, order: index + 1 }));

    // ---- 4. Duration normalization ----
    const estimatedDurationMinutes = asClampedNumber(
      source.estimatedDurationMinutes,
      MIN_ESTIMATED_DURATION_MINUTES,
      MAX_ESTIMATED_DURATION_MINUTES,
      DEFAULT_ESTIMATED_DURATION_MINUTES
    );
    const rawTotal = sections.reduce((sum, s) => sum + s.durationMinutes, 0);
    const isWildlyInconsistent = rawTotal === 0 || Math.abs(rawTotal - estimatedDurationMinutes) > estimatedDurationMinutes * DURATION_RESCALE_THRESHOLD_RATIO;
    if (isWildlyInconsistent) {
      const normalizedDurations = this.normalizeSectionDurations(sections, estimatedDurationMinutes);
      sections = sections.map((section, index) => ({ ...section, durationMinutes: normalizedDurations[index] }));
    }

    // ---- 5. Coverage repair: every CRITICAL competency must appear in at least one section ----
    const criticalCompetencyNames = jdSnapshot.competencies
      .filter((c) => c.importance === 'critical')
      .map((c) => c.name);
    const coveredCompetencyNames = new Set<string>();
    for (const section of sections) {
      for (const name of section.competencies) coveredCompetencyNames.add(name);
    }
    const missingCritical = criticalCompetencyNames.filter((name) => !coveredCompetencyNames.has(name));
    if (missingCritical.length > 0) {
      // The section already referencing the most competencies is the most suitable/general home for additional coverage — never invented content, only a reference.
      const targetSection = [...sections].sort((a, b) => b.competencies.length - a.competencies.length)[0];
      for (const name of missingCritical) {
        if (!targetSection.competencies.includes(name)) {
          targetSection.competencies.push(name);
        }
        coveredCompetencyNames.add(name);
      }
    }

    if (jdSnapshot.competencies.length > 0 && coveredCompetencyNames.size === 0) {
      throw new ApiError(502, 'Interview blueprint did not reference any valid competency');
    }

    const focusAreas = asStringArray(source.focusAreas, 10, 200);
    const avoidAreas = asStringArray(source.avoidAreas, 10, 200);
    const title = asString(source.title, 200) || 'Interview Plan';

    const totalPlannedQuestions = sections.reduce((sum, s) => sum + s.questionPlan.length, 0);

    return {
      title,
      estimatedDurationMinutes,
      sections,
      focusAreas,
      avoidAreas,
      metadata: {
        totalSections: sections.length,
        totalPlannedQuestions,
        sourceCompetencyCount: jdSnapshot.competencies.length,
        sourceSkillCount: jdSnapshot.skills.length,
      },
    };
  }

  /** Proportional scale + largest-remainder integer rounding — same deterministic technique EmployerJobDescriptionCompetencyService uses to normalize weights to exactly 100 (17D), applied here to normalize section durations to exactly `targetTotal`. */
  private normalizeSectionDurations(sections: Array<{ durationMinutes: number }>, targetTotal: number): number[] {
    const rawTotal = sections.reduce((sum, s) => sum + s.durationMinutes, 0);
    if (rawTotal === 0) {
      const even = Math.floor(targetTotal / sections.length);
      const durations = sections.map(() => even);
      durations[durations.length - 1] += targetTotal - even * sections.length;
      return durations.map((v) => Math.max(1, v));
    }

    const scaled = sections.map((s) => (s.durationMinutes / rawTotal) * targetTotal);
    const floors = scaled.map((v) => Math.floor(v));
    const remainder = targetTotal - floors.reduce((sum, v) => sum + v, 0);
    const fractionalOrder = scaled
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);

    const result = [...floors];
    for (let k = 0; k < remainder; k++) {
      result[fractionalOrder[k % fractionalOrder.length].i] += 1;
    }
    return result.map((v) => Math.max(1, v));
  }

  /** Reuses the SAME shared pricing config/formula every other AI-backed sprint uses — never a parallel pricing calculator. */
  private computeUsage(metadata: AIResponseMetadata): IEmployerInterviewBlueprintUsage {
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

  /** Type guard — interview blueprints don't apply to an institute org. */
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
      shortlistDecisionId: doc.shortlistDecisionId.toString(),
      jdSnapshotId: doc.jdSnapshotId.toString(),
      screeningId: doc.screeningId.toString(),
      screeningScoreId: doc.screeningScoreId.toString(),
      screeningGapId: doc.screeningGapId ? doc.screeningGapId.toString() : undefined,
      status: doc.status,
      blueprint: doc.blueprint ?? null,
      aiUsage: doc.aiUsage ?? null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}

export const employerInterviewBlueprintService = new EmployerInterviewBlueprintService();
