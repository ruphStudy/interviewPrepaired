import crypto from 'crypto';
import { TransactionalEmailProvider, SendEmailParams, SendEmailResult } from './EmailProvider';

/**
 * Development-only provider (PR-COMM-1) — logs that an email WOULD have
 * been sent and returns a normalized "accepted" result so the rest of the
 * pipeline (EmailDelivery status, idempotency, retry) can be exercised
 * locally without a real provider account. NEVER selectable in
 * production — `getEmailProvider()` refuses to construct this when
 * `NODE_ENV==='production'`, regardless of EMAIL_PROVIDER's value, so it
 * is impossible to accidentally "deliver" a production email this way.
 * Deliberately logs only the subject/recipient — never the HTML body,
 * so a raw security-link token embedded in the body is never printed.
 */
export class DevConsoleEmailProvider implements TransactionalEmailProvider {
  readonly name = 'dev-console';

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    console.log(
      `[DevConsoleEmailProvider] NOT actually delivered — to=${params.to} subject="${params.subject}" (dev-mode only, no real provider configured)`
    );
    return {
      provider: this.name,
      providerMessageId: `dev-${crypto.randomBytes(8).toString('hex')}`,
      accepted: true,
      status: 'accepted',
    };
  }
}
