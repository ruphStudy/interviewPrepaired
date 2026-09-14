import { UserConsent, IUserConsent, UserConsentType } from '../models/UserConsent.model';

export interface SafeConsentEntry {
  consentType: UserConsentType;
  version: string;
  accepted: boolean;
  acceptedAt?: Date;
  withdrawnAt?: Date;
  source: string;
}

/**
 * Thin wrapper around UserConsent (PR-PRIVACY-4). Consent history is
 * append-only ACROSS versions (a new version always gets a new row); a
 * repeat call for the SAME {userId, consentType, version} idempotently
 * upserts that one row rather than erroring or duplicating it — this
 * matters for a retried registration request.
 */
class UserConsentService {
  async recordConsent(
    userId: string,
    consentType: UserConsentType,
    version: string,
    accepted: boolean,
    source: string
  ): Promise<IUserConsent> {
    return UserConsent.findOneAndUpdate(
      { userId, consentType, version },
      {
        $set: {
          accepted,
          acceptedAt: accepted ? new Date() : undefined,
          source,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async getUserConsents(userId: string): Promise<SafeConsentEntry[]> {
    const rows = await UserConsent.find({ userId }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => ({
      consentType: row.consentType,
      version: row.version,
      accepted: row.accepted,
      acceptedAt: row.acceptedAt,
      withdrawnAt: row.withdrawnAt,
      source: row.source,
    }));
  }
}

export const userConsentService = new UserConsentService();
