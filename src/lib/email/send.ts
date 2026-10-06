import "server-only";
import type { BodyFont, HeadingFont } from "@/generated/prisma/enums.ts";
import { displayName, getBranding, logoUrls } from "@/lib/branding";
import { db } from "@/lib/db";
import type { ParsedPayload } from "@/lib/jobs/queues";
import { resolveTheme } from "@/lib/theme/resolve";
import { renderBrandedEmail, type EmailBrand } from "./layout";
import { emailProviderFromEnv } from "./provider";
import { renderTemplate } from "./templates";

const fontNames: Record<HeadingFont | BodyFont, string> = {
  INTER: "Inter",
  SPACE_MONO: "Space Mono",
  KRUB: "Krub",
  PLUS_JAKARTA_SANS: "Plus Jakarta Sans",
};

/** Organization branding as emails use it: always the light colors. */
export async function emailBrand(organizationId: string): Promise<EmailBrand> {
  const branding = await getBranding(organizationId);
  const theme = resolveTheme(branding, null);
  return {
    name: displayName(branding),
    logoUrl: logoUrls(branding).light,
    colors: theme.light,
    headingFont: fontNames[theme.headingFont],
    bodyFont: fontNames[theme.bodyFont],
    radiusPx: theme.radiusPx,
  };
}

function fromAddress() {
  const address = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (address) return address;
  if (process.env.NODE_ENV === "production") throw new Error("EMAIL_FROM_ADDRESS is not set");
  return "no-reply@roadcase.localhost";
}

/**
 * Renders and sends one email in the organization's branding. Runs in the
 * worker from the email.send job; an email whose key was already sent is
 * skipped, so retries never send twice.
 */
export async function sendEmail(payload: ParsedPayload<"email.send">) {
  const sent = await db.sentEmail.findUnique({
    where: { idempotencyKey: payload.idempotencyKey },
    select: { id: true },
  });
  if (sent) return { skipped: true as const };

  const brand = await emailBrand(payload.organizationId);
  const content = renderTemplate(payload.template, payload.data, brand.name);
  const { html, text } = renderBrandedEmail(brand, content);
  const result = await emailProviderFromEnv().send({
    from: { email: fromAddress(), name: brand.name },
    to: [payload.to],
    subject: content.subject,
    text,
    html,
  });

  await db.sentEmail.create({
    data: {
      organizationId: payload.organizationId,
      idempotencyKey: payload.idempotencyKey,
      toAddress: payload.to.email.toLowerCase(),
      subject: content.subject,
      providerMessageId: result.id,
    },
  });
  return { skipped: false as const };
}
