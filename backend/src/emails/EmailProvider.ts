/**
 * Provider-neutral transactional email contract (PR-COMM-1). Business
 * logic (TransactionalEmailService, and everything above it) only ever
 * imports this interface plus the `getEmailProvider()` factory — never a
 * concrete provider class directly.
 */

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Record<string, string>;
  /** Provider-level idempotency hint where the provider supports one — advisory only, our own EmailDelivery.idempotencyKey is the authoritative guard. */
  idempotencyKey?: string;
}

export type SendEmailStatus = 'accepted' | 'rejected';

export interface SendEmailResult {
  provider: string;
  providerMessageId?: string;
  accepted: boolean;
  status: SendEmailStatus;
  /** Set only when `accepted` is false — used to classify retry vs. permanent failure. */
  failureCode?: string;
  failureMessage?: string;
  /** True for a transient provider issue (timeout/429/5xx) — false for a permanent rejection (invalid address, etc). Meaningless when `accepted` is true. */
  transient?: boolean;
}

export interface TransactionalEmailProvider {
  readonly name: string;
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
}
