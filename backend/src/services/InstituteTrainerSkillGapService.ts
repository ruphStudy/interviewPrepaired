import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBatch, { IInstituteBatch } from '../models/InstituteBatch.model';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import Interview, { IEvaluationDimension } from '../models/interview.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const MAX_STRONGEST_SKILLS = 10;
const MAX_SKILL_GAPS = 10;
const MAX_STUDENTS_NEEDING_ATTENTION = 20;
const MAX_WEAK_SKILLS_PER_STUDENT = 3;

// Maps the evaluation schema's own old fixed-format score fields to their
// existing canonical label (used in this app's own finalReport.average*
// fields) — never an invented skill name, only used when a question's
// evaluation predates the dynamic `dimensions` format.
const FIXED_SCORE_LABELS: Array<{ field: keyof FixedScoreFields; label: string }> = [
  { field: 'technicalScore', label: 'Technical Knowledge' },
  { field: 'communicationScore', label: 'Communication' },
  { field: 'leadershipScore', label: 'Leadership' },
  { field: 'problemSolvingScore', label: 'Problem Solving' },
  { field: 'confidenceScore', label: 'Confidence' },
];

interface FixedScoreFields {
  technicalScore?: number;
  communicationScore?: number;
  leadershipScore?: number;
  problemSolvingScore?: number;
  confidenceScore?: number;
}

interface SkillStat {
  skill: string;
  evidenceCount: number;
  averageScore?: number;
}

interface StudentAttentionRow {
  student: { id: string; firstName: string; lastName?: string; enrollmentNumber?: string };
  averageScore?: number;
  weakSkills: string[];
}

interface SkillGapAnalytics {
  summary: {
    totalStudents: number;
    studentsAssessed: number;
    completedInterviews: number;
    skillsObserved: number;
  };
  strongestSkills: SkillStat[];
  skillGaps: SkillStat[];
  studentsNeedingAttention: StudentAttentionRow[];
}

/**
 * Trainer skill-gap analytics for a batch (14D) — read-only, derived
 * ENTIRELY from already-persisted evaluation data (per-question
 * `evaluation.dimensions` — falling back to the old fixed-format
 * technical/communication/leadership/problemSolving/confidence scores only
 * when dimensions are absent — plus `finalReport.overallScore`). No AI
 * calls, no new skill graph model (Sprint 25), no skill invented from raw
 * question/answer text. Batch scope authorization mirrors 14C exactly.
 */
export class InstituteTrainerSkillGapService {
  async getSkillGaps(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId,
    batchId: string
  ): Promise<SkillGapAnalytics> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    this.assertIsTrainer(actingRole);

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const batch = await this.getBatchInTrainerScope(organization._id, trainerMembershipId, batchId);

    const students = await InstituteStudent.find({
      organizationId: organization._id,
      batchId: batch._id,
      status: InstituteStudentStatus.ACTIVE,
    })
      .select('firstName lastName enrollmentNumber userId')
      .lean();

    const emptyResult: SkillGapAnalytics = {
      summary: { totalStudents: students.length, studentsAssessed: 0, completedInterviews: 0, skillsObserved: 0 },
      strongestSkills: [],
      skillGaps: [],
      studentsNeedingAttention: [],
    };

    if (students.length === 0) {
      return emptyResult;
    }

    const studentIds = students.map((s) => s._id);
    const studentUserIdById = new Map(
      students.filter((s) => s.userId).map((s) => [s._id.toString(), s.userId!.toString()])
    );

    // Only COMPLETED assignments are a data source here.
    const completedAssignments = await InstituteStudentInterviewAssignment.find({
      organizationId: organization._id,
      studentId: { $in: studentIds },
      status: InstituteStudentInterviewAssignmentStatus.COMPLETED,
    })
      .select('studentId interviewId')
      .lean();

    const candidates = completedAssignments.filter((a) => a.interviewId);
    const interviewIds = Array.from(new Set(candidates.map((a) => a.interviewId!.toString())));
    const studentUserIds = Array.from(new Set(Array.from(studentUserIdById.values())));

    const interviews =
      interviewIds.length > 0 && studentUserIds.length > 0
        ? await Interview.find({
            _id: { $in: interviewIds },
            organizationId: organization._id,
            userId: { $in: studentUserIds },
          })
            .select('userId questions.evaluation finalReport.overallScore')
            .lean()
        : [];
    const interviewById = new Map(interviews.map((i) => [i._id.toString(), i]));

    // Skill-level aggregation, keyed by trim+lowercase (case-insensitive
    // merge) — value keeps the first-seen display casing.
    const skillAgg = new Map<string, { label: string; sum: number; count: number }>();
    // Per-student score/skill aggregation for studentsNeedingAttention.
    const studentScoreAgg = new Map<string, { sum: number; count: number }>();
    const studentSkillAgg = new Map<string, Map<string, { label: string; sum: number; count: number }>>();

    let studentsAssessed = 0;
    let completedInterviews = 0;
    const assessedStudentIds = new Set<string>();

    for (const assignment of candidates) {
      const studentKey = assignment.studentId.toString();
      const expectedUserId = studentUserIdById.get(studentKey);
      const interview = interviewById.get(assignment.interviewId!.toString());
      // Never trust interviewId alone — the Interview's own userId must
      // match this exact student before any of its data is used.
      if (!expectedUserId || !interview || interview.userId?.toString() !== expectedUserId) {
        continue;
      }

      completedInterviews += 1;
      if (!assessedStudentIds.has(studentKey)) {
        assessedStudentIds.add(studentKey);
        studentsAssessed += 1;
      }

      const overallScore = interview.finalReport?.overallScore;
      if (typeof overallScore === 'number') {
        const acc = studentScoreAgg.get(studentKey) || { sum: 0, count: 0 };
        acc.sum += overallScore;
        acc.count += 1;
        studentScoreAgg.set(studentKey, acc);
      }

      for (const question of interview.questions || []) {
        const evaluation = question.evaluation;
        if (!evaluation) continue;

        const evidences = this.extractSkillEvidence(evaluation);
        if (evidences.length === 0) continue;

        let studentMap = studentSkillAgg.get(studentKey);
        if (!studentMap) {
          studentMap = new Map();
          studentSkillAgg.set(studentKey, studentMap);
        }

        for (const { skill, score } of evidences) {
          const key = skill.toLowerCase();

          const batchEntry = skillAgg.get(key) || { label: skill, sum: 0, count: 0 };
          batchEntry.sum += score;
          batchEntry.count += 1;
          skillAgg.set(key, batchEntry);

          const studentEntry = studentMap.get(key) || { label: skill, sum: 0, count: 0 };
          studentEntry.sum += score;
          studentEntry.count += 1;
          studentMap.set(key, studentEntry);
        }
      }
    }

    const skillStats: SkillStat[] = Array.from(skillAgg.values()).map((entry) => ({
      skill: entry.label,
      evidenceCount: entry.count,
      averageScore: Math.round((entry.sum / entry.count) * 100) / 100,
    }));

    const strongestSkills = [...skillStats]
      .sort((a, b) => (b.averageScore! - a.averageScore!) || b.evidenceCount - a.evidenceCount)
      .slice(0, MAX_STRONGEST_SKILLS);

    const skillGaps = [...skillStats]
      .sort((a, b) => (a.averageScore! - b.averageScore!) || b.evidenceCount - a.evidenceCount)
      .slice(0, MAX_SKILL_GAPS);

    const attentionCandidates: StudentAttentionRow[] = students.map((student) => {
      const key = student._id.toString();
      const scoreAcc = studentScoreAgg.get(key);
      const studentSkills = studentSkillAgg.get(key);

      const weakSkills = studentSkills
        ? Array.from(studentSkills.values())
            .map((entry) => ({ skill: entry.label, average: entry.sum / entry.count }))
            .sort((a, b) => a.average - b.average)
            .slice(0, MAX_WEAK_SKILLS_PER_STUDENT)
            .map((entry) => entry.skill)
        : [];

      return {
        student: {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        averageScore: scoreAcc ? Math.round((scoreAcc.sum / scoreAcc.count) * 100) / 100 : undefined,
        weakSkills,
      };
    });

    // Students with no verified score at all (no completed/verified
    // interview yet) need attention first — there's nothing to rank them
    // against; then order the rest worst-score-first.
    const studentsNeedingAttention = attentionCandidates
      .sort((a, b) => {
        const aHasScore = a.averageScore !== undefined;
        const bHasScore = b.averageScore !== undefined;
        if (aHasScore !== bHasScore) return aHasScore ? 1 : -1;
        if (!aHasScore) return 0;
        return a.averageScore! - b.averageScore!;
      })
      .slice(0, MAX_STUDENTS_NEEDING_ATTENTION);

    return {
      summary: {
        totalStudents: students.length,
        studentsAssessed,
        completedInterviews,
        skillsObserved: skillStats.length,
      },
      strongestSkills,
      skillGaps,
      studentsNeedingAttention,
    };
  }

  /**
   * Structured (skill, score) pairs only — never derived from free-text
   * strengths/weaknesses/suggestions/question content. `dimensions` (the
   * dynamic format, always populated by the evaluation pipeline) is
   * preferred; the old fixed-format scores are used only when a legacy
   * evaluation has no dimensions at all.
   */
  private extractSkillEvidence(evaluation: {
    dimensions?: IEvaluationDimension[];
    technicalScore?: number;
    communicationScore?: number;
    leadershipScore?: number;
    problemSolvingScore?: number;
    confidenceScore?: number;
  }): Array<{ skill: string; score: number }> {
    if (evaluation.dimensions && evaluation.dimensions.length > 0) {
      return evaluation.dimensions
        .filter((d) => typeof d.score === 'number' && (d.label || d.name))
        .map((d) => ({ skill: (d.label || d.name).trim(), score: d.score }));
    }

    const evidence: Array<{ skill: string; score: number }> = [];
    for (const { field, label } of FIXED_SCORE_LABELS) {
      const score = evaluation[field];
      if (typeof score === 'number') {
        evidence.push({ skill: label, score });
      }
    }
    return evidence;
  }

  /**
   * Same authorization gate as 14C (batch analytics): an EXACT
   * {_id, organizationId} batch, and either a direct trainer->batch
   * assignment or a trainer->course assignment matching the batch's own
   * courseId. Anything else is the same 404 "Batch not found".
   */
  private async getBatchInTrainerScope(
    organizationId: Types.ObjectId,
    trainerMembershipId: Types.ObjectId,
    batchId: string
  ): Promise<IInstituteBatch> {
    const batch = await InstituteBatch.findOne({ _id: batchId, organizationId });
    if (!batch) {
      throw new ApiError(404, 'Batch not found');
    }

    const trainerAssignments = await InstituteTrainerAssignment.find({
      organizationId,
      trainerMembershipId,
    })
      .select('courseId batchId')
      .lean();

    const hasDirectBatch = trainerAssignments.some((a) => a.batchId && a.batchId.toString() === batch._id.toString());
    const hasCourseMatch = trainerAssignments.some(
      (a) => a.courseId && a.courseId.toString() === batch.courseId.toString()
    );

    if (!hasDirectBatch && !hasCourseMatch) {
      throw new ApiError(404, 'Batch not found');
    }

    return batch;
  }

  /** Access is already verified by the RBAC middleware — this just loads by ID (trusted organizationId). */
  private async getOrganizationById(organizationId: string): Promise<IOrganization> {
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return organization;
  }

  /** Defense in depth — the middleware already checked this; never duplicates the 8C matrix, just reuses it. */
  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  /** ANALYTICS_VIEW is also granted to OWNER/ADMIN/RECRUITER — this is trainer-scoped identity, not just permission-gated. */
  private assertIsTrainer(role: OrganizationMemberRole): void {
    if (role !== OrganizationMemberRole.TRAINER) {
      throw new ApiError(403, 'Only trainers can access this resource');
    }
  }

  /** Type guard — never a silent empty result for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }
}

export const instituteTrainerSkillGapService = new InstituteTrainerSkillGapService();
