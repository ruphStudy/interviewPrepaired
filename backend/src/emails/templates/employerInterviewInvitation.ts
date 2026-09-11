import { renderEmailLayout, renderPlainTextFooter } from './layout';
import { escapeHtml } from './escapeHtml';
import { EMAIL_FROM_NAME } from './brand';
import { RenderedEmail } from './passwordReset';

export interface EmployerInterviewInvitationTemplateParams {
  candidateFirstName?: string;
  organizationName: string;
  jobTitle?: string;
  invitationMessage?: string;
  interviewUrl: string;
  expiresAt: Date;
}

/**
 * Candidate-facing only. Never includes competency rubrics, model answers,
 * hiring scores, internal notes, or any employer-internal evaluation
 * content — only what a candidate needs to know they've been invited and
 * how to start.
 */
export function renderEmployerInterviewInvitationEmail(params: EmployerInterviewInvitationTemplateParams): RenderedEmail {
  const greeting = params.candidateFirstName ? `Hi ${escapeHtml(params.candidateFirstName)},` : 'Hi,';
  const orgName = escapeHtml(params.organizationName);
  const roleLine = params.jobTitle ? ` for the <strong>${escapeHtml(params.jobTitle)}</strong> role` : '';
  const expiryDate = params.expiresAt.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const subject = `Your interview invitation from ${params.organizationName}`;

  const messageBlock = params.invitationMessage
    ? `<p style="margin:16px 0 0;padding:12px 16px;background-color:#F8FAF9;border-radius:8px;color:#374151;font-size:14px;">${escapeHtml(params.invitationMessage)}</p>`
    : '';

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;"><strong>${orgName}</strong> has invited you to complete an interview${roleLine} on ${EMAIL_FROM_NAME}.</p>
    <p style="margin:0;">Please complete it before <strong>${expiryDate}</strong>.</p>
    ${messageBlock}
  `;

  const html = renderEmailLayout({
    brandName: EMAIL_FROM_NAME,
    preheader: `${params.organizationName} has invited you to an interview`,
    heading: 'You have an interview invitation',
    bodyHtml,
    ctaLabel: 'Start Interview',
    ctaUrl: params.interviewUrl,
  });

  const text =
    `${params.candidateFirstName ? `Hi ${params.candidateFirstName},` : 'Hi,'}\n\n` +
    `${params.organizationName} has invited you to complete an interview${params.jobTitle ? ` for the ${params.jobTitle} role` : ''} on ${EMAIL_FROM_NAME}.\n` +
    `Please complete it before ${expiryDate}.\n` +
    `${params.invitationMessage ? `\n"${params.invitationMessage}"\n` : ''}\n` +
    `${params.interviewUrl}` +
    renderPlainTextFooter(EMAIL_FROM_NAME);

  return { subject, html, text };
}
