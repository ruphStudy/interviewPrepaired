/**
 * Employer interview invitation (20C) — a secure, hashed-token invitation
 * record for a shortlisted application with a completed 20A blueprint +
 * 20B rubric. This sprint creates the invitation record and recruiter UI
 * only — no email provider integration, no public token-consumption
 * endpoint, no candidate interview session/answer capture (all later
 * sprints).
 */
export enum EmployerInterviewInvitationStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ACCEPTED = 'accepted',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

export const MIN_EXPIRY_DAYS = 1;
export const MAX_EXPIRY_DAYS = 30;
export const DEFAULT_EXPIRY_DAYS = 7;

export const MAX_INVITATION_MESSAGE_LENGTH = 1000;
export const MAX_INVITED_NAME_LENGTH = 200;
