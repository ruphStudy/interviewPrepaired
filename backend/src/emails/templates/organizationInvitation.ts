import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { escapeHtml } from './escapeHtml';
import { EMAIL_FROM_NAME } from './brand';
import { RenderedEmail } from './passwordReset';

export interface OrganizationInvitationTemplateParams {
  organizationName: string;
  role: string;
  inviterName?: string;
  acceptUrl: string;
  expiresAt: Date;
}

function formatRoleLabel(role: string): string {
  return role
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Never includes other member emails, organization internal IDs, or anything beyond the org's display name/role. */
export function renderOrganizationInvitationEmail(params: OrganizationInvitationTemplateParams): RenderedEmail {
  const orgName = escapeHtml(params.organizationName);
  const roleLabel = escapeHtml(formatRoleLabel(params.role));
  const inviterLine = params.inviterName ? `<strong>${escapeHtml(params.inviterName)}</strong> has invited you` : "You've been invited";
  const expiryDate = params.expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const subject = `You're invited to join ${params.organizationName} on ${EMAIL_FROM_NAME}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${inviterLine} to join <strong>${orgName}</strong> on ${EMAIL_FROM_NAME} as <strong>${roleLabel}</strong>.</p>
    <p style="margin:0;">This invitation expires on <strong>${expiryDate}</strong>.</p>
  `;

  const html = renderEmailLayout({
    brandName: EMAIL_FROM_NAME,
    preheader: `Join ${params.organizationName} on ${EMAIL_FROM_NAME}`,
    heading: 'You have an organization invitation',
    bodyHtml,
    ctaLabel: 'Accept Invitation',
    ctaUrl: params.acceptUrl,
  });

  const text =
    `You're invited to join ${params.organizationName} on ${EMAIL_FROM_NAME}\n\n` +
    `${params.inviterName ? `${params.inviterName} has invited you` : "You've been invited"} to join ${params.organizationName} as ${formatRoleLabel(params.role)}.\n` +
    `This invitation expires on ${expiryDate}.\n\n` +
    `${params.acceptUrl}` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
