/**
 * Slack incoming webhooks: URL checks, message building and posting. Webhook
 * URLs are secrets; nothing here logs or returns one, and errors carry only
 * the HTTP status.
 */

const SLACK_HOSTS = new Set(["hooks.slack.com", "hooks.slack-gov.com"]);

type SlackEnv = Partial<Record<"NODE_ENV" | "SLACK_WEBHOOK_TEST_ORIGINS", string>>;

/**
 * Accepts only Slack's own webhook addresses, so a saved URL can never point
 * the server at an internal host. Outside production, SLACK_WEBHOOK_TEST_ORIGINS
 * (comma-separated origins) also allows a local stand-in for e2e tests.
 */
export function parseWebhookUrl(
  input: string,
  env: SlackEnv = process.env,
): { ok: true; url: string } | { ok: false; error: string } {
  const error =
    "Paste the webhook URL from Slack; it starts with https://hooks.slack.com/services/.";
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, error };
  }
  const testOrigins =
    env.NODE_ENV === "production"
      ? []
      : (env.SLACK_WEBHOOK_TEST_ORIGINS ?? "")
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean);
  const slack =
    url.protocol === "https:" &&
    SLACK_HOSTS.has(url.hostname) &&
    !url.port &&
    !url.username &&
    !url.password &&
    url.pathname.startsWith("/services/") &&
    url.pathname.length > "/services/".length;
  if (!slack && !testOrigins.includes(url.origin)) return { ok: false, error };
  return { ok: true, url: url.href };
}

/** The last few characters, enough to tell webhooks apart without revealing them. */
export function webhookHint(url: string): string {
  return `…${url.replace(/\/+$/, "").slice(-4)}`;
}

/** Escapes text for Slack's mrkdwn, which treats &, < and > as control characters. */
export function slackEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface SlackMessage {
  /** Plain fallback shown in notifications and by clients without blocks. */
  text: string;
  blocks: unknown[];
}

export function slackMessage(input: {
  headline: string;
  lines: string[];
  link?: { label: string; url: string };
}): SlackMessage {
  const body = [`*${slackEscape(input.headline)}*`, ...input.lines.map(slackEscape)];
  if (input.link) body.push(`<${input.link.url}|${slackEscape(input.link.label)}>`);
  return {
    text: input.headline,
    blocks: [{ type: "section", text: { type: "mrkdwn", text: body.join("\n") } }],
  };
}

export async function postToSlack(
  url: string,
  message: SlackMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // 404/410 mean the webhook was removed in Slack; say so plainly.
    const gone = response.status === 404 || response.status === 410;
    throw new Error(
      gone
        ? `Slack no longer accepts this webhook (HTTP ${response.status}); replace it in Settings > Notifications`
        : `Slack rejected the message (HTTP ${response.status})`,
    );
  }
}
