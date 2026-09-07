import Organization, { IOrganization } from '../models/Organization.model';
import Interview, { IInterview } from '../models/interview.model';
import { InterviewPurpose } from '../constants/interview';
import EmployerAssessmentProctoringConfig, {
  IEmployerAssessmentProctoringConfig,
  IEmployerAssessmentProctoringCapture,
  EmployerAssessmentProctoringEnforcement,
} from '../models/EmployerAssessmentProctoringConfig.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const CONFIG_VERSION = 'assessment-proctoring-config-v1';
const ENFORCEMENT_VALUES: EmployerAssessmentProctoringEnforcement[] = ['informational', 'warn_candidate'];

export interface ProctoringConfigInput {
  enabled: boolean;
  capture?: Partial<IEmployerAssessmentProctoringCapture>;
  enforcement?: EmployerAssessmentProctoringEnforcement;
}

/**
 * Employer-configured, OPT-IN proctoring foundation (31A) — event-type
 * capture toggles only, never camera/mic/screen/biometric capture. Default
 * disabled. `applicationId` is always resolved server-side from the
 * interview, never trusted from the client.
 */
export class EmployerAssessmentProctoringConfigService {
  /** GET .../proctoring-config — requires ORGANIZATION_VIEW. */
  async getConfig(organizationId: string, actingRole: OrganizationMemberRole, interviewId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const interview = await this.loadInterview(organization, interviewId);

    const config = await EmployerAssessmentProctoringConfig.findOne({ organizationId: organization._id, interviewId: interview._id });
    if (!config) {
      return {
        configured: false,
        enabled: false,
        capture: { tabVisibility: true, windowBlur: true, fullscreenExit: true, copyPaste: true, navigationAttempt: true },
        enforcement: 'informational',
      };
    }
    return this.toDetail(config);
  }

  /** PUT .../proctoring-config — requires INTERVIEWS_MANAGE. */
  async updateConfig(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    membershipId: string,
    interviewId: string,
    input: ProctoringConfigInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const interview = await this.loadInterview(organization, interviewId);

    if (!interview.employerApplicationId) {
      throw new ApiError(409, 'This interview is not linked to a hiring application.');
    }

    const enforcement = ENFORCEMENT_VALUES.includes(input.enforcement as EmployerAssessmentProctoringEnforcement)
      ? (input.enforcement as EmployerAssessmentProctoringEnforcement)
      : 'informational';
    const capture: IEmployerAssessmentProctoringCapture = {
      tabVisibility: input.capture?.tabVisibility !== false,
      windowBlur: input.capture?.windowBlur !== false,
      fullscreenExit: input.capture?.fullscreenExit !== false,
      copyPaste: input.capture?.copyPaste !== false,
      navigationAttempt: input.capture?.navigationAttempt !== false,
    };

    const config = await EmployerAssessmentProctoringConfig.findOneAndUpdate(
      { organizationId: organization._id, interviewId: interview._id },
      {
        $set: {
          applicationId: interview.employerApplicationId,
          enabled: Boolean(input.enabled),
          capture,
          enforcement,
          configVersion: CONFIG_VERSION,
          updatedByMembershipId: membershipId,
        },
        $setOnInsert: { createdByMembershipId: membershipId },
      },
      { upsert: true, new: true }
    );

    return this.toDetail(config!);
  }

  /** Internal, no-RBAC read used by the public candidate token flow and by the workflow/integrity engines — never HTTP-reachable directly. */
  async getConfigForInterview(organizationId: string, interviewId: string): Promise<IEmployerAssessmentProctoringConfig | null> {
    return EmployerAssessmentProctoringConfig.findOne({ organizationId, interviewId });
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(400, 'This organization is archived and read-only');
    }
  }

  private toDetail(config: IEmployerAssessmentProctoringConfig): Record<string, unknown> {
    return {
      configured: true,
      enabled: config.enabled,
      capture: config.capture,
      enforcement: config.enforcement,
      configVersion: config.configVersion,
      updatedAt: config.updatedAt,
    };
  }
}

export const employerAssessmentProctoringConfigService = new EmployerAssessmentProctoringConfigService();
export default employerAssessmentProctoringConfigService;
