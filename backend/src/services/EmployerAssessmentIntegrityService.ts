import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerAssessmentProctoringEvent from '../models/EmployerAssessmentProctoringEvent.model';
import EmployerAssessmentIntegritySummary, {
  IEmployerAssessmentIntegritySummary,
  IEmployerAssessmentIntegritySignal,
  EmployerAssessmentIntegritySignalLevel,
} from '../models/EmployerAssessmentIntegritySummary.model';
import { OrganizationType } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CALCULATION_VERSION = 'assessment-integrity-v1';

/**
 * Deterministic (NO AI) conversion of raw 31A proctoring events into
 * integrity SIGNALS (31B) — fixed, transparent thresholds only. Never a
 * cheating score/probability/deception detector; `reviewState` only ever
 * suggests that a human look at context, never accuses or decides.
 */
export class EmployerAssessmentIntegrityService {
  /** POST .../integrity/build — requires INTERVIEWS_MANAGE. Deterministic upsert-in-place; never auto-built on every event. */
  async buildSummary(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    if (!interview.employerApplicationId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application.');
    }

    const events = await EmployerAssessmentProctoringEvent.find({ organizationId: organization._id, interviewId: interview._id }).sort({
      occurredAt: 1,
    });

    const eventCounts = {
      visibilityHidden: events.filter((e) => e.eventType === 'visibility_hidden').length,
      windowBlur: events.filter((e) => e.eventType === 'window_blur').length,
      fullscreenExit: events.filter((e) => e.eventType === 'fullscreen_exit').length,
      copy: events.filter((e) => e.eventType === 'copy').length,
      paste: events.filter((e) => e.eventType === 'paste').length,
      navigationAttempt: events.filter((e) => e.eventType === 'navigation_attempt').length,
    };

    const signals = this.computeSignals(eventCounts);
    const reviewState = signals.some((s) => s.level === 'medium' || s.level === 'high') ? 'review_suggested' : 'no_signals';

    const timeline = {
      firstEventAt: events[0]?.occurredAt,
      lastEventAt: events[events.length - 1]?.occurredAt,
      totalRecordedEvents: events.length,
    };

    const generatedAt = new Date();
    const doc = await EmployerAssessmentIntegritySummary.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          calculationVersion: CALCULATION_VERSION,
          generatedAt,
          eventCounts,
          signals,
          timeline,
          reviewState,
        },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(doc!);
  }

  /** GET .../integrity — requires ANALYTICS_VIEW. Read-only; never builds. */
  async getSummary(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ANALYTICS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);

    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id }).select('_id purpose');
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }

    const doc = await EmployerAssessmentIntegritySummary.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!doc) {
      return { built: false };
    }
    return this.toDetail(doc);
  }

  /** Internal, no-RBAC read used by the 31C workflow engine's `integrity_review_state` condition field. */
  async getReviewStateForInterview(organizationId: string, interviewId: string): Promise<string | undefined> {
    const doc = await EmployerAssessmentIntegritySummary.findOne({ organizationId, interviewId }).select('reviewState');
    return doc?.reviewState;
  }

  /**
   * Fixed, transparent thresholds (31B section 11) — never infers WHY an
   * event happened, only reports counts/levels. Descriptions are plain
   * factual counts, never accusatory language.
   */
  private computeSignals(counts: {
    visibilityHidden: number;
    windowBlur: number;
    fullscreenExit: number;
    copy: number;
    paste: number;
    navigationAttempt: number;
  }): IEmployerAssessmentIntegritySignal[] {
    const signals: IEmployerAssessmentIntegritySignal[] = [];

    const tabLevel = this.levelForThresholds(counts.visibilityHidden, 3, 6);
    if (tabLevel) {
      signals.push({
        signalType: 'repeated_tab_switching',
        level: tabLevel,
        eventCount: counts.visibilityHidden,
        description: `${counts.visibilityHidden} tab visibility change${counts.visibilityHidden === 1 ? ' was' : 's were'} recorded.`,
      });
    }

    const blurLevel = this.levelForThresholds(counts.windowBlur, 4, 8);
    if (blurLevel) {
      signals.push({
        signalType: 'repeated_window_blur',
        level: blurLevel,
        eventCount: counts.windowBlur,
        description: `${counts.windowBlur} window focus change${counts.windowBlur === 1 ? ' was' : 's were'} recorded.`,
      });
    }

    const fullscreenLevel = this.levelForThresholds(counts.fullscreenExit, 2, 4);
    if (fullscreenLevel) {
      signals.push({
        signalType: 'repeated_fullscreen_exit',
        level: fullscreenLevel,
        eventCount: counts.fullscreenExit,
        description: `${counts.fullscreenExit} fullscreen exit${counts.fullscreenExit === 1 ? ' was' : 's were'} recorded.`,
      });
    }

    const copyPasteCount = counts.copy + counts.paste;
    const copyPasteLevel = this.levelForThresholds(copyPasteCount, 3, 6);
    if (copyPasteLevel) {
      signals.push({
        signalType: 'repeated_copy_paste',
        level: copyPasteLevel,
        eventCount: copyPasteCount,
        description: `${copyPasteCount} copy/paste action${copyPasteCount === 1 ? ' was' : 's were'} recorded.`,
      });
    }

    const navLevel = this.levelForThresholds(counts.navigationAttempt, 2, 4);
    if (navLevel) {
      signals.push({
        signalType: 'navigation_activity',
        level: navLevel,
        eventCount: counts.navigationAttempt,
        description: `${counts.navigationAttempt} navigation attempt${counts.navigationAttempt === 1 ? ' was' : 's were'} recorded.`,
      });
    }

    return signals;
  }

  /** count===0 -> no signal at all; below `mediumAt` -> low; below `highAt` -> medium; otherwise high. */
  private levelForThresholds(count: number, mediumAt: number, highAt: number): EmployerAssessmentIntegritySignalLevel | null {
    if (count <= 0) return null;
    if (count >= highAt) return 'high';
    if (count >= mediumAt) return 'medium';
    return 'low';
  }

  private async loadInterview(organization: IOrganization, interviewId: string): Promise<IInterview> {
    const interview = await Interview.findOne({ _id: interviewId, organizationId: organization._id });
    if (!interview || interview.purpose !== InterviewPurpose.HIRING_ASSESSMENT) {
      throw new ApiError(404, 'Interview session not found');
    }
    return interview;
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

  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  private toDetail(doc: IEmployerAssessmentIntegritySummary): Record<string, unknown> {
    return {
      built: true,
      calculationVersion: doc.calculationVersion,
      generatedAt: doc.generatedAt,
      eventCounts: doc.eventCounts,
      signals: doc.signals,
      timeline: doc.timeline,
      reviewState: doc.reviewState,
    };
  }
}

export const employerAssessmentIntegrityService = new EmployerAssessmentIntegrityService();
export default employerAssessmentIntegrityService;
