import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { EMAIL_FROM_NAME } from './brand';

export interface PasswordResetTemplateParams {
  resetUrl: string;
  expiryMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Never includes the user's name/email in the body beyond what the recipient already knows by having asked for a reset — no account-identifying details beyond the link itself. */
export function renderPasswordResetEmail(params: PasswordResetTemplateParams): RenderedEmail {
  const subject = `Reset your ${EMAIL_FROM_NAME} password`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">We received a request to reset your password.</p>
    <p style="margin:0;">This link will expire in <strong>${params.expiryMinutes} minutes</strong>. If you didn't request a password reset, you can safely ignore this email — your password will not be changed.</p>
  `;

  const html = renderEmailLayout({
    brandName: EMAIL_FROM_NAME,
    preheader: 'Reset your password',
    heading: 'Reset your password',
    bodyHtml,
    ctaLabel: 'Reset Password',
    ctaUrl: params.resetUrl,
  });

  const text =
    `Reset your ${EMAIL_FROM_NAME} password\n\n` +
    `We received a request to reset your password. This link expires in ${params.expiryMinutes} minutes.\n\n` +
    `${params.resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email.` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
