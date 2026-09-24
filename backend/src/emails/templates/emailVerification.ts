import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { escapeHtml } from './escapeHtml';
import { EMAIL_FROM_NAME } from './brand';
import { RenderedEmail } from './passwordReset';

export interface EmailVerificationTemplateParams {
  name?: string;
  verifyUrl: string;
  expiryHours: number;
  /** Raw 6-digit code — only ever passed in-memory to build this email, never persisted or logged. */
  code: string;
  codeExpiryMinutes: number;
}

/** Sole sensitive value: the raw 6-digit code, present only transiently to render this one email. */
export function renderEmailVerificationEmail(params: EmailVerificationTemplateParams): RenderedEmail {
  const subject = `Verify your email for ${EMAIL_FROM_NAME}`;
  const greeting = params.name ? `Hi ${escapeHtml(params.name)},` : 'Hi,';
  const safeCode = escapeHtml(params.code);

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">Please verify your email address to unlock all ${EMAIL_FROM_NAME} features.</p>
    <p style="margin:0 0 12px;">This link will expire in <strong>${params.expiryHours} hours</strong>.</p>
    <p style="margin:0 0 8px;">Or enter this verification code:</p>
    <p style="margin:0 0 12px;font-size:28px;font-weight:700;letter-spacing:6px;">${safeCode}</p>
    <p style="margin:0 0 12px;">This code will expire in <strong>${params.codeExpiryMinutes} minutes</strong>.</p>
    <p style="margin:0;color:#6b7280;font-size:13px;">If you did not create this account, you can ignore this email.</p>
  `;

  const html = renderEmailLayout({
    brandName: EMAIL_FROM_NAME,
    preheader: 'Verify your email address',
    heading: 'Verify your email',
    bodyHtml,
    ctaLabel: 'Verify Email',
    ctaUrl: params.verifyUrl,
  });

  const text =
    `Verify your email for ${EMAIL_FROM_NAME}\n\n` +
    `${params.name ? `Hi ${params.name},` : 'Hi,'}\n\n` +
    `Please verify your email address to unlock all ${EMAIL_FROM_NAME} features. This link expires in ${params.expiryHours} hours.\n\n` +
    `${params.verifyUrl}\n\n` +
    `Or enter this verification code: ${params.code}\n` +
    `This code expires in ${params.codeExpiryMinutes} minutes.\n\n` +
    `If you did not create this account, you can ignore this email.` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
