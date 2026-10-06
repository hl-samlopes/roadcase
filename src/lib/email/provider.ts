/**
 * Email delivery behind one small interface. Production sends through
 * Resend; locally and in e2e tests everything goes to Mailpit.
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  /** Always sent alongside the HTML. */
  text: string;
  html: string;
  attachments?: EmailAttachment[];
  /** Same for every attempt at one email, so a service that supports it never sends twice. */
  idempotencyKey?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: Uint8Array;
}

export interface EmailProvider {
  name: string;
  /** Resolves with the service's message id; throws when the message wasn't accepted. */
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

const DEFAULT_MAILPIT_URL = "http://localhost:8025";

/** Mailpit's HTTP send API (development and tests only). */
export function mailpitProvider(baseUrl: string, fetchImpl: typeof fetch = fetch): EmailProvider {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/api/v1/send`;
  const address = (a: EmailAddress) => ({ Email: a.email, Name: a.name ?? "" });
  return {
    name: "mailpit",
    async send(message) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: address(message.from),
          To: message.to.map(address),
          Subject: message.subject,
          Text: message.text,
          HTML: message.html,
          Attachments: (message.attachments ?? []).map((attachment) => ({
            Filename: attachment.filename,
            ContentType: attachment.contentType,
            Content: Buffer.from(attachment.content).toString("base64"),
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Mailpit rejected the message (HTTP ${response.status})`);
      const body = (await response.json().catch(() => ({}))) as { ID?: unknown };
      return { id: typeof body.ID === "string" ? body.ID : null };
    },
  };
}

/** "Name" <email>, with the name quoted so commas and quotes in it are safe. */
function formatAddress(address: EmailAddress) {
  const name = address.name?.replace(/["\\\r\n]/g, "").trim();
  return name ? `"${name}" <${address.email}>` : address.email;
}

/**
 * Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * The key is sent only in the Authorization header and never logged; errors
 * carry Resend's status and error name, not the message or the recipients.
 */
export function resendProvider(apiKey: string, fetchImpl: typeof fetch = fetch): EmailProvider {
  return {
    name: "resend",
    async send(message) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(message.idempotencyKey
            ? { "idempotency-key": message.idempotencyKey.slice(0, 256) }
            : {}),
        },
        body: JSON.stringify({
          from: formatAddress(message.from),
          to: message.to.map(formatAddress),
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: (message.attachments ?? []).map((attachment) => ({
            filename: attachment.filename,
            content_type: attachment.contentType,
            content: Buffer.from(attachment.content).toString("base64"),
          })),
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: unknown; name?: unknown };
      if (!response.ok) {
        const reason = typeof body.name === "string" ? `: ${body.name}` : "";
        throw new Error(`Resend rejected the message (HTTP ${response.status}${reason})`);
      }
      return { id: typeof body.id === "string" ? body.id : null };
    },
  };
}

type EmailEnv = Partial<
  Record<"EMAIL_PROVIDER" | "MAILPIT_URL" | "NODE_ENV" | "RESEND_API_KEY", string>
>;

/**
 * The provider named by EMAIL_PROVIDER. Outside production it defaults to
 * Mailpit; in production a missing or unknown provider is an error rather
 * than a silent drop.
 */
export function emailProviderFromEnv(env: EmailEnv = process.env): EmailProvider {
  const name = env.EMAIL_PROVIDER?.trim().toLowerCase() || "";
  if (name === "mailpit" || (!name && env.NODE_ENV !== "production")) {
    return mailpitProvider(env.MAILPIT_URL || DEFAULT_MAILPIT_URL);
  }
  if (name === "resend") {
    const key = env.RESEND_API_KEY?.trim();
    if (!key) throw new Error("EMAIL_PROVIDER is resend but RESEND_API_KEY is not set");
    return resendProvider(key);
  }
  throw new Error(
    name
      ? `Unknown EMAIL_PROVIDER "${name}"`
      : "No email service is configured (set EMAIL_PROVIDER)",
  );
}
