import { env } from '../config/environment';
import { TransactionalEmailProvider } from './EmailProvider';
import { ResendEmailProvider } from './ResendEmailProvider';
import { DevConsoleEmailProvider } from './DevConsoleEmailProvider';

export * from './EmailProvider';

let cachedProvider: TransactionalEmailProvider | null | undefined;

/**
 * Single factory for the active transactional email provider (PR-COMM-1).
 * Returns `null` — never throws, never a fake-success path — when no real
 * provider is configured, so callers uniformly surface
 * EMAIL_PROVIDER_UNAVAILABLE. The dev-console provider is the ONE
 * exception, and it is impossible to select in production: it requires
 * BOTH `EMAIL_DEV_MODE=true` AND `NODE_ENV!=='production'` — a
 * misconfigured production deployment that sets EMAIL_DEV_MODE=true still
 * falls through to `null` instead of silently "delivering" nothing.
 */
export function getEmailProvider(): TransactionalEmailProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  if (env.emailProvider === 'resend' && env.resendApiKey && env.emailFrom) {
    const from = env.emailFromName ? `${env.emailFromName} <${env.emailFrom}>` : env.emailFrom;
    cachedProvider = new ResendEmailProvider({ apiKey: env.resendApiKey, from, replyTo: env.emailReplyTo || undefined });
    return cachedProvider;
  }

  if (env.emailDevMode && env.nodeEnv !== 'production') {
    cachedProvider = new DevConsoleEmailProvider();
    return cachedProvider;
  }

  cachedProvider = null;
  return cachedProvider;
}
