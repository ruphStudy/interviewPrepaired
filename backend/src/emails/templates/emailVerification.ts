import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { escapeHtml } from './escapeHtml';
import { EMAIL_FROM_NAME } from './brand';
import { RenderedEmail } from './passwordReset';

export interface EmailVerificationTemplateParams {
  name?: string;
  verifyUrl: string;
  expiryHours: number;
}

/** No sensitive data — just a greeting and the verification link. */
export function renderEmailVerificationEmail(params: EmailVerificationTemplateParams): RenderedEmail {
  const subject = `Verify your email for ${EMAIL_FROM_NAME}`;
  const greeting = params.name ? `Hi ${escapeHtml(params.name)},` : 'Hi,';

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">Please verify your email address to unlock all ${EMAIL_FROM_NAME} features.</p>
    <p style="margin:0;">This link will expire in <strong>${params.expiryHours} hours</strong>.</p>
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
    `${params.verifyUrl}` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
