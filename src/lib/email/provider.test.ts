import { describe, expect, it, vi } from "vitest";
import { emailProviderFromEnv, mailpitProvider } from "./provider";

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
