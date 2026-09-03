export enum OrganizationInvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

/** Raw token lifetime — deliberately short since acceptance is the only consumer. */
export const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
