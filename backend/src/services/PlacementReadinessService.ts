import InstituteStudent from '../models/InstituteStudent.model';
import InstituteStudentInterviewAssignment from '../models/InstituteStudentInterviewAssignment.model';
import Interview, { IEvaluationDimension } from '../models/interview.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { InstituteStudentInterviewAssignmentStatus } from '../constants/instituteStudentInterviewAssignment';
import { ReadinessLevel, ReadinessComponentKey, READINESS_COMPONENT_WEIGHTS, getReadinessLevel } from '../constants/placementReadiness';
import { ApiError } from '../utils/ApiError';

type SkillComponentKey = Exclude<ReadinessComponentKey, 'overallPerformance'>;

// Matches dimension.name (the fixed, always-English internal identifier —
// never dimension.label, which is written in the interview's own language).
const DIMENSION_NAME_TO_COMPONENT: Record<string, SkillComponentKey> = {
  technical: 'technical',
  communication: 'communication',
  problemSolving: 'problemSolving',
  confidence: 'confidence',
};

// Legacy fixed-format fallback — only consulted when an evaluation has no
// `dimensions` at all, so a single evaluation is never double-counted
// across both formats.
const FIXED_SCORE_FIELD_TO_COMPONENT: ReadonlyArray<{
  field: 'technicalScore' | 'communicationScore' | 'problemSolvingScore' | 'confidenceScore';
  component: SkillComponentKey;
}> = [
  { field: 'technicalScore', component: 'technical' },
  { field: 'communicationScore', component: 'communication' },
  { field: 'problemSolvingScore', component: 'problemSolving' },
  { field: 'confidenceScore', component: 'confidence' },
];

interface CalculateReadinessParams {
  organizationId: string;
  studentId: string;
}

interface StudentReadinessResult {
  studentId: string;
  organizationId: string;
  interviewsCompleted: number;
  scoredInterviews: number;
  readinessScore: number | null;
  readinessLevel: ReadinessLevel | null;
  insufficientData: boolean;
  components: Record<ReadinessComponentKey, number | null>;
  evidence: {
    totalSkillEvidence: number;
    lastInterviewAt?: Date;
  };
}

const EMPTY_COMPONENTS: Record<ReadinessComponentKey, number | null> = {
  overallPerformance: null,
  technical: null,
  communication: null,
  problemSolving: null,
  confidence: null,
};

/**
 * Reusable, compute-on-read Placement Readiness Engine (15A) — no
 * persistence, no AI calls, no trainer/RBAC authorization (callers in
 * 15B/15C enforce access before calling this). Every readiness figure is
 * derived strictly from already-persisted, VERIFIED interview evidence for
 * ONE student: COMPLETED InstituteStudentInterviewAssignment rows whose
 * linked Interview is re-checked with an exact {_id, organizationId,
 * userId: student.userId} match — interviewId is never trusted alone.
 */
export class PlacementReadinessService {
  async calculateStudentReadiness(params: CalculateReadinessParams): Promise<StudentReadinessResult> {
    const { organizationId, studentId } = params;

    const student = await InstituteStudent.findOne({
      _id: studentId,
      organizationId,
      status: InstituteStudentStatus.ACTIVE,
    }).select('userId');
    if (!student) {
      throw new ApiError(404, 'Student not found');
    }

    if (!student.userId) {
      return this.insufficientDataResult(student._id.toString(), organizationId, 0);
    }

    const completedAssignments = await InstituteStudentInterviewAssignment.find({
      organizationId,
      studentId: student._id,
      status: InstituteStudentInterviewAssignmentStatus.COMPLETED,
    })
      .select('interviewId')
      .lean();

    const interviewsCompleted = completedAssignments.length;
    const interviewIds = Array.from(
      new Set(completedAssignments.filter((a) => a.interviewId).map((a) => a.interviewId!.toString()))
    );

    // A single-student scope: the exact {_id, organizationId, userId} match
    // IS the verification — every document this query returns is already
    // confirmed to belong to this exact student, never trusted from
    // interviewId alone.
    const interviews =
      interviewIds.length > 0
        ? await Interview.find({
            _id: { $in: interviewIds },
            organizationId,
            userId: student.userId,
          })
            .select('completedAt questions.evaluation finalReport.overallScore')
            .lean()
        : [];

    if (interviews.length === 0) {
      return this.insufficientDataResult(student._id.toString(), organizationId, interviewsCompleted);
    }

    const overallScores: number[] = [];
    const categoryScores: Record<SkillComponentKey, number[]> = {
      technical: [],
      communication: [],
      problemSolving: [],
      confidence: [],
    };
    let totalSkillEvidence = 0;
    let scoredInterviews = 0;
    let lastInterviewAt: Date | undefined;

    for (const interview of interviews) {
      const overallScore = interview.finalReport?.overallScore;
      if (typeof overallScore === 'number') {
        overallScores.push(overallScore);
        scoredInterviews += 1;
      }

      if (interview.completedAt && (!lastInterviewAt || interview.completedAt > lastInterviewAt)) {
        lastInterviewAt = interview.completedAt;
      }

      for (const question of interview.questions || []) {
        if (!question.evaluation) continue;
        const extracted = this.extractCategoryScores(question.evaluation);
        (Object.keys(extracted) as SkillComponentKey[]).forEach((component) => {
          const scores = extracted[component];
          if (!scores) return;
          categoryScores[component].push(...scores);
          totalSkillEvidence += scores.length;
        });
      }
    }

    const components: Record<ReadinessComponentKey, number | null> = {
      overallPerformance: this.averageToHundred(overallScores),
      technical: this.averageToHundred(categoryScores.technical),
      communication: this.averageToHundred(categoryScores.communication),
      problemSolving: this.averageToHundred(categoryScores.problemSolving),
      confidence: this.averageToHundred(categoryScores.confidence),
    };

    const { readinessScore, insufficientData } = this.computeReadinessScore(components);
    const readinessLevel = readinessScore !== null ? getReadinessLevel(readinessScore) : null;

    return {
      studentId: student._id.toString(),
      organizationId,
      interviewsCompleted,
      scoredInterviews,
      readinessScore,
      readinessLevel,
      insufficientData,
      components,
      evidence: { totalSkillEvidence, lastInterviewAt },
    };
  }

  /**
   * Reusable structured-score extraction — dynamic `dimensions` (matched by
   * `dim.name`, the fixed English identifier) are preferred; the old
   * fixed-format scores are consulted ONLY when an evaluation has no
   * dimensions at all, so a single evaluation is never double-counted
   * across both formats. Never derived from free-text strengths/weaknesses/
   * suggestions/question content.
   */
  private extractCategoryScores(evaluation: {
    dimensions?: IEvaluationDimension[];
    technicalScore?: number;
    communicationScore?: number;
    problemSolvingScore?: number;
    confidenceScore?: number;
  }): Partial<Record<SkillComponentKey, number[]>> {
    const result: Partial<Record<SkillComponentKey, number[]>> = {};

    if (evaluation.dimensions && evaluation.dimensions.length > 0) {
      for (const dimension of evaluation.dimensions) {
        const component = DIMENSION_NAME_TO_COMPONENT[dimension.name];
        if (component && typeof dimension.score === 'number') {
          (result[component] ??= []).push(dimension.score);
        }
      }
      return result;
    }

    for (const { field, component } of FIXED_SCORE_FIELD_TO_COMPONENT) {
      const score = evaluation[field];
      if (typeof score === 'number') {
        (result[component] ??= []).push(score);
      }
    }
    return result;
  }

  /** Raw evaluation scores are 0-10 — normalizes to a 0-100 component, rounded to 2dp. Null when no evidence at all. */
  private averageToHundred(scores: number[]): number | null {
    if (scores.length === 0) {
      return null;
    }
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    return Math.round(average * 10 * 100) / 100;
  }

  /**
   * Weighted average using ONLY the available components. Dividing by the
   * sum of just those components' weights (rather than 1) is exactly
   * "redistribute a missing component's weight proportionally across the
   * available ones."
   */
  private computeReadinessScore(components: Record<ReadinessComponentKey, number | null>): {
    readinessScore: number | null;
    insufficientData: boolean;
  } {
    let weightedSum = 0;
    let weightTotal = 0;

    (Object.keys(READINESS_COMPONENT_WEIGHTS) as ReadinessComponentKey[]).forEach((key) => {
      const value = components[key];
      if (value !== null) {
        const weight = READINESS_COMPONENT_WEIGHTS[key];
        weightedSum += value * weight;
        weightTotal += weight;
      }
    });

    if (weightTotal === 0) {
      return { readinessScore: null, insufficientData: true };
    }

    return { readinessScore: Math.round((weightedSum / weightTotal) * 100) / 100, insufficientData: false };
  }

  private insufficientDataResult(studentId: string, organizationId: string, interviewsCompleted: number): StudentReadinessResult {
    return {
      studentId,
      organizationId,
      interviewsCompleted,
      scoredInterviews: 0,
      readinessScore: null,
      readinessLevel: null,
      insufficientData: true,
      components: { ...EMPTY_COMPONENTS },
      evidence: { totalSkillEvidence: 0 },
    };
  }
}

export const placementReadinessService = new PlacementReadinessService();
