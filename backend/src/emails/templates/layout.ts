/**
 * Shared transactional-email layout (PR-COMM-2). Simple, table-based,
 * inline-styled HTML — no external stylesheet/script, safe for normal
 * email clients. Every template renders through this so branding stays
 * consistent without duplicating markup.
 */

const BRAND_COLOR = '#0D9488';
const TEXT_COLOR = '#1F2937';
const MUTED_COLOR = '#6B7280';
const BORDER_COLOR = '#E5E7EB';

export interface EmailLayoutParams {
  brandName: string;
  preheader?: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export function renderEmailLayout(params: EmailLayoutParams): string {
  const { brandName, preheader, heading, bodyHtml, ctaLabel, ctaUrl, footerNote } = params;

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `
        <tr>
          <td style="padding: 24px 0;">
            <a href="${ctaUrl}" style="background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">${ctaLabel}</a>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 16px;">
            <p style="margin:0;color:${MUTED_COLOR};font-size:13px;line-height:1.5;">
              If the button doesn't work, copy and paste this link into your browser:<br />
              <a href="${ctaUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${ctaUrl}</a>
            </p>
          </td>
        </tr>`
      : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAF9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAF9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;border:1px solid ${BORDER_COLOR};overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid ${BORDER_COLOR};">
                <span style="font-size:18px;font-weight:700;color:${BRAND_COLOR};">${brandName}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:16px;">
                      <h1 style="margin:0;font-size:20px;color:${TEXT_COLOR};">${heading}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:${TEXT_COLOR};font-size:15px;line-height:1.6;">
                      ${bodyHtml}
                    </td>
                  </tr>
                  ${ctaBlock}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background-color:#F8FAF9;border-top:1px solid ${BORDER_COLOR};">
                <p style="margin:0;color:${MUTED_COLOR};font-size:12px;line-height:1.5;">
                  ${footerNote || `This is an automated message from ${brandName}. If you weren't expecting this email, you can safely ignore it.`}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderPlainTextFooter(brandName: string, footerNote?: string): string {
  return `\n\n---\n${footerNote || `This is an automated message from ${brandName}. If you weren't expecting this email, you can safely ignore it.`}`;
}
