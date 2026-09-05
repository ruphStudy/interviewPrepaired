import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateSource, EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerCandidateSourceAttribution from '../models/EmployerCandidateSourceAttribution.model';
import {
  MAX_SOURCE_ATTRIBUTION_HISTORY_LIMIT,
  SOURCE_ATTRIBUTION_STRING_MAX_LENGTH,
  SOURCE_ATTRIBUTION_EXTERNAL_REFERENCE_MAX_LENGTH,
  SOURCE_ATTRIBUTION_URL_MAX_LENGTH,
  SOURCE_ATTRIBUTION_NOTES_MAX_LENGTH,
} from '../constants/employerCandidateSourceAttribution';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const SIMPLE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIMPLE_URL_PATTERN = /^https?:\/\/.+/i;

interface CandidateRef {
  _id: Types.ObjectId;
  status: EmployerCandidateStatus;
}

export interface CreateAttributionFields {
  source?: EmployerCandidateSource;
  sourceName?: string;
  externalReferenceId?: string;
  referrerName?: string;
  referrerEmail?: string;
  agencyName?: string;
  jobPortalName?: string;
  campaignName?: string;
  sourceUrl?: string;
  notes?: string;
}

/**
 * Candidate source-attribution / provenance history (18E) — historical
 * evidence only, never a replacement for the candidate's own PRIMARY
 * `source` field (EmployerCandidateService owns that). Append-only: no
 * update/delete method exists here at all. Reads use ORGANIZATION_VIEW
 * (readable even on an archived organization/candidate); the create
 * mutation uses INTERVIEWS_MANAGE and is blocked on an archived
 * organization or candidate.
 */
export class EmployerCandidateSourceAttributionService {
  /** GET .../source-attributions — newest first, capped history. Read-only, so archived org/candidate remain readable. */
  async getAttributions(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string
  ): Promise<{ attributions: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const attributions = await EmployerCandidateSourceAttribution.find({
      organizationId: organization._id,
      candidateId: candidate._id,
    })
      .sort({ createdAt: -1 })
      .limit(MAX_SOURCE_ATTRIBUTION_HISTORY_LIMIT)
      .lean();

    return { attributions: attributions.map((a) => this.toDetail(a)) };
  }

  /** GET .../source-attributions/:attributionId — exact org+candidate scoped; a cross-org/cross-candidate/nonexistent record is always 404. */
  async getAttributionById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    attributionId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const attribution = await EmployerCandidateSourceAttribution.findOne({
      _id: attributionId,
      organizationId: organization._id,
      candidateId: candidate._id,
    }).lean();
    if (!attribution) {
      throw new ApiError(404, 'Source attribution not found');
    }
    return this.toDetail(attribution);
  }

  /**
   * Appends ONE new attribution record. Never touches
   * `EmployerCandidate.source` or any other candidate field — this is
   * historical evidence alongside the candidate, not a replacement for its
   * primary source.
   */
  async createAttribution(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    recordedByMembershipId: string,
    candidateId: string,
    fields: CreateAttributionFields
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!fields.source || !Object.values(EmployerCandidateSource).includes(fields.source)) {
      throw new ApiError(400, 'A valid source is required');
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);

    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);
    this.assertCandidateMutable(candidate);

    const attribution = await EmployerCandidateSourceAttribution.create({
      organizationId: organization._id,
      candidateId: candidate._id,
      source: fields.source,
      sourceName: this.trimCap(fields.sourceName, SOURCE_ATTRIBUTION_STRING_MAX_LENGTH),
      externalReferenceId: this.trimCap(fields.externalReferenceId, SOURCE_ATTRIBUTION_EXTERNAL_REFERENCE_MAX_LENGTH),
      referrerName: this.trimCap(fields.referrerName, SOURCE_ATTRIBUTION_STRING_MAX_LENGTH),
      referrerEmail: this.normalizeOptionalEmail(fields.referrerEmail),
      agencyName: this.trimCap(fields.agencyName, SOURCE_ATTRIBUTION_STRING_MAX_LENGTH),
      jobPortalName: this.trimCap(fields.jobPortalName, SOURCE_ATTRIBUTION_STRING_MAX_LENGTH),
      campaignName: this.trimCap(fields.campaignName, SOURCE_ATTRIBUTION_STRING_MAX_LENGTH),
      sourceUrl: this.normalizeOptionalUrl(fields.sourceUrl),
      notes: this.trimCap(fields.notes, SOURCE_ATTRIBUTION_NOTES_MAX_LENGTH),
      recordedByMembershipId: new Types.ObjectId(recordedByMembershipId),
    });

    return this.toDetail(attribution.toObject());
  }

  private trimCap(value?: string, maxLength = SOURCE_ATTRIBUTION_STRING_MAX_LENGTH): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private normalizeOptionalEmail(email?: string): string | undefined {
    if (email === undefined) return undefined;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return undefined;
    if (!SIMPLE_EMAIL_PATTERN.test(normalized)) {
      throw new ApiError(400, 'referrerEmail must be a valid email');
    }
    return normalized.slice(0, 254);
  }

  private normalizeOptionalUrl(url?: string): string | undefined {
    if (url === undefined) return undefined;
    const trimmed = url.trim();
    if (!trimmed) return undefined;
    if (!SIMPLE_URL_PATTERN.test(trimmed)) {
      throw new ApiError(400, 'sourceUrl must be a valid URL');
    }
    return trimmed.slice(0, SOURCE_ATTRIBUTION_URL_MAX_LENGTH);
  }

  /** Exact {_id, organizationId} match only — never findById(candidateId) alone. */
  private async getCandidateInOrganization(organizationId: Types.ObjectId, candidateId: string): Promise<CandidateRef> {
    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('_id status').lean();
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    return { _id: candidate._id as Types.ObjectId, status: candidate.status };
  }

  /** An archived candidate's source history remains readable, but no new attribution can be recorded. */
  private assertCandidateMutable(candidate: CandidateRef): void {
    if (candidate.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'This candidate is archived — recording a source attribution is disabled');
    }
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

  private assertOrganizationMutable(organization: IOrganization): void {
    if (organization.status === OrganizationStatus.ARCHIVED) {
      throw new ApiError(409, 'Organization is archived');
    }
  }

  /** Type guard — candidate source attribution doesn't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes auth/security internals — just the attribution fields plus who recorded it and when. */
  private toDetail(doc: any): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      candidateId: doc.candidateId.toString(),
      source: doc.source,
      sourceName: doc.sourceName,
      externalReferenceId: doc.externalReferenceId,
      referrerName: doc.referrerName,
      referrerEmail: doc.referrerEmail,
      agencyName: doc.agencyName,
      jobPortalName: doc.jobPortalName,
      campaignName: doc.campaignName,
      sourceUrl: doc.sourceUrl,
      notes: doc.notes,
      recordedByMembershipId: doc.recordedByMembershipId.toString(),
      createdAt: doc.createdAt,
    };
  }
}

export const employerCandidateSourceAttributionService = new EmployerCandidateSourceAttributionService();
