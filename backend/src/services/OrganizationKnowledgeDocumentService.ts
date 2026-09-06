import fs from 'fs';
import Organization, { IOrganization } from '../models/Organization.model';
import OrganizationKnowledgeBase, { IOrganizationKnowledgeBase } from '../models/OrganizationKnowledgeBase.model';
import OrganizationKnowledgeDocument, { IOrganizationKnowledgeDocument } from '../models/OrganizationKnowledgeDocument.model';
import {
  MAX_KNOWLEDGE_DOCUMENT_FILE_SIZE_BYTES,
  MAX_KNOWLEDGE_DOCUMENT_TEXT_LENGTH,
  MAX_KNOWLEDGE_DOCUMENT_TITLE_LENGTH,
  MAX_KNOWLEDGE_DOCUMENT_DESCRIPTION_LENGTH,
  KNOWLEDGE_DOCUMENT_PREVIEW_LENGTH,
  getKnowledgeDocumentFileExtension,
} from '../constants/organizationKnowledgeDocument';
import { resumeTextExtractionService } from './ResumeTextExtractionService';
import {
  buildStoredKnowledgeDocumentLocation,
  resolveStoredKnowledgeDocumentAbsolutePath,
  writeKnowledgeDocumentFile,
  deleteKnowledgeDocumentFileIfExists,
} from '../utils/organizationKnowledgeDocumentStorage';
import { OrganizationType, OrganizationStatus } from '../constants/organization';
import { OrganizationMemberRole } from '../constants/organizationMember';
import { OrganizationPermission, hasOrganizationPermission } from '../constants/organizationPermissions';
import { ApiError } from '../utils/ApiError';

const PARSING_VERSION = 'knowledge-document-parser-v1';

export interface DocumentUploadInput {
  title?: string;
  description?: string;
  buffer: Buffer;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  fileExtension: string;
}

export interface TextDocumentInput {
  title: string;
  description?: string;
  text: string;
}

/**
 * Organization Knowledge Base document upload/text-creation + local
 * extraction (29B), plus basic list/read (29A). NO embeddings, NO vector
 * indexing, NO AI. `rawText` is confidential internal organization
 * knowledge — never exposed through candidate/public APIs, never
 * returned from the ordinary list endpoint, never logged.
 */
export class OrganizationKnowledgeDocumentService {
  /** GET .../documents — requires QUESTION_SETS_VIEW. Safe metadata only — never rawText, never a preview. */
  async listDocuments(organizationId: string, actingRole: OrganizationMemberRole, knowledgeBaseId: string): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);

    const documents = await OrganizationKnowledgeDocument.find({ organizationId: organization._id, knowledgeBaseId: knowledgeBase._id })
      .sort({ createdAt: -1 })
      .lean();

    return { documents: documents.map((d) => this.toListItem(d as unknown as IOrganizationKnowledgeDocument)) };
  }

  /** GET .../documents/:documentId — requires QUESTION_SETS_VIEW. Includes a BOUNDED `parsedTextPreview` only — never the full rawText. */
  async getDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);
    const doc = await this.findDocumentOrThrow(organization, knowledgeBase, documentId);
    return this.toDetail(doc);
  }

  /** GET .../documents/:documentId/content — requires QUESTION_SETS_VIEW. Employer-only FULL parsed text review (bounded by the same cap applied at parse time). Never exposed publicly. */
  async getDocumentContent(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_VIEW);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);
    const doc = await this.findDocumentOrThrow(organization, knowledgeBase, documentId);
    return { id: doc._id.toString(), rawText: doc.rawText ?? '' };
  }

  /** POST .../documents/upload — requires QUESTION_SETS_MANAGE. multipart file upload; organizationId/knowledgeBaseId are always resolved from the route, never trusted from the body. */
  async uploadDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    membershipId: string,
    input: DocumentUploadInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);
    this.assertKnowledgeBaseActive(knowledgeBase);

    if (!input.fileSize || input.fileSize <= 0) {
      throw new ApiError(400, 'Uploaded file is empty');
    }
    if (input.fileSize > MAX_KNOWLEDGE_DOCUMENT_FILE_SIZE_BYTES) {
      throw new ApiError(400, `File exceeds the maximum size of ${Math.floor(MAX_KNOWLEDGE_DOCUMENT_FILE_SIZE_BYTES / (1024 * 1024))}MB`);
    }

    const sanitizedFileName = this.sanitizeOriginalFileName(input.originalFileName);
    const title = this.validateTitle(input.title || sanitizedFileName.replace(/\.[^.]+$/, '') || sanitizedFileName);
    const description = this.validateDescription(input.description);

    const { relativePath, absolutePath } = buildStoredKnowledgeDocumentLocation(
      organization._id.toString(),
      knowledgeBase._id.toString(),
      input.fileExtension
    );
    await writeKnowledgeDocumentFile(absolutePath, input.buffer);

    let doc: IOrganizationKnowledgeDocument;
    try {
      doc = await OrganizationKnowledgeDocument.create({
        organizationId: organization._id,
        knowledgeBaseId: knowledgeBase._id,
        title,
        description,
        sourceType: 'file',
        originalFileName: sanitizedFileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSize,
        storedFileName: relativePath,
        status: 'processing',
        createdByMembershipId: membershipId,
      });
    } catch (error) {
      // The DB row never got created — this file is orphaned, so (and only so) it's safe to delete.
      await deleteKnowledgeDocumentFileIfExists(absolutePath);
      throw error;
    }

    return this.parseAndFinalize(doc, input.buffer, input.fileExtension);
  }

  /** POST .../documents/text — requires QUESTION_SETS_MANAGE. Direct text creation — no file storage. */
  async createTextDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    membershipId: string,
    input: TextDocumentInput
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);
    this.assertKnowledgeBaseActive(knowledgeBase);

    const title = this.validateTitle(input.title);
    const description = this.validateDescription(input.description);

    const rawText = typeof input.text === 'string' ? input.text : '';
    if (!rawText.trim()) {
      throw new ApiError(400, 'text is required');
    }
    const normalized = this.normalizeText(rawText).slice(0, MAX_KNOWLEDGE_DOCUMENT_TEXT_LENGTH);
    if (!normalized) {
      throw new ApiError(400, 'text is required');
    }

    const doc = await OrganizationKnowledgeDocument.create({
      organizationId: organization._id,
      knowledgeBaseId: knowledgeBase._id,
      title,
      description,
      sourceType: 'text',
      status: 'ready',
      parsingVersion: PARSING_VERSION,
      rawText: normalized,
      characterCount: normalized.length,
      wordCount: this.countWords(normalized),
      createdByMembershipId: membershipId,
    });

    return this.toDetail(doc);
  }

  /** POST .../documents/:documentId/reprocess — requires QUESTION_SETS_MANAGE. Reparses from the PERSISTED original file only — never fakes reprocessing for a `text` document (there is nothing to re-extract) or when the stored file is missing. */
  async reprocessDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);
    this.assertKnowledgeBaseActive(knowledgeBase);

    const doc = await this.findDocumentOrThrow(organization, knowledgeBase, documentId);
    if (doc.status === 'archived') {
      throw new ApiError(400, 'This document is archived and read-only');
    }
    if (doc.sourceType !== 'file' || !doc.storedFileName) {
      throw new ApiError(400, 'Only file-based documents with a retained original file can be reprocessed');
    }

    let buffer: Buffer;
    try {
      const absolutePath = resolveStoredKnowledgeDocumentAbsolutePath(doc.storedFileName);
      buffer = await fs.promises.readFile(absolutePath);
    } catch {
      throw new ApiError(409, 'The original file could not be located for reprocessing');
    }

    const fileExtension = getKnowledgeDocumentFileExtension(doc.originalFileName || '');
    doc.status = 'processing';
    await doc.save();

    return this.parseAndFinalize(doc, buffer, fileExtension);
  }

  /** POST .../documents/:documentId/archive — requires QUESTION_SETS_MANAGE. draft/processing/ready/failed -> archived; idempotent. Never eligible for future 29C indexing once archived. */
  async archiveDocument(
    organizationId: string,
    actingRole: OrganizationMemberRole,
    knowledgeBaseId: string,
    documentId: string
  ): Promise<Record<string, unknown>> {
    this.assertHasPermission(actingRole, OrganizationPermission.QUESTION_SETS_MANAGE);
    const organization = await this.getOrganizationById(organizationId);
    this.assertIsCompany(organization);
    this.assertOrganizationMutable(organization);
    const knowledgeBase = await this.resolveKnowledgeBase(organization, knowledgeBaseId);

    const doc = await this.findDocumentOrThrow(organization, knowledgeBase, documentId);
    if (doc.status !== 'archived') {
      doc.status = 'archived';
      await doc.save();
    }
    return this.toDetail(doc);
  }

  /** Extracts text with the SAME safe primitives resumes already use, then applies deterministic, non-destructive whitespace normalization only — never AI, never a summary. */
  private async parseAndFinalize(doc: IOrganizationKnowledgeDocument, buffer: Buffer, fileExtension: string): Promise<Record<string, unknown>> {
    try {
      const raw = await resumeTextExtractionService.extractText(buffer, fileExtension);
      const normalized = this.normalizeText(raw).slice(0, MAX_KNOWLEDGE_DOCUMENT_TEXT_LENGTH);
      if (!normalized) {
        throw new ApiError(422, 'Could not extract readable text from this document. It may be a scanned or image-only file.');
      }
      doc.rawText = normalized;
      doc.characterCount = normalized.length;
      doc.wordCount = this.countWords(normalized);
      doc.parsingVersion = PARSING_VERSION;
      doc.status = 'ready';
      doc.parseError = undefined;
      await doc.save();
    } catch (error) {
      doc.status = 'failed';
      doc.parseError = this.safeParseErrorMessage(error);
      await doc.save();
    }
    return this.toDetail(doc);
  }

  /** Line-ending normalization + collapsing obvious excessive whitespace only — never summarizes/rewrites/translates, never reorders sections. 29C chunking depends on preserved structure. */
  private normalizeText(raw: string): string {
    let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    text = text.replace(/[ \t]+\n/g, '\n'); // trailing horizontal whitespace before a newline
    text = text.replace(/\n{3,}/g, '\n\n'); // 3+ blank lines -> a single blank line
    text = text.replace(/[ \t]{3,}/g, ' '); // 3+ repeated spaces/tabs -> a single space
    return text.trim();
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }

  private sanitizeOriginalFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() || 'document';
    const cleaned = base.replace(/[^a-zA-Z0-9 ._-]/g, '_').trim();
    return (cleaned || 'document').slice(0, 255);
  }

  private validateTitle(title: unknown): string {
    const trimmed = typeof title === 'string' ? title.trim() : '';
    if (!trimmed) {
      throw new ApiError(400, 'title is required');
    }
    if (trimmed.length > MAX_KNOWLEDGE_DOCUMENT_TITLE_LENGTH) {
      throw new ApiError(400, `title cannot exceed ${MAX_KNOWLEDGE_DOCUMENT_TITLE_LENGTH} characters`);
    }
    return trimmed;
  }

  private validateDescription(description: unknown): string | undefined {
    const trimmed = typeof description === 'string' ? description.trim() : '';
    if (!trimmed) return undefined;
    if (trimmed.length > MAX_KNOWLEDGE_DOCUMENT_DESCRIPTION_LENGTH) {
      throw new ApiError(400, `description cannot exceed ${MAX_KNOWLEDGE_DOCUMENT_DESCRIPTION_LENGTH} characters`);
    }
    return trimmed;
  }

  private safeParseErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message.slice(0, 500);
    return 'Failed to parse this document.';
  }

  private async resolveKnowledgeBase(organization: IOrganization, knowledgeBaseId: string): Promise<IOrganizationKnowledgeBase> {
    const knowledgeBase = await OrganizationKnowledgeBase.findOne({ _id: knowledgeBaseId, organizationId: organization._id });
    if (!knowledgeBase) {
      throw new ApiError(404, 'Knowledge base not found');
    }
    return knowledgeBase;
  }

  private assertKnowledgeBaseActive(knowledgeBase: IOrganizationKnowledgeBase): void {
    if (knowledgeBase.status === 'archived') {
      throw new ApiError(400, 'This knowledge base is archived and read-only');
    }
  }

  private async findDocumentOrThrow(
    organization: IOrganization,
    knowledgeBase: IOrganizationKnowledgeBase,
    documentId: string
  ): Promise<IOrganizationKnowledgeDocument> {
    const doc = await OrganizationKnowledgeDocument.findOne({
      _id: documentId,
      organizationId: organization._id,
      knowledgeBaseId: knowledgeBase._id,
    });
    if (!doc) {
      throw new ApiError(404, 'Document not found');
    }
    return doc;
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

  private toListItem(doc: IOrganizationKnowledgeDocument): Record<string, unknown> {
    return {
      id: doc._id.toString(),
      title: doc.title,
      description: doc.description,
      sourceType: doc.sourceType,
      originalFileName: doc.originalFileName,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      status: doc.status,
      parsingVersion: doc.parsingVersion,
      characterCount: doc.characterCount,
      wordCount: doc.wordCount,
      parseError: doc.status === 'failed' ? doc.parseError : undefined,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private toDetail(doc: IOrganizationKnowledgeDocument): Record<string, unknown> {
    const preview = doc.rawText ? doc.rawText.slice(0, KNOWLEDGE_DOCUMENT_PREVIEW_LENGTH) : undefined;
    return {
      ...this.toListItem(doc),
      parsedTextPreview: preview,
    };
  }
}

export const organizationKnowledgeDocumentService = new OrganizationKnowledgeDocumentService();
export default organizationKnowledgeDocumentService;
