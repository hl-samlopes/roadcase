/**
 * The organization-branded email wrapper: logo or name, a heading, short
 * paragraphs and an optional button, as HTML with inline styles (what email
 * clients support) plus a plain-text version. All text is escaped.
 */

export interface EmailBrand {
  name: string;
  logoUrl: string | null;
  colors: {
    bg: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
  };
  headingFont: string;
  bodyFont: string;
  radiusPx: number;
}

export interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links reach an email; anything else is dropped. */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function fontStack(font: string) {
  return `'${font.replace(/'/g, "")}', Arial, Helvetica, sans-serif`;
}

export function renderBrandedEmail(brand: EmailBrand, content: EmailContent) {
  const { colors } = brand;
  const name = escapeHtml(brand.name);
  const logoUrl = brand.logoUrl ? safeUrl(brand.logoUrl) : null;
  const actionUrl = content.action ? safeUrl(content.action.url) : null;
  const body = fontStack(brand.bodyFont);
  const heading = fontStack(brand.headingFont);

  const header = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${name}" height="32" style="display:block;height:32px;width:auto;border:0">`
    : `<span style="font-family:${heading};font-size:18px;font-weight:700;color:${colors.text}">${name}</span>`;
  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;font-family:${body};font-size:15px;line-height:1.5;color:${colors.text}">${escapeHtml(p)}</p>`,
    )
    .join("");
  const button =
    content.action && actionUrl
      ? `<p style="margin:20px 0 4px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:10px 16px;border-radius:${brand.radiusPx}px;background:${colors.accent};color:${colors.surface};font-family:${body};font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(content.action.label)}</a></p>`
      : "";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${colors.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px">${header}</td></tr>
<tr><td style="background:${colors.surface};border:1px solid ${colors.border};border-radius:${brand.radiusPx}px;padding:24px">
<h1 style="margin:0 0 16px;font-family:${heading};font-size:22px;line-height:1.3;color:${colors.text}">${escapeHtml(content.heading)}</h1>
${paragraphs}${button}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:${body};font-size:12px;line-height:1.5;color:${colors.muted}">Sent by ${name}.</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

  const text = [
    brand.name,
    "",
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.action && actionUrl ? [`${content.action.label}: ${actionUrl}`, ""] : []),
    `Sent by ${brand.name}.`,
  ].join("\n");

  return { html, text };
}
