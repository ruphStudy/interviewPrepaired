import { Types } from 'mongoose';
import Organization, {
  IOrganizationSettings,
  IInstituteProfile,
  ICompanyProfile,
} from '../models/Organization.model';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
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

interface UpdateOrganizationParams {
  userId: string;
  organizationId: string;
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

  async getOrganizations(params: ListOrganizationsParams): Promise<{
    organizations: Array<Record<string, unknown>>;
    pagination: { page: number; limit: number; total: number; pages: number };
  }> {
    const { userId, page, limit, type, status } = params;
    const filter: Record<string, unknown> = { ownerUserId: new Types.ObjectId(userId) };
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

  async getOrganization(userId: string, organizationId: string): Promise<Record<string, unknown>> {
    const organization = await Organization.findOne({
      _id: organizationId,
      ownerUserId: new Types.ObjectId(userId),
    }).lean();

    if (!organization) {
      throw new ApiError(404, 'Organization not found');
    }
    return this.toDetail(organization);
  }

  async updateOrganization(params: UpdateOrganizationParams): Promise<Record<string, unknown>> {
    const {
      userId,
      organizationId,
      name,
      description,
      website,
      logoUrl,
      contactEmail,
      contactPhone,
      settings,
      instituteProfile,
      companyProfile,
    } = params;

    const organization = await Organization.findOne({
      _id: organizationId,
      ownerUserId: new Types.ObjectId(userId),
    });
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
