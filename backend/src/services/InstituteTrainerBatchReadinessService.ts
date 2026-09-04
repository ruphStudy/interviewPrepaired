import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBatch, { IInstituteBatch } from '../models/InstituteBatch.model';
import InstituteStudent from '../models/InstituteStudent.model';
import InstituteTrainerAssignment from '../models/InstituteTrainerAssignment.model';
import { InstituteStudentStatus } from '../constants/instituteStudent';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ReadinessLevel } from '../constants/placementReadiness';
import { ApiError } from '../utils/ApiError';
import { placementReadinessService } from './PlacementReadinessService';

type StudentReadinessResult = Awaited<ReturnType<typeof placementReadinessService.calculateStudentReadiness>>;

interface StudentReadinessRow {
  student: { id: string; firstName: string; lastName?: string; enrollmentNumber?: string };
  readinessScore: StudentReadinessResult['readinessScore'];
  readinessLevel: StudentReadinessResult['readinessLevel'];
  insufficientData: boolean;
  interviewsCompleted: number;
  scoredInterviews: number;
  components: StudentReadinessResult['components'];
}

interface BatchReadinessAnalytics {
  summary: {
    totalStudents: number;
    studentsAssessed: number;
    insufficientData: number;
    averageReadinessScore: number | null;
    needsFoundation: number;
    developing: number;
    interviewReady: number;
    strong: number;
    excellent: number;
  };
  students: StudentReadinessRow[];
}

/**
 * Trainer batch placement-readiness analytics (15C) — read-only, scoped to
 * a single batch the calling TRAINER can access (same rule as 14C/14D:
 * direct batch assignment, or a course assignment matching the batch's own
 * course). The actual per-student readiness figure is entirely delegated to
 * PlacementReadinessService.calculateStudentReadiness (15A) — no
 * calculation/weights/thresholds are duplicated here, this is purely
 * batch-level aggregation of that engine's own output.
 */
export class InstituteTrainerBatchReadinessService {
  async getBatchReadiness(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    trainerMembershipId: Types.ObjectId,
    batchId: string
  ): Promise<BatchReadinessAnalytics> {
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
      .select('firstName lastName enrollmentNumber')
      .lean();

    if (students.length === 0) {
      return {
        summary: {
          totalStudents: 0,
          studentsAssessed: 0,
          insufficientData: 0,
          averageReadinessScore: null,
          needsFoundation: 0,
          developing: 0,
          interviewReady: 0,
          strong: 0,
          excellent: 0,
        },
        students: [],
      };
    }

    const readinessResults = await Promise.all(
      students.map((student) =>
        placementReadinessService.calculateStudentReadiness({
          organizationId: organization._id.toString(),
          studentId: student._id.toString(),
        })
      )
    );

    const levelCounts: Record<ReadinessLevel, number> = {
      [ReadinessLevel.NEEDS_FOUNDATION]: 0,
      [ReadinessLevel.DEVELOPING]: 0,
      [ReadinessLevel.INTERVIEW_READY]: 0,
      [ReadinessLevel.STRONG]: 0,
      [ReadinessLevel.EXCELLENT]: 0,
    };

    let studentsAssessed = 0;
    let insufficientDataCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    const rows: StudentReadinessRow[] = students.map((student, index) => {
      const result = readinessResults[index];

      if (result.readinessScore !== null) {
        studentsAssessed += 1;
        scoreSum += result.readinessScore;
        scoreCount += 1;
        if (result.readinessLevel) {
          levelCounts[result.readinessLevel] += 1;
        }
      } else {
        insufficientDataCount += 1;
      }

      return {
        student: {
          id: student._id.toString(),
          firstName: student.firstName,
          lastName: student.lastName,
          enrollmentNumber: student.enrollmentNumber,
        },
        readinessScore: result.readinessScore,
        readinessLevel: result.readinessLevel,
        insufficientData: result.insufficientData,
        interviewsCompleted: result.interviewsCompleted,
        scoredInterviews: result.scoredInterviews,
        components: result.components,
      };
    });

    // Scored students first, best readinessScore first; insufficient-data
    // students last. Name is the tie-break within each group.
    rows.sort((a, b) => {
      const aHasScore = a.readinessScore !== null;
      const bHasScore = b.readinessScore !== null;
      if (aHasScore !== bHasScore) return aHasScore ? -1 : 1;
      if (aHasScore) {
        const diff = b.readinessScore! - a.readinessScore!;
        if (diff !== 0) return diff;
      }
      const nameA = `${a.student.firstName} ${a.student.lastName ?? ''}`.trim().toLowerCase();
      const nameB = `${b.student.firstName} ${b.student.lastName ?? ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const averageReadinessScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 100) / 100 : null;

    return {
      summary: {
        totalStudents: students.length,
        studentsAssessed,
        insufficientData: insufficientDataCount,
        averageReadinessScore,
        needsFoundation: levelCounts[ReadinessLevel.NEEDS_FOUNDATION],
        developing: levelCounts[ReadinessLevel.DEVELOPING],
        interviewReady: levelCounts[ReadinessLevel.INTERVIEW_READY],
        strong: levelCounts[ReadinessLevel.STRONG],
        excellent: levelCounts[ReadinessLevel.EXCELLENT],
      },
      students: rows,
    };
  }

  /**
   * Same authorization gate as 14C/14D: an EXACT {_id, organizationId}
   * batch, and either a direct trainer->batch assignment or a
   * trainer->course assignment matching the batch's own courseId. Anything
   * else is the same 404 "Batch not found".
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

export const instituteTrainerBatchReadinessService = new InstituteTrainerBatchReadinessService();
