import { Types } from 'mongoose';
import Organization, { IOrganization } from '../models/Organization.model';
import EmployerCandidate from '../models/EmployerCandidate.model';
import { EmployerCandidateStatus } from '../constants/employerCandidate';
import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import { EmployerCandidateResumeSourceType, MAX_RESUME_FILE_SIZE_BYTES, MAX_RESUME_HISTORY_LIMIT } from '../constants/employerCandidateResume';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';
import {
  buildStoredResumeLocation,
  resolveStoredResumeAbsolutePath,
  writeResumeFile,
  deleteResumeFileIfExists,
} from '../utils/candidateResumeStorage';

const MAX_VERSION_CREATE_ATTEMPTS = 3;

interface CandidateRef {
  _id: Types.ObjectId;
  status: EmployerCandidateStatus;
}

interface ResumeUploadInput {
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
  buffer: Buffer;
}

/**
 * Candidate resume file storage and versioning (18B) — NO AI parsing/text
 * extraction happens here (18C). Every operation verifies the organization
 * exists, is a COMPANY, and that the candidate belongs to that EXACT
 * organization before touching any resume row. Reads use ORGANIZATION_VIEW;
 * the upload mutation uses INTERVIEWS_MANAGE. Mirrors
 * EmployerJobDescriptionService's versioning pattern exactly (17A).
 */
export class EmployerCandidateResumeService {
  /**
   * GET .../resumes — read-only, so an archived organization/candidate
   * remains readable. `current` is the highest-version row for this
   * candidate (version is unique and monotonically increasing) — derived
   * this way rather than trusted from the `isCurrent` flag alone.
   */
  async getResumes(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string
  ): Promise<{ current: Record<string, unknown> | null; history: Array<Record<string, unknown>> }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const sources = await EmployerCandidateResumeSource.find({ organizationId: organization._id, candidateId: candidate._id })
      .sort({ version: -1 })
      .limit(MAX_RESUME_HISTORY_LIMIT)
      .lean();

    return {
      current: sources.length > 0 ? this.toDetail(sources[0]) : null,
      history: sources.map((s) => this.toDetail(s)),
    };
  }

  /** GET .../resumes/:resumeSourceId — exact org+candidate scoped metadata read; a cross-org/cross-candidate/nonexistent version is always 404. */
  async getResumeById(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    resumeSourceId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const source = await this.getResumeSourceInScope(organization._id, candidate._id, resumeSourceId);
    return this.toDetail(source);
  }

  /** GET .../resumes/:resumeSourceId/file — same tenant scoping; returns only what the controller needs to stream the file, never a raw client-controlled path. */
  async getResumeFileForDownload(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    resumeSourceId: string
  ): Promise<{ absolutePath: string; originalFileName: string; mimeType: string }> {
    this.assertHasPermission(actingRole, OrganizationPermission.ORGANIZATION_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);

    const source = await this.getResumeSourceInScope(organization._id, candidate._id, resumeSourceId);
    return {
      absolutePath: resolveStoredResumeAbsolutePath(source.storedFileName),
      originalFileName: source.originalFileName,
      mimeType: source.mimeType,
    };
  }

  /**
   * Creates the NEXT resume version for this candidate and makes it current
   * — never overwrites an existing version or deletes a previous file.
   * `version` is computed as (highest existing version for this candidate)
   * + 1; the unique {organizationId, candidateId, version} index is the
   * actual concurrency guard, with the same retry-on-E11000 pattern as
   * EmployerJobDescriptionService (17A). The file is written to disk first;
   * if the DB row then fails to create (including after exhausting
   * retries), that orphaned file is deleted — a previous version's file is
   * never touched.
   */
  async uploadResume(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    candidateId: string,
    uploadedByMembershipId: string,
    input: ResumeUploadInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.INTERVIEWS_MANAGE);

    if (!input.fileSize || input.fileSize <= 0) {
      throw new ApiError(400, 'Uploaded file is empty');
    }
    if (input.fileSize > MAX_RESUME_FILE_SIZE_BYTES) {
      throw new ApiError(400, `Resume file exceeds the maximum size of ${Math.floor(MAX_RESUME_FILE_SIZE_BYTES / (1024 * 1024))}MB`);
    }

    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const candidate = await this.getCandidateInOrganization(organization._id, candidateId);
    this.assertCandidateMutable(candidate);

    const { relativePath, absolutePath } = buildStoredResumeLocation(
      organization._id.toString(),
      candidate._id.toString(),
      input.fileExtension
    );
    await writeResumeFile(absolutePath, input.buffer);

    let created: InstanceType<typeof EmployerCandidateResumeSource> | undefined;
    try {
      for (let attempt = 0; attempt < MAX_VERSION_CREATE_ATTEMPTS; attempt++) {
        const nextVersion = await this.computeNextVersion(organization._id, candidate._id);
        try {
          created = await EmployerCandidateResumeSource.create({
            organizationId: organization._id,
            candidateId: candidate._id,
            version: nextVersion,
            isCurrent: true,
            originalFileName: this.sanitizeOriginalFileName(input.originalFileName),
            storedFileName: relativePath,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
            fileExtension: input.fileExtension,
            sourceType: EmployerCandidateResumeSourceType.UPLOAD,
            uploadedByMembershipId: new Types.ObjectId(uploadedByMembershipId),
          });
          break;
        } catch (error: any) {
          const isLastAttempt = attempt === MAX_VERSION_CREATE_ATTEMPTS - 1;
          if (error?.code === 11000 && !isLastAttempt) {
            continue; // Another concurrent upload took this version number — recompute and retry.
          }
          throw error;
        }
      }
    } catch (error) {
      // The DB row never got created — this file is orphaned, so (and only so) it's safe to delete.
      await deleteResumeFileIfExists(absolutePath);
      throw error;
    }

    if (!created) {
      await deleteResumeFileIfExists(absolutePath);
      throw new ApiError(500, 'Failed to create resume version — please try again');
    }

    // Best-effort demotion of any previously-current row(s). The new row is
    // already the authoritative "current" by version number regardless of
    // this step's outcome — GET derives `current` from the max version,
    // never from `isCurrent` alone.
    await EmployerCandidateResumeSource.updateMany(
      { organizationId: organization._id, candidateId: candidate._id, isCurrent: true, _id: { $ne: created._id } },
      { $set: { isCurrent: false } }
    );

    return this.toDetail(created.toObject());
  }

  private async computeNextVersion(organizationId: Types.ObjectId, candidateId: Types.ObjectId): Promise<number> {
    const latest = await EmployerCandidateResumeSource.findOne({ organizationId, candidateId })
      .sort({ version: -1 })
      .select('version')
      .lean();
    return (latest?.version ?? 0) + 1;
  }

  /** Strips any client-supplied path segments and unsafe characters — never trusted for storage, only for display. */
  private sanitizeOriginalFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() || 'resume';
    const cleaned = base.replace(/[^a-zA-Z0-9 ._-]/g, '_').trim();
    return (cleaned || 'resume').slice(0, 255);
  }

  /** Exact {_id, organizationId, candidateId} match only — a cross-org/cross-candidate id is treated identically to a nonexistent one (404). */
  private async getResumeSourceInScope(organizationId: Types.ObjectId, candidateId: Types.ObjectId, resumeSourceId: string) {
    const source = await EmployerCandidateResumeSource.findOne({
      _id: resumeSourceId,
      organizationId,
      candidateId,
    }).lean();
    if (!source) {
      throw new ApiError(404, 'Resume not found');
    }
    return source;
  }

  /** Exact {_id, organizationId} match only — never findById(candidateId) alone. */
  private async getCandidateInOrganization(organizationId: Types.ObjectId, candidateId: string): Promise<CandidateRef> {
    const candidate = await EmployerCandidate.findOne({ _id: candidateId, organizationId }).select('_id status').lean();
    if (!candidate) {
      throw new ApiError(404, 'Candidate not found');
    }
    return { _id: candidate._id as Types.ObjectId, status: candidate.status };
  }

  /** An archived candidate's resume history remains readable, but no new version can be uploaded — restore it to active first. */
  private assertCandidateMutable(candidate: CandidateRef): void {
    if (candidate.status === EmployerCandidateStatus.ARCHIVED) {
      throw new ApiError(409, 'This candidate is archived — uploading a resume is disabled');
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

  /** Type guard — candidate resumes don't apply to an institute org. */
  private assertIsCompany(organization: IOrganization): void {
    if (organization.type !== OrganizationType.COMPANY) {
      throw new ApiError(400, 'This organization is not a company');
    }
  }

  /** Never exposes storedFileName/absolute paths/server storage internals — just resume metadata. */
  private toDetail(source: any): Record<string, unknown> {
    return {
      id: source._id.toString(),
      candidateId: source.candidateId.toString(),
      version: source.version,
      isCurrent: source.isCurrent,
      originalFileName: source.originalFileName,
      mimeType: source.mimeType,
      fileSize: source.fileSize,
      fileExtension: source.fileExtension,
      sourceType: source.sourceType,
      uploadedByMembershipId: source.uploadedByMembershipId.toString(),
      createdAt: source.createdAt,
    };
  }
}

export const employerCandidateResumeService = new EmployerCandidateResumeService();
