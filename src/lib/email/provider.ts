/**
 * Email delivery behind one small interface, so the transactional email
 * service can be chosen later without touching the code that sends. Locally
 * and in e2e tests everything goes to Mailpit.
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

type EmailEnv = Partial<Record<"EMAIL_PROVIDER" | "MAILPIT_URL" | "NODE_ENV", string>>;

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
  throw new Error(
    name
      ? `Unknown EMAIL_PROVIDER "${name}"`
      : "No email service is configured (set EMAIL_PROVIDER)",
  );
}
