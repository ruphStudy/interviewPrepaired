import { Types } from 'mongoose';
import { ApiError } from './ApiError';

export interface TenantScopeInput {
  userId: string;
  /** Omit entirely for personal/B2C scope — do not pass `undefined` explicitly to mean "personal" vs. "not specified"; both are treated identically (personal). */
  organizationId?: string;
}

function toObjectId(value: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApiError(400, `Invalid ${label}`);
  }
  return new Types.ObjectId(value);
}

/**
 * Builds an exact tenant-scoped owner filter for Interview/QuestionSet-style
 * records. Never falls back across scopes:
 *
 * - organizationId supplied  -> strictly that organization's records for this user.
 * - organizationId omitted   -> strictly PERSONAL records (organizationId
 *   absent OR null) — deliberately NOT a bare `{ userId }` filter, which
 *   would also match a future organization-scoped record owned by the same
 *   user and defeat the whole point of this helper.
 */
export function buildTenantOwnerFilter({ userId, organizationId }: TenantScopeInput): Record<string, unknown> {
  const userObjectId = toObjectId(userId, 'userId');

  if (organizationId !== undefined) {
    const organizationObjectId = toObjectId(organizationId, 'organizationId');
    return { userId: userObjectId, organizationId: organizationObjectId };
  }

  return {
    userId: userObjectId,
    $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
  };
}
