import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { EMAIL_FROM_NAME } from './brand';

export interface AccountSetupTemplateParams {
  setupUrl: string;
  expiryMinutes: number;
  organizationName?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * First-time account activation — distinct copy from `renderPasswordResetEmail`
 * ("reset your password" reads wrong for an account that never had one yet),
 * but reuses the exact same layout/link/expiry mechanics and the underlying
 * token is the SAME `User.resetPasswordToken` field (see
 * `AccountActivationService.issuePasswordSetupToken`) — no separate
 * token/auth system.
 */
export function renderAccountSetupEmail(params: AccountSetupTemplateParams): RenderedEmail {
  const orgClause = params.organizationName ? ` at ${params.organizationName}` : '';
  const subject = `Set up your ${EMAIL_FROM_NAME} account`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">An account has been created for you${orgClause}. Set a password to activate it and sign in.</p>
    <p style="margin:0;">This link will expire in <strong>${params.expiryMinutes} minutes</strong>. If you weren't expecting this, you can safely ignore this email.</p>
  `;

  const html = renderEmailLayout({
    brandName: EMAIL_FROM_NAME,
    preheader: 'Set up your account',
    heading: 'Set up your account',
    bodyHtml,
    ctaLabel: 'Set Password',
    ctaUrl: params.setupUrl,
  });

  const text =
    `Set up your ${EMAIL_FROM_NAME} account\n\n` +
    `An account has been created for you${orgClause}. Set a password to activate it. This link expires in ${params.expiryMinutes} minutes.\n\n` +
    `${params.setupUrl}\n\n` +
    `If you weren't expecting this, you can safely ignore this email.` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
