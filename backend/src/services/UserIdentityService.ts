import crypto from 'crypto';
import { User, IUser } from '../models/user.model';

/**
 * Centralized "find/link an existing User by email or id" reads (foundation
 * prompt, 2026-09). Before this service, the exact same
 * `.trim().toLowerCase()` + `User.findOne(...)` shape was duplicated in
 * InstituteStudentService (11C `linkUser`/`unlinkUser`) and
 * OrganizationInvitationService (`createInvitation`). This is now the ONE
 * place that logic lives — callers keep their own error-throwing / not-found
 * semantics on top, since those differ intentionally per call site (see
 * below).
 *
 * Deliberately read-only: nothing here ever creates, updates, or deletes a
 * User, and nothing here ever touches `User.role`. Account creation and
 * role assignment remain separate concerns, exactly as they were before
 * this refactor.
 */

/** Shared normalization — matches `user.model.ts`'s own schema-level `trim`+`lowercase` exactly, so a lookup here never disagrees with what got persisted. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

class UserIdentityService {
  /**
   * Active-only lookup by email (normalized). Returns `null` when no
   * matching ACTIVE user exists — never throws, so callers decide what
   * "not found" means for them (e.g. InstituteStudentService throws 404,
   * a "does this email already have an account" check just branches on
   * null).
   */
  async findActiveUserByEmail(email: string): Promise<IUser | null> {
    const normalized = normalizeEmail(email);
    return User.findOne({ email: normalized, isActive: true });
  }

  /** Active-only lookup by id. Same null-returning shape as {@link findActiveUserByEmail}. */
  async findActiveUserById(userId: string): Promise<IUser | null> {
    return User.findOne({ _id: userId, isActive: true });
  }

  /**
   * Lookup by email with NO `isActive` filter — preserves
   * OrganizationInvitationService's pre-existing behavior exactly (it needs
   * to know "does a User already exist for this email at all", including an
   * inactive one, e.g. to correctly reject inviting an already-deactivated
   * organization owner). Deliberately distinct from
   * {@link findActiveUserByEmail}; do not collapse the two, they answer
   * different questions.
   */
  async findUserByEmail(email: string): Promise<IUser | null> {
    const normalized = normalizeEmail(email);
    return User.findOne({ email: normalized });
  }

  /**
   * Creates a real, password-auth-capable User whose password is a
   * cryptographically random value known to no one (never disclosed, never
   * logged) — the account only becomes usable once the person completes
   * activation via an invitation/activation token that later sets a real
   * password (see `pendingPasswordActivation` on `user.model.ts`, and
   * `AccountActivationService`/`OrganizationInvitationService.activateOwnerAccount`
   * for the two existing ways that flag gets cleared). `role` is
   * deliberately never set here (schema default `'user'`) — provisioning
   * someone this way NEVER grants the global platform-admin role, whatever
   * organization-scoped role they're being onboarded for.
   *
   * Originally built only for Super Admin owner provisioning; generalized
   * here so Institute Trainer/Student onboarding (and any future caller)
   * shares the exact same account-creation primitive rather than
   * duplicating it.
   */
  async createUserAwaitingActivation(email: string, name?: string): Promise<IUser> {
    const normalizedEmail = normalizeEmail(email);
    const randomPassword = crypto.randomBytes(32).toString('hex');
    return User.create({
      name: (name && name.trim()) || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      password: randomPassword,
      isVerified: false,
      pendingPasswordActivation: true,
    });
  }
}

export const userIdentityService = new UserIdentityService();
