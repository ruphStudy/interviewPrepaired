import Organization, { IOrganization } from '../models/Organization.model';
import InstituteBranch from '../models/InstituteBranch.model';
import { InstituteBranchStatus } from '../constants/instituteBranch';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

interface ListBranchesParams {
  page: number;
  limit: number;
  status?: InstituteBranchStatus;
}

interface BranchFields {
  name?: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Institute branch management (10B). Authorization mirrors
 * OrganizationMemberService: the `requireOrganizationPermission` middleware
 * (8D) resolves the caller's trusted role onto the request, and these
 * methods take that already-trusted `organizationId`/`actingRole` — never an
 * `actingUserId` + re-deriving ownership. Every method re-asserts the
 * relevant permission via the centralized 8C matrix as defense in depth.
 * Institute-only: a COMPANY organization gets 400 from every method here.
 */
export class InstituteBranchService {
  async getBranches(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    params: ListBranchesParams
  ): Promise<{
    branches: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    const filter: Record<string, unknown> = { organizationId: organization._id };
    if (params.status) filter.status = params.status;
    const skip = (params.page - 1) * params.limit;

    const [branches, total] = await Promise.all([
      InstituteBranch.find(filter).sort({ createdAt: -1 }).skip(skip).limit(params.limit).lean(),
      InstituteBranch.countDocuments(filter),
    ]);

    return {
      branches: branches.map((b) => this.toDetail(b)),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    };
  }

  async getBranchById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    branchId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);

    // Tenant-scoped: never findById(branchId) alone.
    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId: organization._id }).lean();
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }
    return this.toDetail(branch);
  }

  async createBranch(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: BranchFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const name = fields.name?.trim();
    if (!name) {
      throw new ApiError(400, 'name is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    try {
      const branch = await InstituteBranch.create({
        organizationId: organization._id,
        name,
        code: this.normalizeCode(fields.code),
        addressLine1: fields.addressLine1?.trim() || undefined,
        addressLine2: fields.addressLine2?.trim() || undefined,
        city: fields.city?.trim() || undefined,
        state: fields.state?.trim() || undefined,
        country: fields.country?.trim() || undefined,
        postalCode: fields.postalCode?.trim() || undefined,
        contactEmail: fields.contactEmail?.trim().toLowerCase() || undefined,
        contactPhone: fields.contactPhone?.trim() || undefined,
        status: InstituteBranchStatus.ACTIVE,
      });
      return this.toDetail(branch.toObject());
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A branch with this code already exists in this organization');
      }
      throw error;
    }
  }

  /** PATCH-like merge despite the PUT route — status is never accepted here; DELETE is the only status transition. */
  async updateBranch(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    branchId: string,
    fields: BranchFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    if (Object.values(fields).every((value) => value === undefined)) {
      throw new ApiError(400, 'At least one field is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId: organization._id });
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }

    if (fields.name !== undefined) {
      const trimmedName = fields.name.trim();
      if (!trimmedName) {
        throw new ApiError(400, 'name cannot be empty');
      }
      branch.name = trimmedName;
    }
    if (fields.code !== undefined) branch.code = this.normalizeCode(fields.code);
    if (fields.addressLine1 !== undefined) branch.addressLine1 = fields.addressLine1.trim() || undefined;
    if (fields.addressLine2 !== undefined) branch.addressLine2 = fields.addressLine2.trim() || undefined;
    if (fields.city !== undefined) branch.city = fields.city.trim() || undefined;
    if (fields.state !== undefined) branch.state = fields.state.trim() || undefined;
    if (fields.country !== undefined) branch.country = fields.country.trim() || undefined;
    if (fields.postalCode !== undefined) branch.postalCode = fields.postalCode.trim() || undefined;
    if (fields.contactEmail !== undefined) branch.contactEmail = fields.contactEmail.trim().toLowerCase() || undefined;
    if (fields.contactPhone !== undefined) branch.contactPhone = fields.contactPhone.trim() || undefined;

    try {
      await branch.save();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ApiError(409, 'A branch with this code already exists in this organization');
      }
      throw error;
    }

    return this.toDetail(branch.toObject());
  }

  /** Soft deactivate only — never a physical delete. Idempotent if already inactive. */
  async removeBranch(organizationId: string, actingRole: OrganizationMemberRole, branchId: string): Promise<void> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const branch = await InstituteBranch.findOne({ _id: branchId, organizationId: organization._id });
    if (!branch) {
      throw new ApiError(404, 'Branch not found');
    }

    if (branch.status !== InstituteBranchStatus.INACTIVE) {
      branch.status = InstituteBranchStatus.INACTIVE;
      await branch.save();
    }
  }

  private normalizeCode(code?: string): string | undefined {
    if (code === undefined) return undefined;
    return code.trim().toUpperCase() || undefined;
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

  /** Type guard — never a silent empty branch list/detail for a company org. */
  private assertIsInstitute(organization: IOrganization): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  private toDetail(branch: any): Record<string, unknown> {
    return {
      id: branch._id.toString(),
      organizationId: branch.organizationId.toString(),
      name: branch.name,
      code: branch.code,
      addressLine1: branch.addressLine1,
      addressLine2: branch.addressLine2,
      city: branch.city,
      state: branch.state,
      country: branch.country,
      postalCode: branch.postalCode,
      contactEmail: branch.contactEmail,
      contactPhone: branch.contactPhone,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }
}

export const instituteBranchService = new InstituteBranchService();
