import { describe, expect, it, vi } from "vitest";
import { parseWebhookUrl, postToSlack, slackMessage, webhookHint } from "./slack";

const valid = "https://hooks.slack.com/services/T000/B000/abcdefghijklmnop";

describe("parseWebhookUrl", () => {
  it("accepts Slack webhook URLs", () => {
    expect(parseWebhookUrl(`  ${valid} `)).toEqual({ ok: true, url: valid });
    expect(parseWebhookUrl("https://hooks.slack-gov.com/services/T/B/x").ok).toBe(true);
  });

  it("rejects anything that could reach another host", () => {
    for (const url of [
      "http://hooks.slack.com/services/T/B/x",
      "https://hooks.slack.com.evil.example/services/T/B/x",
      "https://hooks.slack.com:8443/services/T/B/x",
      "https://user:pass@hooks.slack.com/services/T/B/x",
      "https://hooks.slack.com/other/T/B/x",
      "https://hooks.slack.com/services/",
      "http://169.254.169.254/latest/meta-data",
      "not a url",
    ]) {
      expect(parseWebhookUrl(url, {}).ok, url).toBe(false);
    }
  });

  it("allows test origins only outside production", () => {
    const env = { SLACK_WEBHOOK_TEST_ORIGINS: "http://localhost:3199" };
    expect(parseWebhookUrl("http://localhost:3199/hook/1", env).ok).toBe(true);
    expect(
      parseWebhookUrl("http://localhost:3199/hook/1", { ...env, NODE_ENV: "production" }).ok,
    ).toBe(false);
  });
});

describe("webhookHint", () => {
  it("shows only the last four characters", () => {
    expect(webhookHint(valid)).toBe("…mnop");
  });
});

describe("slackMessage", () => {
  it("escapes Slack control characters in the content", () => {
    const message = slackMessage({
      headline: "Ticket #3 opened: <!channel> & co",
      lines: ["Mixer <HNE-000001>"],
      link: { label: "Open ticket #3", url: "https://app.example.com/tickets/1" },
    });
    expect(message.text).toBe("Ticket #3 opened: <!channel> & co");
    const text = JSON.stringify(message.blocks);
    expect(text).toContain("&lt;!channel&gt; &amp; co");
    expect(text).toContain("Mixer &lt;HNE-000001&gt;");
    expect(text).toContain("<https://app.example.com/tickets/1|Open ticket #3>");
  });
});

describe("postToSlack", () => {
  it("posts JSON and reports failures without the URL", async () => {
    const ok = vi.fn(async () => new Response("ok"));
    await postToSlack(valid, slackMessage({ headline: "Hi", lines: [] }), ok);
    expect(ok).toHaveBeenCalledOnce();

    const gone = vi.fn(async () => new Response("no_service", { status: 404 }));
    const error = await postToSlack(valid, slackMessage({ headline: "Hi", lines: [] }), gone).catch(
      (e: Error) => e,
    );
    expect(String(error)).toContain("no longer accepts this webhook");
    expect(String(error)).not.toContain("hooks.slack.com");
  });
});
