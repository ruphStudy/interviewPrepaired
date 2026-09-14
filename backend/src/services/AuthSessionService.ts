import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { AuthSession, IAuthSession } from '../models/AuthSession.model';
import { IUser } from '../models/user.model';
import { env } from '../config/environment';
import { SESSION_MAX_AGE_MS } from '../constants/authSecurity';

export interface CreatedSession {
  token: string;
  sessionId: string;
}

/**
 * Server-enforced session lifecycle (PR-AUTH-3) — the ONLY place a login
 * JWT is minted. Every session this issues is backed by an AuthSession
 * row so it can be revoked (logout/logout-all/password reset/password
 * change/account deactivation) before its JWT `exp` claim would otherwise
 * let it keep working. Never logs the JWT itself.
 */
class AuthSessionService {
  async createSession(user: Pick<IUser, '_id' | 'role'>, userAgent?: string): Promise<CreatedSession> {
    const sessionId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

    await AuthSession.create({
      userId: user._id,
      sessionId,
      status: 'active',
      expiresAt,
      userAgentSummary: userAgent ? userAgent.slice(0, 200) : undefined,
    });

    const token = jwt.sign({ id: (user._id as Types.ObjectId).toString(), role: user.role, sessionId }, env.jwtSecret as string, {
      expiresIn: env.jwtExpire,
    } as jwt.SignOptions);

    return { token, sessionId };
  }

  /**
   * True only if the session exists, is `active`, and hasn't passed its
   * own `expiresAt` — lazily flips a lapsed-but-still-`active` row to
   * `expired` on the way out, mirroring this codebase's established
   * lazy-expire convention (invitations, etc).
   */
  async isSessionValid(sessionId: string, userId: string): Promise<boolean> {
    const session = await AuthSession.findOne({ sessionId, userId });
    if (!session) return false;
    if (session.status !== 'active') return false;
    if (session.expiresAt.getTime() <= Date.now()) {
      session.status = 'expired';
      await session.save();
      return false;
    }
    return true;
  }

  async revokeSession(sessionId: string, reason: string): Promise<IAuthSession | null> {
    return AuthSession.findOneAndUpdate(
      { sessionId, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } },
      { new: true }
    );
  }

  /** Revokes every ACTIVE session for a user — used by logout-all, password reset, password change, and account deactivation. */
  async revokeAllSessions(userId: string, reason: string, exceptSessionId?: string): Promise<void> {
    const filter: Record<string, unknown> = { userId, status: 'active' };
    if (exceptSessionId) {
      filter.sessionId = { $ne: exceptSessionId };
    }
    await AuthSession.updateMany(filter, { $set: { status: 'revoked', revokedAt: new Date(), revokedReason: reason } });
  }
}

export const authSessionService = new AuthSessionService();
