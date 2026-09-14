import EmployerCandidateResumeSource from '../models/EmployerCandidateResumeSource.model';
import OrganizationKnowledgeDocument from '../models/OrganizationKnowledgeDocument.model';
import { fileStorageService } from './FileStorageService';

const SAMPLE_LIMIT = 50;

export interface OrphanCandidate {
  collection: 'EmployerCandidateResumeSource' | 'OrganizationKnowledgeDocument';
  id: string;
  objectKey: string;
}

export interface StorageDiagnosticsResult {
  providerAvailable: boolean;
  sampledResumes: number;
  sampledKnowledgeDocuments: number;
  orphanedMetadata: OrphanCandidate[];
}

/**
 * Read-only admin diagnostic foundation (PR-STORAGE-5) — checks a BOUNDED,
 * recent sample of this application's OWN tracked object-storage rows
 * (never a bucket-wide scan) for "DB metadata → missing object"
 * inconsistency. Never deletes anything automatically; a human decides
 * what to do with a reported orphan.
 */
class StorageDiagnosticsService {
  async runOrphanScan(): Promise<StorageDiagnosticsResult> {
    const providerAvailable = fileStorageService.isProviderAvailable();
    const orphanedMetadata: OrphanCandidate[] = [];

    const resumes = await EmployerCandidateResumeSource.find({ storageProvider: { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .select('_id storedFileName')
      .lean();

    const knowledgeDocuments = await OrganizationKnowledgeDocument.find({ storageProvider: { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .select('_id storedFileName')
      .lean();

    if (providerAvailable) {
      for (const resume of resumes) {
        if (!resume.storedFileName) continue;
        const head = await fileStorageService.headFile(resume.storedFileName);
        if (!head.exists) {
          orphanedMetadata.push({ collection: 'EmployerCandidateResumeSource', id: resume._id.toString(), objectKey: resume.storedFileName });
        }
      }
      for (const doc of knowledgeDocuments) {
        if (!doc.storedFileName) continue;
        const head = await fileStorageService.headFile(doc.storedFileName);
        if (!head.exists) {
          orphanedMetadata.push({ collection: 'OrganizationKnowledgeDocument', id: doc._id.toString(), objectKey: doc.storedFileName });
        }
      }
    }

    return {
      providerAvailable,
      sampledResumes: resumes.length,
      sampledKnowledgeDocuments: knowledgeDocuments.length,
      orphanedMetadata,
    };
  }
}

export const storageDiagnosticsService = new StorageDiagnosticsService();
