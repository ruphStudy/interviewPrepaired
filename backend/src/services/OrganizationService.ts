import { Types } from 'mongoose';
import Organization, {
  IOrganizationSettings,
  IInstituteProfile,
  ICompanyProfile,
} from '../models/Organization.model';
import OrganizationMember from '../models/OrganizationMember.model';
import {
  OrganizationType,
  OrganizationStatus,
  OrganizationDateFormat,
  OrganizationTimeFormat,
  InstituteKind,
  CompanySize,
  DEFAULT_ORGANIZATION_TIMEZONE,
  DEFAULT_ORGANIZATION_LOCALE,
  DEFAULT_ORGANIZATION_DATE_FORMAT,
  DEFAULT_ORGANIZATION_TIME_FORMAT,
} from '../constants/organization';
import { OrganizationMemberRole, OrganizationMemberStatus } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { DEFAULT_LANGUAGE_CODE, SupportedLanguageCode } from '../config/languages';
import { slugifyOrganizationName } from '../utils/slug';
import { ApiError } from '../utils/ApiError';

const MAX_SLUG_ATTEMPTS = 100;
const MAX_SAVE_ATTEMPTS = 5;

interface CreateOrganizationParams {
  userId: string;
  name: string;
  type: OrganizationType;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings?: IOrganizationSettings;
  instituteProfile?: IInstituteProfile;
  companyProfile?: ICompanyProfile;
}

interface ListOrganizationsParams {
  userId: string;
  page: number;
  limit: number;
  type?: OrganizationType;
  status?: OrganizationStatus;
}

interface UpdateOrganizationFields {
  name?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  settings?: IOrganizationSettings;
  instituteProfile?: IInstituteProfile;
  companyProfile?: ICompanyProfile;
}

interface OrganizationSettingsDetail {
  timezone: string;
  locale: string;
  dateFormat: OrganizationDateFormat;
  timeFormat: OrganizationTimeFormat;
  defaultInterviewLanguage: SupportedLanguageCode;
}

interface UpdateSettingsFields {
  timezone?: string;
  locale?: string;
  dateFormat?: OrganizationDateFormat;
  timeFormat?: OrganizationTimeFormat;
  defaultInterviewLanguage?: SupportedLanguageCode;
}

interface UpdateInstituteProfileFields {
  instituteKind?: InstituteKind;
  officialName?: string;
  instituteCode?: string;
  affiliation?: string;
  accreditation?: string;
  universityName?: string;
  establishedYear?: number;
  studentCount?: number;
  description?: string;
  website?: string;
  placementEmail?: string;
  placementPhone?: string;
}

interface UpdateCompanyProfileFields {
  industry?: string;
  companySize?: CompanySize;
  establishedYear?: number;
  officialName?: string;
  companyCode?: string;
  description?: string;
  website?: string;
  careersUrl?: string;
  headquarters?: string;
  linkedinUrl?: string;
  hiringEmail?: string;
  hiringPhone?: string;
}

export class OrganizationService {
  async createOrganization(params: CreateOrganizationParams): Promise<Record<string, unknown>> {
    this.assertProfileMatchesType(params.type, params.instituteProfile, params.companyProfile);

    let lastDuplicateKeyError: unknown;

    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
      const slug = await this.generateUniqueSlug(params.name);

      const organization = new Organization({
        ownerUserId: new Types.ObjectId(params.userId),
        name: params.name.trim(),
        slug,
        type: params.type,
        description: params.description?.trim() || undefined,
        website: params.website?.trim() || undefined,
        logoUrl: params.logoUrl?.trim() || undefined,
        contactEmail: params.contactEmail?.trim().toLowerCase() || undefined,
        contactPhone: params.contactPhone?.trim() || undefined,
        settings: params.settings,
        instituteProfile: params.instituteProfile,
        companyProfile: params.companyProfile,
      });

      try {
        await organization.save();
        return this.toDetail(organization.toObject());
      } catch (error: any) {
        // Race: another request took this exact slug between generation and
        // save — the DB unique index is authoritative. Regenerate and retry.
        if (error?.code === 11000) {
          lastDuplicateKeyError = error;
          continue;
        }
        throw error;
      }
    }

    console.error('[OrganizationService] Exhausted slug save retries:', lastDuplicateKeyError);
    throw new ApiError(409, 'Unable to generate unique organization slug');
  }

  /**
   * Discovery list — every organization the caller can actually access:
   * the ones they own, OR the ones where they hold an ACTIVE
   * OrganizationMember row (an INACTIVE membership grants no discovery,
   * same as it grants no RBAC access via requireOrganizationPermission).
   * The `$or` is evaluated against the Organization collection itself, so
   * each matching document is naturally returned exactly once even when a
   * caller is both the owner and separately has a mirrored OWNER
   * membership row — no manual de-dup needed.
   */
  async getOrganizations(params: ListOrganizationsParams): Promise<{
    organizations: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { userId, page, limit, type, status } = params;
    const userObjectId = new Types.ObjectId(userId);

    const memberOrganizationIds = await OrganizationMember.find({
      userId: userObjectId,
      status: OrganizationMemberStatus.ACTIVE,
    })
      .distinct('organizationId');

    const filter: Record<string, unknown> = {
      $or: [{ ownerUserId: userObjectId }, { _id: { $in: memberOrganizationIds } }],
    };
    if (type) filter.type = type;
    if (status) filter.status = status;
    const skip = (page - 1) * limit;

    const [organizations, total] = await Promise.all([
      Organization.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Organization.countDocuments(filter),
    ]);

    return {
      organizations: organizations.map((org) => this.toSummary(org)),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Trusted — `organizationId` and `actingRole` come from the
   * `requireOrganizationPermission` RBAC middleware (8D), which already
   * verified the caller has an ACTIVE membership. This re-asserts
   * ORGANIZATION_VIEW as defense in depth via the same 8C matrix.
   */
  async getOrganizationById(organizationId: string, actingRole: OrganizationMemberRole): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await Organization.findById(organizationId).lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return this.toDetail(organization);
  }

  /** Trusted — see getOrganizationById. Re-asserts ORGANIZATION_UPDATE. */
  async updateOrganizationTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: UpdateOrganizationFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const {
      name,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    } = fields;

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }

    if (instituteProfile !== undefined || companyProfile !== undefined) {
      this.assertProfileMatchesType(organization.type, instituteProfile, companyProfile);
    }

    if (name !== undefined) organization.name = name.trim();
    if (description !== undefined) organization.description = description.trim() || undefined;
    if (website !== undefined) organization.website = website.trim() || undefined;
    if (logoUrl !== undefined) organization.logoUrl = logoUrl.trim() || undefined;
    if (contactEmail !== undefined) organization.contactEmail = contactEmail.trim().toLowerCase() || undefined;
    if (contactPhone !== undefined) organization.contactPhone = contactPhone.trim() || undefined;
    // Only the known `timezone` setting exists — whole-object replacement,
    // never an arbitrary/unbounded settings bag.
    if (settings !== undefined) organization.settings = { timezone: settings.timezone };
    // Whole-object replacement for supplied profiles, not a per-field merge.
    if (instituteProfile !== undefined) organization.instituteProfile = instituteProfile;
    if (companyProfile !== undefined) organization.companyProfile = companyProfile;

    await organization.save();
    return this.toDetail(organization.toObject());
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_VIEW.
   * Read-only: never mutates/saves, even when the stored document is
   * missing newly-added fields — old docs are backfilled with defaults only
   * in the returned value, never in the database.
   */
  async getSettingsTrusted(organizationId: string, actingRole: OrganizationMemberRole): Promise<OrganizationSettingsDetail> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await Organization.findById(organizationId).select('settings').lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }

    return this.toEffectiveSettings(organization.settings);
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_UPDATE.
   * PATCH-like merge despite the PUT route: only supplied fields change,
   * omitted fields keep their current effective value — a client can never
   * accidentally reset unrelated settings by sending a partial body.
   */
  async updateSettingsTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: UpdateSettingsFields
  ): Promise<OrganizationSettingsDetail> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertOrganizationMutable(organization);

    const effective = this.toEffectiveSettings(organization.settings);
    organization.settings = {
      timezone: fields.timezone !== undefined ? fields.timezone : effective.timezone,
      locale: fields.locale !== undefined ? fields.locale : effective.locale,
      dateFormat: fields.dateFormat !== undefined ? fields.dateFormat : effective.dateFormat,
      timeFormat: fields.timeFormat !== undefined ? fields.timeFormat : effective.timeFormat,
      defaultInterviewLanguage:
        fields.defaultInterviewLanguage !== undefined ? fields.defaultInterviewLanguage : effective.defaultInterviewLanguage,
    };

    await organization.save();
    return this.toEffectiveSettings(organization.settings);
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_VIEW.
   * Institute-only (400 for a company organization). Read-only: never
   * creates/saves a missing instituteProfile — an old institute doc without
   * one simply returns a profile object of all-optional fields.
   */
  async getInstituteProfileTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await Organization.findById(organizationId)
      .select('name slug status type instituteProfile')
      .lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertIsInstitute(organization);

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
      profile: this.toInstituteProfileDetail(organization.instituteProfile),
    };
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_UPDATE.
   * Institute-only (400 for a company organization); rejects an archived
   * organization (409). PATCH-like merge despite the PUT route: only
   * supplied fields change, omitted fields keep their current value — the
   * embedded profile is created from scratch if this is the first update on
   * an old institute doc that never had one.
   */
  async updateInstituteProfileTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: UpdateInstituteProfileFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertIsInstitute(organization);
    this.assertOrganizationMutable(organization);

    const current = organization.instituteProfile ?? {};
    organization.instituteProfile = {
      instituteKind: fields.instituteKind !== undefined ? fields.instituteKind : current.instituteKind,
      officialName: fields.officialName !== undefined ? fields.officialName.trim() || undefined : current.officialName,
      instituteCode:
        fields.instituteCode !== undefined ? fields.instituteCode.trim().toUpperCase() || undefined : current.instituteCode,
      affiliation: fields.affiliation !== undefined ? fields.affiliation.trim() || undefined : current.affiliation,
      accreditation: fields.accreditation !== undefined ? fields.accreditation.trim() || undefined : current.accreditation,
      universityName:
        fields.universityName !== undefined ? fields.universityName.trim() || undefined : current.universityName,
      establishedYear: fields.establishedYear !== undefined ? fields.establishedYear : current.establishedYear,
      studentCount: fields.studentCount !== undefined ? fields.studentCount : current.studentCount,
      description: fields.description !== undefined ? fields.description.trim() || undefined : current.description,
      website: fields.website !== undefined ? fields.website.trim() || undefined : current.website,
      placementEmail:
        fields.placementEmail !== undefined ? fields.placementEmail.trim().toLowerCase() || undefined : current.placementEmail,
      placementPhone: fields.placementPhone !== undefined ? fields.placementPhone.trim() || undefined : current.placementPhone,
    };

    await organization.save();

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
      profile: this.toInstituteProfileDetail(organization.instituteProfile),
    };
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_VIEW.
   * Company-only (400 for an institute organization). Read-only: never
   * creates/saves a missing companyProfile — an old company doc without one
   * simply returns a profile object of all-optional fields.
   */
  async getCompanyProfileTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);

    const organization = await Organization.findById(organizationId)
      .select('name slug status type companyProfile')
      .lean();
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertIsCompany(organization);

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
      profile: this.toCompanyProfileDetail(organization.companyProfile),
    };
  }

  /**
   * Trusted — see getOrganizationById. Re-asserts ORGANIZATION_UPDATE.
   * Company-only (400 for an institute organization); rejects an archived
   * organization (409). PATCH-like merge despite the PUT route: only
   * supplied fields change, omitted fields keep their current value — the
   * embedded profile is created from scratch if this is the first update on
   * an old company doc that never had one. Never touches type/status/slug/
   * ownerUserId — those are not part of this profile at all.
   */
  async updateCompanyProfileTrusted(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    fields: UpdateCompanyProfileFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_UPDATE);

    const organization = await Organization.findById(organizationId);
    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const current = organization.companyProfile ?? {};
    organization.companyProfile = {
      industry: fields.industry !== undefined ? fields.industry.trim() || undefined : current.industry,
      companySize: fields.companySize !== undefined ? fields.companySize : current.companySize,
      establishedYear: fields.establishedYear !== undefined ? fields.establishedYear : current.establishedYear,
      officialName: fields.officialName !== undefined ? fields.officialName.trim() || undefined : current.officialName,
      companyCode: fields.companyCode !== undefined ? fields.companyCode.trim().toUpperCase() || undefined : current.companyCode,
      description: fields.description !== undefined ? fields.description.trim() || undefined : current.description,
      website: fields.website !== undefined ? fields.website.trim() || undefined : current.website,
      careersUrl: fields.careersUrl !== undefined ? fields.careersUrl.trim() || undefined : current.careersUrl,
      headquarters: fields.headquarters !== undefined ? fields.headquarters.trim() || undefined : current.headquarters,
      linkedinUrl: fields.linkedinUrl !== undefined ? fields.linkedinUrl.trim() || undefined : current.linkedinUrl,
      hiringEmail: fields.hiringEmail !== undefined ? fields.hiringEmail.trim().toLowerCase() || undefined : current.hiringEmail,
      hiringPhone: fields.hiringPhone !== undefined ? fields.hiringPhone.trim() || undefined : current.hiringPhone,
    };

    await organization.save();

    return {
      organization: {
        id: organization._id.toString(),
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
      profile: this.toCompanyProfileDetail(organization.companyProfile),
    };
  }

  /** Soft archive only — never a physical delete, never cascades to interviews/question sets. Idempotent if already archived. */
  async deleteOrganization(userId: string, organizationId: string): Promise<void> {
    const result = await Organization.updateOne(
      { _id: organizationId, ownerUserId: new Types.ObjectId(userId) },
      { $set: { status: OrganizationStatus.ARCHIVED } }
    );
    if (result.matchedCount === 0) {
      throw new ApiError(404, 'Organization not found');
    }
  }

  /** Defense in depth — the RBAC middleware already checked this; never duplicates the 8C matrix, just reuses it. */
  private assertHasPermission(role: OrganizationMemberRole, permission: OrganizationPermission): void {
    if (!hasOrganizationPermission(role, permission)) {
      throw new ApiError(403, 'You do not have permission to perform this action');
    }
  }

  private assertOrganizationMutable(organization: { status: OrganizationStatus }): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard for the institute-profile endpoints — never a silent empty profile for a company org. */
  private assertIsInstitute(organization: { type: OrganizationType }): void {
    if (organization.type !== OrganizationType.INSTITUTE) {
      throw new ApiError(400, 'This organization is not an institute');
    }
  }

  /** Type guard for the company-profile endpoints — never a silent empty profile for an institute org. */
  private assertIsCompany(organization: { type: OrganizationType }): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Single source of truth for the institute-profile response shape — used by both get and update. */
  private toInstituteProfileDetail(profile?: IInstituteProfile): Record<string, unknown> {
    return {
      instituteKind: profile?.instituteKind,
      officialName: profile?.officialName,
      instituteCode: profile?.instituteCode,
      affiliation: profile?.affiliation,
      accreditation: profile?.accreditation,
      universityName: profile?.universityName,
      establishedYear: profile?.establishedYear,
      studentCount: profile?.studentCount,
      description: profile?.description,
      website: profile?.website,
      placementEmail: profile?.placementEmail,
      placementPhone: profile?.placementPhone,
    };
  }

  /** Single source of truth for the company-profile response shape — used by both get and update. */
  private toCompanyProfileDetail(profile?: ICompanyProfile): Record<string, unknown> {
    return {
      industry: profile?.industry,
      companySize: profile?.companySize,
      establishedYear: profile?.establishedYear,
      officialName: profile?.officialName,
      companyCode: profile?.companyCode,
      description: profile?.description,
      website: profile?.website,
      careersUrl: profile?.careersUrl,
      headquarters: profile?.headquarters,
      linkedinUrl: profile?.linkedinUrl,
      hiringEmail: profile?.hiringEmail,
      hiringPhone: profile?.hiringPhone,
    };
  }

  private assertProfileMatchesType(
    type: OrganizationType,
    instituteProfile?: IInstituteProfile,
    companyProfile?: ICompanyProfile
  ): void {
    if (type === OrganizationType.INSTITUTE && companyProfile !== undefined) {
      throw new ApiError(400, 'companyProfile is not allowed when organization type is "institute"');
    }
    if (type === OrganizationType.COMPANY && instituteProfile !== undefined) {
      throw new ApiError(400, 'instituteProfile is not allowed when organization type is "company"');
    }
  }

  /** Single source of truth for "settings with defaults applied" — used by both getSettingsTrusted (read-only) and updateSettingsTrusted (merge base). */
  private toEffectiveSettings(settings?: IOrganizationSettings): OrganizationSettingsDetail {
    return {
      timezone: settings?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE,
      locale: settings?.locale ?? DEFAULT_ORGANIZATION_LOCALE,
      dateFormat: settings?.dateFormat ?? DEFAULT_ORGANIZATION_DATE_FORMAT,
      timeFormat: settings?.timeFormat ?? DEFAULT_ORGANIZATION_TIME_FORMAT,
      defaultInterviewLanguage: settings?.defaultInterviewLanguage ?? DEFAULT_LANGUAGE_CODE,
    };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugifyOrganizationName(name) || 'organization';

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const exists = await Organization.exists({ slug: candidate });
      if (!exists) {
        return candidate;
      }
    }

    throw new ApiError(409, 'Unable to generate unique organization slug');
  }

  private toSummary(org: any): Record<string, unknown> {
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      logoUrl: org.logoUrl,
      description: org.description,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }

  private toDetail(org: any): Record<string, unknown> {
    return {
      id: org._id.toString(),
      name: org.name,
      slug: org.slug,
      type: org.type,
      status: org.status,
      description: org.description,
      website: org.website,
      logoUrl: org.logoUrl,
      contactEmail: org.contactEmail,
      contactPhone: org.contactPhone,
      settings: org.settings,
      // Only the profile matching `type` is ever returned — the other is
      // never populated on a valid document, but this keeps intent explicit.
      instituteProfile: org.type === OrganizationType.INSTITUTE ? org.instituteProfile : undefined,
      companyProfile: org.type === OrganizationType.COMPANY ? org.companyProfile : undefined,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }
}

export const organizationService = new OrganizationService();
