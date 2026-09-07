import { Types } from 'mongoose';
import EmployerJobApplication, { IEmployerJobApplication } from '../../models/EmployerJobApplication.model';
import { EmployerJobApplicationStatus } from '../../constants/employerJobApplication';
import Interview from '../../models/interview.model';
import { InterviewPurpose, InterviewStatus } from '../../constants/interview';
import EmployerCandidateSkillEdge from '../../models/EmployerCandidateSkillEdge.model';
import EmployerSkillNode from '../../models/EmployerSkillNode.model';
import EmployerHiringEvidenceMatrix from '../../models/EmployerHiringEvidenceMatrix.model';
import EmployerInterviewScenarioReport from '../../models/EmployerInterviewScenarioReport.model';
import EmployerCodingAssessmentReport from '../../models/EmployerCodingAssessmentReport.model';
import EmployerHiringKnowledgeGroundedEvaluation from '../../models/EmployerHiringKnowledgeGroundedEvaluation.model';

/**
 * Shared, deterministic (NO AI) candidate-evidence collection used by BOTH
 * 32A (Unified Talent Profile) and 32B (Cross-Assessment Talent
 * Intelligence) — a single place that queries every SAME-candidate,
 * SAME-organization completed assessment artifact so the two sprints never
 * drift on what counts as "evidence". Never touches another candidate,
 * never reads recruiter notes/communications/protected traits, never
 * invents a synonym/mapping beyond the exact enums each source already
 * persists.
 */
export type TalentEvidenceSourceType = 'standard_interview' | 'scenario' | 'coding' | 'knowledge_grounded';
export type TalentEvidenceState = 'strong' | 'sufficient' | 'partial' | 'insufficient' | 'not_observed';

export interface CompetencyObservation {
  competencyName: string;
  state: TalentEvidenceState;
  sourceType: TalentEvidenceSourceType;
  observedAt: Date;
}

export interface SkillEvidenceGroup {
  skillName: string;
  evidenceCount: number;
  latestEvidenceAt?: Date;
  sourceTypes: string[];
}

export interface CandidateAssessmentCounts {
  interviewCount: number;
  completedInterviewCount: number;
  standardInterviewCount: number;
  scenarioCount: number;
  codingCount: number;
  knowledgeGroundedCount: number;
}

export interface CandidateEvidenceBundle {
  applications: IEmployerJobApplication[];
  skills: SkillEvidenceGroup[];
  competencyObservations: CompetencyObservation[];
  assessmentCounts: CandidateAssessmentCounts;
  latestActivityAt?: Date;
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

export async function collectCandidateEvidence(organizationId: Types.ObjectId, candidateId: Types.ObjectId): Promise<CandidateEvidenceBundle> {
  const applications = await EmployerJobApplication.find({ organizationId, candidateId });
  const applicationIds = applications.map((a) => a._id);

  let latestActivityAt: Date | undefined;
  const bumpLatest = (date?: Date) => {
    if (date && (!latestActivityAt || date > latestActivityAt)) {
      latestActivityAt = date;
    }
  };
  applications.forEach((a) => bumpLatest(a.updatedAt));

  const interviews =
    applicationIds.length > 0
      ? await Interview.find({ organizationId, employerApplicationId: { $in: applicationIds }, purpose: InterviewPurpose.HIRING_ASSESSMENT })
      : [];
  interviews.forEach((i) => bumpLatest(i.updatedAt));
  const completedInterviewCount = interviews.filter(
    (i) => i.status === InterviewStatus.COMPLETED || i.status === InterviewStatus.EVALUATED
  ).length;

  // ---- Skills (25A candidate skill edges — evidence PRESENCE only, never a proficiency score) ----
  const skillEdges = await EmployerCandidateSkillEdge.find({ organizationId, candidateId });
  const skillNodeIds = [...new Set(skillEdges.map((e) => e.skillNodeId.toString()))].map((id) => new Types.ObjectId(id));
  const skillNodes = skillNodeIds.length > 0 ? await EmployerSkillNode.find({ _id: { $in: skillNodeIds } }).select('_id canonicalName') : [];
  const skillNameById = new Map(skillNodes.map((n) => [n._id.toString(), n.canonicalName]));

  const skillGroups = new Map<string, SkillEvidenceGroup>();
  for (const edge of skillEdges) {
    bumpLatest(edge.updatedAt);
    const name = skillNameById.get(edge.skillNodeId.toString());
    if (!name) continue;
    const key = normalizeKey(name);
    const group = skillGroups.get(key) ?? { skillName: name, evidenceCount: 0, sourceTypes: [], latestEvidenceAt: undefined };
    group.evidenceCount += edge.sources.length;
    for (const source of edge.sources) {
      if (!group.sourceTypes.includes(source.type)) group.sourceTypes.push(source.type);
    }
    if (!group.latestEvidenceAt || edge.updatedAt > group.latestEvidenceAt) {
      group.latestEvidenceAt = edge.updatedAt;
    }
    skillGroups.set(key, group);
  }

  // ---- Competency evidence — 4 completed-artifact sources only ----
  const competencyObservations: CompetencyObservation[] = [];

  const evidenceMatrices = await EmployerHiringEvidenceMatrix.find({ organizationId, candidateId });
  for (const matrix of evidenceMatrices) {
    bumpLatest(matrix.createdAt);
    for (const c of matrix.matrix.competencies) {
      competencyObservations.push({
        competencyName: c.competencyName,
        state: c.evidenceStatus,
        sourceType: 'standard_interview',
        observedAt: matrix.createdAt,
      });
    }
  }

  const scenarioReports =
    applicationIds.length > 0 ? await EmployerInterviewScenarioReport.find({ organizationId, applicationId: { $in: applicationIds } }) : [];
  for (const report of scenarioReports) {
    bumpLatest(report.generatedAt);
    for (const c of report.competencyEvidence) {
      competencyObservations.push({
        competencyName: c.competencyName,
        state: c.overallEvidenceState,
        sourceType: 'scenario',
        observedAt: report.generatedAt,
      });
    }
  }

  const codingReports =
    applicationIds.length > 0 ? await EmployerCodingAssessmentReport.find({ organizationId, applicationId: { $in: applicationIds } }) : [];
  for (const report of codingReports) {
    bumpLatest(report.generatedAt);
    for (const c of report.competencyEvidence) {
      competencyObservations.push({
        competencyName: c.competencyName,
        state: c.overallEvidenceState,
        sourceType: 'coding',
        observedAt: report.generatedAt,
      });
    }
  }

  // Knowledge-grounded evaluations (29E) are per-question alignment checks with no competency
  // label in their schema — they contribute to assessment counts/source coverage only, never
  // to per-competency evidence-state observations (there is nothing to attribute here).
  const knowledgeEvaluations =
    applicationIds.length > 0
      ? await EmployerHiringKnowledgeGroundedEvaluation.find({ organizationId, applicationId: { $in: applicationIds }, status: 'completed' })
      : [];
  for (const evaluation of knowledgeEvaluations) {
    bumpLatest(evaluation.evaluatedAt ?? evaluation.updatedAt);
  }

  return {
    applications,
    skills: Array.from(skillGroups.values()),
    competencyObservations,
    assessmentCounts: {
      interviewCount: interviews.length,
      completedInterviewCount,
      standardInterviewCount: evidenceMatrices.length,
      scenarioCount: scenarioReports.length,
      codingCount: codingReports.length,
      knowledgeGroundedCount: knowledgeEvaluations.length,
    },
    latestActivityAt,
  };
}

/** Deterministic application-status rollup (32A section 5) — never reinterprets outcomes. */
export function summarizeApplications(applications: IEmployerJobApplication[]) {
  const activeStatuses = new Set([
    EmployerJobApplicationStatus.APPLIED,
    EmployerJobApplicationStatus.SCREENING,
    EmployerJobApplicationStatus.SHORTLISTED,
    EmployerJobApplicationStatus.INTERVIEW,
    EmployerJobApplicationStatus.OFFER,
  ]);
  const completedStatuses = new Set([
    EmployerJobApplicationStatus.HIRED,
    EmployerJobApplicationStatus.REJECTED,
    EmployerJobApplicationStatus.WITHDRAWN,
    EmployerJobApplicationStatus.ARCHIVED,
  ]);

  return {
    totalApplications: applications.length,
    activeApplications: applications.filter((a) => activeStatuses.has(a.status)).length,
    completedApplications: applications.filter((a) => completedStatuses.has(a.status)).length,
    hiredApplications: applications.filter((a) => a.status === EmployerJobApplicationStatus.HIRED).length,
    rejectedApplications: applications.filter((a) => a.status === EmployerJobApplicationStatus.REJECTED).length,
  };
}

export function normalizeCompetencyKey(name: string): string {
  return normalizeKey(name);
}
