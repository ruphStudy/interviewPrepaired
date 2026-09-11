import { TransactionalEmailProvider, SendEmailParams, SendEmailResult } from './EmailProvider';

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Real Resend integration (PR-COMM-1) via the plain HTTP API using Node's
 * built-in `fetch` — deliberately no SDK dependency for a single POST
 * endpoint. Configuration comes ONLY from environment variables; the API
 * key is a private field never exposed on the object.
 */
export class ResendEmailProvider implements TransactionalEmailProvider {
  readonly name = 'resend';
  private readonly apiKey: string;
  private readonly from: string;
  private readonly replyTo?: string;

  constructor(config: { apiKey: string; from: string; replyTo?: string }) {
    this.apiKey = config.apiKey;
    this.from = config.from;
    this.replyTo = config.replyTo;
  }

  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          reply_to: params.replyTo || this.replyTo,
          tags: params.tags
            ? Object.entries(params.tags).map(([name, value]) => ({ name, value: String(value) }))
            : undefined,
        }),
      });
    } catch (error: any) {
      // Network-level failure (timeout, DNS, connection reset) — always transient.
      return {
        provider: this.name,
        accepted: false,
        status: 'rejected',
        failureCode: 'NETWORK_ERROR',
        failureMessage: String(error?.message || error).slice(0, 300),
        transient: true,
      };
    }

    if (response.ok) {
      let body: any = {};
      try {
        body = await response.json();
      } catch {
        // Empty/non-JSON success body — accepted regardless.
      }
      return {
        provider: this.name,
        providerMessageId: body?.id,
        accepted: true,
        status: 'accepted',
      };
    }

    let errorBody: any = {};
    try {
      errorBody = await response.json();
    } catch {
      // Non-JSON error body — fall back to statusText below.
    }
    const failureMessage = String(errorBody?.message || response.statusText || 'Email provider rejected the request').slice(0, 300);
    // 429 (rate limit) and any 5xx are transient; every other 4xx (bad
    // request, invalid recipient, auth failure) is a permanent rejection —
    // retrying it would never succeed.
    const transient = response.status === 429 || response.status >= 500;

    return {
      provider: this.name,
      accepted: false,
      status: 'rejected',
      failureCode: String(errorBody?.name || response.status),
      failureMessage,
      transient,
    };
  }
}
