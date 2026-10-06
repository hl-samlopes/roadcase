import { describe, expect, it, vi } from "vitest";
import { emailProviderFromEnv, mailpitProvider, resendProvider } from "./provider";

const message = {
  from: { email: "no-reply@example.com", name: "Roadcase" },
  to: [{ email: "pat@example.com" }],
  subject: "Hello",
  text: "Hi",
  html: "<p>Hi</p>",
};

describe("emailProviderFromEnv", () => {
  it("defaults to Mailpit outside production", () => {
    expect(emailProviderFromEnv({ NODE_ENV: "development" }).name).toBe("mailpit");
  });

  it("uses Resend when chosen, and needs its key", () => {
    expect(emailProviderFromEnv({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "re_x" }).name).toBe(
      "resend",
    );
    expect(() => emailProviderFromEnv({ EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("refuses to run without a provider in production", () => {
    expect(() => emailProviderFromEnv({ NODE_ENV: "production" })).toThrow(/EMAIL_PROVIDER/);
    expect(() => emailProviderFromEnv({ EMAIL_PROVIDER: "carrier-pigeon" })).toThrow(/Unknown/);
  });
});

describe("mailpitProvider", () => {
  it("posts the message to Mailpit's send API and returns its id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ID: "abc123" }));
    const result = await mailpitProvider("http://mailpit:8025/", fetchMock).send(message);
    expect(result).toEqual({ id: "abc123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://mailpit:8025/api/v1/send");
    expect(JSON.parse(init.body as string)).toMatchObject({
      From: { Email: "no-reply@example.com", Name: "Roadcase" },
      To: [{ Email: "pat@example.com", Name: "" }],
      Subject: "Hello",
      Text: "Hi",
      HTML: "<p>Hi</p>",
    });
  });

  it("throws when Mailpit rejects the message, so the job retries", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(mailpitProvider("http://mailpit:8025", fetchMock).send(message)).rejects.toThrow(
      "HTTP 500",
    );
  });
});

describe("resendProvider", () => {
  it("posts to Resend with the key, the idempotency key and attachments", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ id: "re-123" }),
    );
    const provider = resendProvider("re_secret", fetchMock as unknown as typeof fetch);
    const result = await provider.send({
      ...message,
      from: { email: "no-reply@example.com", name: 'Camp "North", Inc' },
      attachments: [
        { filename: "a.pdf", contentType: "application/pdf", content: new Uint8Array([1, 2]) },
      ],
      idempotencyKey: "contract:1:guest",
    });
    expect(result).toEqual({ id: "re-123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init!.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_secret");
    expect(headers["idempotency-key"]).toBe("contract:1:guest");
    const body = JSON.parse(init!.body as string);
    expect(body.from).toBe('"Camp North, Inc" <no-reply@example.com>');
    expect(body.to).toEqual(["pat@example.com"]);
    expect(body.attachments).toEqual([
      { filename: "a.pdf", content_type: "application/pdf", content: "AQI=" },
    ]);
  });

  it("throws on a rejection without echoing the key or the message", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { name: "validation_error", message: "pat@example.com is invalid" },
        { status: 422 },
      ),
    );
    const provider = resendProvider("re_secret", fetchMock as unknown as typeof fetch);
    const error = await provider.send(message).catch((e: Error) => e);
    expect(String(error)).toContain("HTTP 422: validation_error");
    expect(String(error)).not.toContain("re_secret");
    expect(String(error)).not.toContain("pat@example.com");
  });
});
