import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerAssessmentProctoringConfig from '../models/EmployerAssessmentProctoringConfig.model';
import EmployerAssessmentProctoringEvent, {
  EmployerAssessmentProctoringEventType,
  EmployerAssessmentProctoringArea,
} from '../models/EmployerAssessmentProctoringEvent.model';
import EmployerInterviewScenario from '../models/EmployerInterviewScenario.model';
import EmployerCodingAssessmentSession from '../models/EmployerCodingAssessmentSession.model';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

export const PROCTORING_EVENT_VERSION = 'proctoring-event-v1';
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

const EVENT_TYPES: EmployerAssessmentProctoringEventType[] = [
  'session_started',
  'session_resumed',
  'visibility_hidden',
  'visibility_visible',
  'window_blur',
  'window_focus',
  'fullscreen_exit',
  'fullscreen_enter',
  'copy',
  'paste',
  'navigation_attempt',
];
const ASSESSMENT_AREAS: EmployerAssessmentProctoringArea[] = ['interview', 'scenario', 'coding'];

const CAPTURE_FLAG_BY_EVENT_TYPE: Partial<Record<EmployerAssessmentProctoringEventType, keyof import('../models/EmployerAssessmentProctoringConfig.model').IEmployerAssessmentProctoringCapture>> = {
  visibility_hidden: 'tabVisibility',
  visibility_visible: 'tabVisibility',
  window_blur: 'windowBlur',
  window_focus: 'windowBlur',
  fullscreen_exit: 'fullscreenExit',
  fullscreen_enter: 'fullscreenExit',
  copy: 'copyPaste',
  paste: 'copyPaste',
  navigation_attempt: 'navigationAttempt',
};

export interface RecordProctoringEventInput {
  eventType: string;
  assessmentArea: string;
  metadata?: { questionIndex?: number; scenarioId?: string; codingQuestionId?: string };
  occurredAt?: string;
}

/**
 * Deterministic (NO AI) recording of observable proctoring events (31A) —
 * event TYPE only, never clipboard content/camera/mic/screen data. Every
 * write is gated by the interview's own opt-in config; a disabled config
 * or capture toggle results in a controlled no-op, never an error that
 * would leak configuration details to an unauthenticated caller beyond
 * what's needed.
 */
export class EmployerAssessmentProctoringEventService {
  /** Trusted, no-RBAC entry point for the candidate token flow — the caller has already resolved/validated the exact org/interview chain. */
  async recordEvent(
    organizationId: Types.ObjectId,
    interview: IInterview,
    input: RecordProctoringEventInput
  ): Promise<{ recorded: boolean; reason?: string }> {
    if (!EVENT_TYPES.includes(input.eventType as EmployerAssessmentProctoringEventType)) {
      throw new ApiError(400, 'Invalid eventType');
    }
    if (!ASSESSMENT_AREAS.includes(input.assessmentArea as EmployerAssessmentProctoringArea)) {
      throw new ApiError(400, 'Invalid assessmentArea');
    }
    const eventType = input.eventType as EmployerAssessmentProctoringEventType;
    const assessmentArea = input.assessmentArea as EmployerAssessmentProctoringArea;

    const config = await EmployerAssessmentProctoringConfig.findOne({ organizationId, interviewId: interview._id });
    if (!config || !config.enabled) {
      return { recorded: false, reason: 'proctoring_disabled' };
    }

    const captureFlag = CAPTURE_FLAG_BY_EVENT_TYPE[eventType];
    if (captureFlag && !config.capture[captureFlag]) {
      return { recorded: false, reason: 'event_type_disabled' };
    }

    const metadata = await this.validateMetadata(organizationId, interview, assessmentArea, input.metadata);

    const now = new Date();
    let occurredAt = now;
    if (input.occurredAt) {
      const parsed = new Date(input.occurredAt);
      if (!Number.isNaN(parsed.getTime()) && Math.abs(now.getTime() - parsed.getTime()) <= MAX_TIMESTAMP_DRIFT_MS) {
        occurredAt = parsed;
      }
    }

    if (!interview.employerApplicationId) {
      return { recorded: false, reason: 'not_linked_to_application' };
    }

    await EmployerAssessmentProctoringEvent.create({
      organizationId,
      applicationId: interview.employerApplicationId,
      interviewId: interview._id,
      eventVersion: PROCTORING_EVENT_VERSION,
      eventType,
      assessmentArea,
      metadata,
      occurredAt,
      receivedAt: now,
    });

    return { recorded: true };
  }

  /** GET .../proctoring-events (employer-internal) — requires ORGANIZATION_VIEW. Most-recent-first, bounded. */
  async listEvents(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    interviewId: string,
    limit = 100
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const events = await EmployerAssessmentProctoringEvent.find({ organizationId: organization._id, interviewId: interview._id })
      .sort({ occurredAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200));

    return {
      events: events.map((e) => ({
        eventType: e.eventType,
        assessmentArea: e.assessmentArea,
        occurredAt: e.occurredAt,
        receivedAt: e.receivedAt,
      })),
    };
  }

  /** Never trusts arbitrary IDs — every reference is validated against THIS exact interview's own artifacts. Unknown/foreign references are dropped from the persisted metadata rather than rejecting the whole event. */
  private async validateMetadata(
    organizationId: Types.ObjectId,
    interview: IInterview,
    assessmentArea: EmployerAssessmentProctoringArea,
    metadata?: { questionIndex?: number; scenarioId?: string; codingQuestionId?: string }
  ): Promise<Record<string, unknown> | undefined> {
    if (!metadata) return undefined;
    const result: Record<string, unknown> = {};

    if (assessmentArea === 'interview' && typeof metadata.questionIndex === 'number') {
      if (Number.isInteger(metadata.questionIndex) && metadata.questionIndex >= 0 && metadata.questionIndex < interview.questions.length) {
        result.questionIndex = metadata.questionIndex;
      }
    }

    if (assessmentArea === 'scenario' && metadata.scenarioId && Types.ObjectId.isValid(metadata.scenarioId)) {
      const scenario = await EmployerInterviewScenario.findOne({
        _id: metadata.scenarioId,
        organizationId,
        interviewId: interview._id,
      }).select('_id');
      if (scenario) {
        result.scenarioId = scenario._id;
      }
    }

    if (assessmentArea === 'coding' && metadata.codingQuestionId && Types.ObjectId.isValid(metadata.codingQuestionId)) {
      const session = await EmployerCodingAssessmentSession.findOne({ organizationId, interviewId: interview._id }).select('questionIds');
      if (session && session.questionIds.some((id) => id.toString() === metadata.codingQuestionId)) {
        result.codingQuestionId = new Types.ObjectId(metadata.codingQuestionId);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
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
}

export const employerAssessmentProctoringEventService = new EmployerAssessmentProctoringEventService();
export default employerAssessmentProctoringEventService;
