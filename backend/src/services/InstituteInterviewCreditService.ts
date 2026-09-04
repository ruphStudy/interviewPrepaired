import Organization, { IOrganization } from '../models/Organization.model';
import { IOrganizationInterviewCreditLedger } from '../models/OrganizationInterviewCreditLedger.model';
import { organizationInterviewCreditService } from './OrganizationInterviewCreditService';
import { INSTITUTE_PLANS, InstitutePlanCode, getInstitutePlan } from '../constants/institutePlan';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface GrantFields {
  planCode?: string;
  amount?: number;
  idempotencyKey: string;
}

interface LedgerRow {
  id: string;
  type: IOrganizationInterviewCreditLedger['type'];
  amount: number;
  balanceAfter: number;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdAt: Date;
}

/**
 * Institute-facing wrapper around OrganizationInterviewCreditService (15E)
 * — adds RBAC, institute-only scoping, and the plan-code/manual-amount
 * grant policy on top of the pure ledger primitives. This is the ONLY
 * place plan codes are resolved to a credit amount; the underlying ledger
 * service knows nothing about plans. No payment gateway/subscription
 * billing model — grantCredits() here is a temporary admin/owner-style
 * foundation endpoint, not a purchase flow.
 */
export class InstituteInterviewCreditService {
  /** GET /interview-credits — balance + safe public plan catalog. Read-only, so an archived organization remains readable. */
  async getCreditSummary(
    organizationId: string,
    actingRole: OrganizationMemberRole
  ): Promise<{ balance: number; plans: typeof INSTITUTE_PLANS }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const balance = await organizationInterviewCreditService.getBalance(organization._id.toString());
    return { balance, plans: INSTITUTE_PLANS };
  }

  /** GET /interview-credits/ledger — paginated audit history. Never exposes OrganizationInterviewCreditOperation (internal reservation) records. */
  async getLedger(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: { page?: number; limit?: number }
  ): Promise<{ transactions: LedgerRow[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const { transactions, page, limit, total } = await organizationInterviewCreditService.getLedger(
      organization._id.toString(),
      params
    );

    return {
      transactions: transactions.map((t) => this.toLedgerRow(t)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * POST /interview-credits/grant — temporary admin/owner-style foundation
   * grant, NOT a payment purchase flow. Exactly one of planCode/amount:
   * planCode STARTER/GROWTH/PRO grants that plan's fixed interviewCredits;
   * ENTERPRISE can never auto-grant (its volume is custom/negotiated); a
   * manual `amount` must be a positive integer.
   */
  async grantCredits(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    grantedByMembershipId: string,
    fields: GrantFields
  ): Promise<LedgerRow> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const hasPlanCode = !!fields.planCode;
    const hasAmount = fields.amount !== undefined && fields.amount !== null;
    if (hasPlanCode === hasAmount) {
      throw new ApiError(400, 'Provide exactly one of planCode or amount');
    }
    if (!fields.idempotencyKey) {
      throw new ApiError(400, 'idempotencyKey is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    let amount: number;
    let description: string;
    let referenceId: string | undefined;

    if (hasPlanCode) {
      const plan = getInstitutePlan(fields.planCode!);
      if (!plan) {
        throw new ApiError(400, `Unknown plan code: ${fields.planCode}`);
      }
      if (plan.code === InstitutePlanCode.ENTERPRISE || plan.interviewCredits === null) {
        throw new ApiError(400, 'Enterprise plan credits are custom and cannot be auto-granted');
      }
      amount = plan.interviewCredits;
      description = `${amount} interview credit(s) for ${plan.name} plan`;
      referenceId = plan.code;
    } else {
      if (!Number.isInteger(fields.amount) || fields.amount! <= 0) {
        throw new ApiError(400, 'amount must be a positive integer');
      }
      amount = fields.amount!;
      description = `Manual credit grant of ${amount} interview credit(s)`;
    }

    const transaction = await organizationInterviewCreditService.grantCredits({
      organizationId: organization._id.toString(),
      amount,
      referenceType: hasPlanCode ? 'plan' : 'admin',
      referenceId: hasPlanCode ? referenceId : grantedByMembershipId,
      idempotencyKey: fields.idempotencyKey,
      description,
      metadata: hasPlanCode ? { planCode: fields.planCode, grantedByMembershipId } : { grantedByMembershipId },
    });

    return this.toLedgerRow(transaction);
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — institute interview credits don't apply to a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  /** Safe row shape — never exposes idempotencyKey/metadata internals or OrganizationInterviewCreditOperation reservation records. */
  private toLedgerRow(transaction: IOrganizationInterviewCreditLedger): LedgerRow {
    return {
      id: transaction._id.toString(),
      type: transaction.type,
      amount: transaction.amount,
      balanceAfter: transaction.balanceAfter,
      referenceType: transaction.referenceType,
      referenceId: transaction.referenceId,
      description: transaction.description,
      createdAt: transaction.createdAt,
    };
  }
}

export const instituteInterviewCreditService = new InstituteInterviewCreditService();
